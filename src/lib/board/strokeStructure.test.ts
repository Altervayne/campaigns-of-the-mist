// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { STROKE_DUPLICATE_OFFSET, duplicateStrokes, reorderStrokes } from './strokeStructure';

// -- Type Imports --
import type { Stroke } from '@/lib/types/board';

/** A stroke with overridable geometry, for the reorder / duplicate assertions. */
const makeStroke = (id: string, over: Partial<Stroke> = {}): Stroke => ({ id, brush: 'pen', color: null, width: 3, points: [0, 0, 10, 10], ...over });

const ids = (strokes: Stroke[]) => strokes.map((stroke) => stroke.id);

/*
 * The pure structural helpers behind the transform tool's toolbar: the paint-order splice (front / back,
 * relative order held) and the offset duplicate (fresh ids, points nudged, pressure cloned).
 */
describe('reorderStrokes', () => {
   const strokes = [makeStroke('a'), makeStroke('b'), makeStroke('c'), makeStroke('d')];

   it('moves the selection to the array end (front / top) preserving both orders', () => {
      expect(ids(reorderStrokes(strokes, new Set(['a', 'c']), 'front'))).toEqual(['b', 'd', 'a', 'c']);
   });

   it('moves the selection to the array start (back / bottom) preserving both orders', () => {
      expect(ids(reorderStrokes(strokes, new Set(['b', 'd']), 'back'))).toEqual(['b', 'd', 'a', 'c']);
   });

   it('keeps the selected group in its own relative order when moved', () => {
      expect(ids(reorderStrokes(strokes, new Set(['c', 'a']), 'front'))).toEqual(['b', 'd', 'a', 'c']);
   });

   it('is a no-op for an empty selection or a whole-layer selection', () => {
      expect(reorderStrokes(strokes, new Set(), 'front')).toBe(strokes);
      expect(reorderStrokes(strokes, new Set(['a', 'b', 'c', 'd']), 'back')).toBe(strokes);
   });
});

describe('duplicateStrokes', () => {
   it('appends offset copies with fresh ids and returns their new ids', () => {
      const strokes = [makeStroke('a', { points: [0, 0, 10, 20] }), makeStroke('b')];
      let n = 0;
      const { strokes: next, newIds } = duplicateStrokes(strokes, new Set(['a']), () => `copy${n++}`);
      expect(ids(next)).toEqual(['a', 'b', 'copy0']);
      expect([...newIds]).toEqual(['copy0']);
      // The copy is nudged by the offset on both axes; the original is untouched.
      expect(next[2].points).toEqual([STROKE_DUPLICATE_OFFSET, STROKE_DUPLICATE_OFFSET, 10 + STROKE_DUPLICATE_OFFSET, 20 + STROKE_DUPLICATE_OFFSET]);
      expect(next[0].points).toEqual([0, 0, 10, 20]);
   });

   it('duplicates a multi-selection in its original relative order', () => {
      const strokes = [makeStroke('a'), makeStroke('b'), makeStroke('c')];
      let n = 0;
      const { strokes: next } = duplicateStrokes(strokes, new Set(['a', 'c']), () => `copy${n++}`);
      expect(ids(next)).toEqual(['a', 'b', 'c', 'copy0', 'copy1']);
   });

   it('clones the pressure array instead of sharing the source reference', () => {
      const strokes = [makeStroke('a', { pressure: [0.5, 0.9] })];
      const { strokes: next } = duplicateStrokes(strokes, new Set(['a']), () => 'copy');
      expect(next[1].pressure).toEqual([0.5, 0.9]);
      expect(next[1].pressure).not.toBe(strokes[0].pressure);
   });

   it('honors a caller-supplied offset', () => {
      const strokes = [makeStroke('a', { points: [1, 2] })];
      const { strokes: next } = duplicateStrokes(strokes, new Set(['a']), () => 'copy', 5);
      expect(next[1].points).toEqual([6, 7]);
   });
});
