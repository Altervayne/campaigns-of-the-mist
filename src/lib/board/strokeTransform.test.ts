// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { IDENTITY, applyMatrixToPoints, multiply, translate } from './strokeTransform';

// -- Type Imports --
import type { Mat } from './strokeTransform';

/*
 * The pure affine math behind the stroke transform tool: the translate constructor, the point-list apply, and
 * the matrix compose. The gesture wiring (the cursor layer) is verified by hand; these lock the arithmetic.
 */

describe('translate', () => {
   it('builds a pure translation matrix', () => {
      expect(translate(4, -3)).toEqual([1, 0, 0, 1, 4, -3]);
   });
});

describe('applyMatrixToPoints', () => {
   it('leaves points untouched under the identity', () => {
      expect(applyMatrixToPoints([1, 2, 3, 4], IDENTITY)).toEqual([1, 2, 3, 4]);
   });

   it('offsets every point by a translation', () => {
      expect(applyMatrixToPoints([0, 0, 10, 5], translate(2, 3))).toEqual([2, 3, 12, 8]);
   });

   it('applies the full affine cells (a*x + c*y + e, b*x + d*y + f)', () => {
      // A shear + scale + offset: proves each cell lands on the right axis.
      const m: Mat = [2, 0, 1, 3, 5, 7];
      expect(applyMatrixToPoints([1, 1], m)).toEqual([2 * 1 + 1 * 1 + 5, 0 * 1 + 3 * 1 + 7]);
   });

   it('returns a fresh list, never mutating the input', () => {
      const input = [1, 2, 3, 4];
      const out = applyMatrixToPoints(input, translate(1, 1));
      expect(out).not.toBe(input);
      expect(input).toEqual([1, 2, 3, 4]);
   });

   it('tolerates an empty list', () => {
      expect(applyMatrixToPoints([], translate(1, 1))).toEqual([]);
   });
});

describe('multiply', () => {
   it('is the identity when either factor is the identity', () => {
      const m: Mat = [2, 0, 0, 3, 4, 5];
      expect(multiply(IDENTITY, m)).toEqual(m);
      expect(multiply(m, IDENTITY)).toEqual(m);
   });

   it('sums two translations', () => {
      expect(multiply(translate(2, 3), translate(4, 5))).toEqual(translate(6, 8));
   });

   it('applies the right-hand matrix first (m1 after m2)', () => {
      // scale-by-2 (m1) after translate-by-(1,0) (m2): a point (0,0) -> (1,0) -> (2,0).
      const scale2: Mat = [2, 0, 0, 2, 0, 0];
      const composed = multiply(scale2, translate(1, 0));
      expect(applyMatrixToPoints([0, 0], composed)).toEqual([2, 0]);
      // Order matters: scale first, then translate leaves (0,0) at (1,0).
      const other = multiply(translate(1, 0), scale2);
      expect(applyMatrixToPoints([0, 0], other)).toEqual([1, 0]);
   });
});
