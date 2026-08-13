// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { alignPositions, distributePositions, type Rect } from './boardAlign';

/*
 * Alignment moves each rect's anchor to the selection bbox anchor on one axis; distribution spreads the
 * interior rects for equal adjacent-edge gaps with the extremes fixed. All coords are world units.
 */

// Three mixed-size rects with distinct positions on both axes.
const rects: Record<string, Rect> = {
   a: { x: 0, y: 0, width: 100, height: 20 },
   b: { x: 50, y: 40, width: 40, height: 60 },
   c: { x: 200, y: 90, width: 20, height: 30 },
};
// bbox: left 0, top 0, right 220, bottom 120.

describe('alignPositions', () => {
   it('aligns left to the bbox left edge, leaving y untouched', () => {
      const result = alignPositions(rects, 'left');
      expect(result.a).toEqual({ x: 0, y: 0 });
      expect(result.b).toEqual({ x: 0, y: 40 });
      expect(result.c).toEqual({ x: 0, y: 90 });
   });

   it('aligns center-x to the bbox center, leaving y untouched', () => {
      const result = alignPositions(rects, 'centerX');
      // bbox center-x = 110; each rect centered there.
      expect(result.a).toEqual({ x: 60, y: 0 });
      expect(result.b).toEqual({ x: 90, y: 40 });
      expect(result.c).toEqual({ x: 100, y: 90 });
   });

   it('aligns right to the bbox right edge, leaving y untouched', () => {
      const result = alignPositions(rects, 'right');
      // bbox right = 220; each rect's right edge meets it.
      expect(result.a).toEqual({ x: 120, y: 0 });
      expect(result.b).toEqual({ x: 180, y: 40 });
      expect(result.c).toEqual({ x: 200, y: 90 });
   });

   it('aligns top to the bbox top edge, leaving x untouched', () => {
      const result = alignPositions(rects, 'top');
      expect(result.a).toEqual({ x: 0, y: 0 });
      expect(result.b).toEqual({ x: 50, y: 0 });
      expect(result.c).toEqual({ x: 200, y: 0 });
   });

   it('aligns middle-y to the bbox center, leaving x untouched', () => {
      const result = alignPositions(rects, 'middleY');
      // bbox center-y = 60; each rect centered there.
      expect(result.a).toEqual({ x: 0, y: 50 });
      expect(result.b).toEqual({ x: 50, y: 30 });
      expect(result.c).toEqual({ x: 200, y: 45 });
   });

   it('aligns bottom to the bbox bottom edge, leaving x untouched', () => {
      const result = alignPositions(rects, 'bottom');
      // bbox bottom = 120; each rect's bottom edge meets it.
      expect(result.a).toEqual({ x: 0, y: 100 });
      expect(result.b).toEqual({ x: 50, y: 60 });
      expect(result.c).toEqual({ x: 200, y: 90 });
   });

   it('collapses two rects onto a shared left edge (sanity)', () => {
      const two: Record<string, Rect> = {
         a: { x: 10, y: 0, width: 30, height: 10 },
         b: { x: 90, y: 50, width: 30, height: 10 },
      };
      const result = alignPositions(two, 'left');
      expect(result.a.x).toBe(10);
      expect(result.b.x).toBe(10);
   });
});

/** The gap between each adjacent pair along the axis, in sorted-by-start order. */
function adjacentGaps(placed: { start: number; size: number }[]): number[] {
   const sorted = [...placed].sort((p, q) => p.start - q.start);
   const gaps: number[] = [];
   for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i].start - (sorted[i - 1].start + sorted[i - 1].size));
   return gaps;
}

describe('distributePositions', () => {
   it('spreads mixed-size rects to equal horizontal gaps with the extremes fixed', () => {
      // Widths 100/40/20; span 0..220 -> free space 60 over 2 gaps -> 30 each.
      const result = distributePositions(rects, 'horizontal');
      expect(result.a).toEqual({ x: 0, y: 0 });      // first extreme fixed
      expect(result.c).toEqual({ x: 200, y: 90 });   // last extreme fixed
      const gaps = adjacentGaps([
         { start: result.a.x, size: rects.a.width },
         { start: result.b.x, size: rects.b.width },
         { start: result.c.x, size: rects.c.width },
      ]);
      expect(gaps[0]).toBeCloseTo(gaps[1]);
      expect(gaps[0]).toBeCloseTo(30);
      // Only the axis coordinate moves; y is preserved.
      expect(result.b.y).toBe(40);
   });

   it('spreads mixed-size rects to equal vertical gaps with the extremes fixed', () => {
      // Heights 20/60/30; span 0..120 -> free space 10 over 2 gaps -> 5 each.
      const result = distributePositions(rects, 'vertical');
      expect(result.a).toEqual({ x: 0, y: 0 });
      expect(result.c).toEqual({ x: 200, y: 90 });
      const gaps = adjacentGaps([
         { start: result.a.y, size: rects.a.height },
         { start: result.b.y, size: rects.b.height },
         { start: result.c.y, size: rects.c.height },
      ]);
      expect(gaps[0]).toBeCloseTo(gaps[1]);
      expect(gaps[0]).toBeCloseTo(5);
      // x is preserved.
      expect(result.b.x).toBe(50);
   });

   it('is a no-op for two rects', () => {
      const two: Record<string, Rect> = {
         a: { x: 0, y: 0, width: 10, height: 10 },
         b: { x: 100, y: 100, width: 10, height: 10 },
      };
      expect(distributePositions(two, 'horizontal')).toEqual({ a: { x: 0, y: 0 }, b: { x: 100, y: 100 } });
   });

   it('is a no-op for a single rect', () => {
      const one: Record<string, Rect> = { a: { x: 5, y: 7, width: 10, height: 10 } };
      expect(distributePositions(one, 'vertical')).toEqual({ a: { x: 5, y: 7 } });
   });

   it('is a no-op for an empty set', () => {
      expect(distributePositions({}, 'horizontal')).toEqual({});
      expect(alignPositions({}, 'left')).toEqual({});
   });
});
