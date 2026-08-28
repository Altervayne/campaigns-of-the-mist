// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { IDENTITY, applyMatrixToPoints, flip, multiply, rotate, scale, skew, translate } from './strokeTransform';

// -- Type Imports --
import type { Mat } from './strokeTransform';

/** Applies a matrix to a single point, for the constructor assertions. */
const apply = (x: number, y: number, m: Mat): [number, number] => {
   const out = applyMatrixToPoints([x, y], m);
   return [out[0], out[1]];
};

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

describe('scale', () => {
   it('builds a per-axis scale about the origin', () => {
      expect(scale(2, 3)).toEqual([2, 0, 0, 3, 0, 0]);
      expect(apply(1, 1, scale(2, 3))).toEqual([2, 3]);
   });

   it('holds the pivot fixed and scales the rest about it', () => {
      const m = scale(2, 2, { x: 10, y: 10 });
      expect(apply(10, 10, m)).toEqual([10, 10]);
      expect(apply(11, 11, m)).toEqual([12, 12]);
   });

   it('mirrors an axis with a negative factor (a flip falls out of scale)', () => {
      expect(apply(2, 3, scale(-1, 1))).toEqual([-2, 3]);
      // About a pivot: negating x mirrors across the pivot's vertical line.
      expect(apply(12, 5, scale(-1, 1, { x: 10, y: 0 }))).toEqual([8, 5]);
   });
});

describe('rotate', () => {
   it('rotates about the origin by the CSS convention (y-down)', () => {
      const [x, y] = apply(1, 0, rotate(90));
      expect(x).toBeCloseTo(0);
      expect(y).toBeCloseTo(1);
   });

   it('holds the pivot fixed', () => {
      const m = rotate(180, { x: 1, y: 1 });
      const [px, py] = apply(1, 1, m);
      expect(px).toBeCloseTo(1);
      expect(py).toBeCloseTo(1);
      const [x, y] = apply(2, 1, m);
      expect(x).toBeCloseTo(0);
      expect(y).toBeCloseTo(1);
   });

   it('is the identity at zero degrees', () => {
      expect(apply(3, 7, rotate(0))).toEqual([3, 7]);
   });
});

describe('skew', () => {
   it('shears x proportional to y', () => {
      expect(apply(0, 1, skew(1, 0))).toEqual([1, 1]);
      expect(apply(2, 0, skew(1, 0))).toEqual([2, 0]);
   });

   it('shears y proportional to x', () => {
      expect(apply(1, 0, skew(0, 1))).toEqual([1, 1]);
   });

   it('shears about a pivot (a point on the pivot row does not move)', () => {
      // kx about pivot y=5: a point at y=5 has zero relative y, so it stays put.
      const m = skew(1, 0, { x: 0, y: 5 });
      expect(apply(3, 5, m)).toEqual([3, 5]);
      expect(apply(3, 6, m)).toEqual([4, 6]);
   });
});

describe('flip', () => {
   it("'x' negates x (a horizontal mirror), 'y' negates y", () => {
      expect(apply(2, 3, flip('x'))).toEqual([-2, 3]);
      expect(apply(2, 3, flip('y'))).toEqual([2, -3]);
   });

   it('mirrors across the pivot', () => {
      expect(apply(12, 3, flip('x', { x: 10, y: 0 }))).toEqual([8, 3]);
      expect(apply(2, 12, flip('y', { x: 0, y: 10 }))).toEqual([2, 8]);
   });
});
