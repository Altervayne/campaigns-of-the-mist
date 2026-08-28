// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { MIXED, applyStylePatchToStrokes, foldStrokeStyle, isClosedShape, localBoundsCenter, strokesLocalBounds, strokesWorldAABB } from './strokeStyle';

// -- Type Imports --
import type { Stroke } from '@/lib/types/board';

/** A stroke with overridable style, for the fold / patch assertions. */
const makeStroke = (id: string, over: Partial<Stroke> = {}): Stroke => ({ id, brush: 'pen', color: null, width: 3, points: [0, 0, 10, 10], ...over });

/*
 * The pure style helpers behind the transform tool's style toolbar: the multi-stroke fold (with its mixed
 * marker), the patch apply (fill gated to closed shapes), and the local / world bounds the toolbar anchors on.
 */

describe('isClosedShape', () => {
   it('flags polygons and bounding-box shapes, not freehand or lines', () => {
      expect(isClosedShape({ shape: 'polygon' })).toBe(true);
      expect(isClosedShape({ shape: 'ellipse' })).toBe(true);
      expect(isClosedShape({ shape: 'rect' })).toBe(true);
      expect(isClosedShape({ shape: 'line' })).toBe(false);
      expect(isClosedShape({ shape: undefined })).toBe(false);
   });
});

describe('foldStrokeStyle', () => {
   it('folds a uniform selection to its shared values', () => {
      const strokes = [makeStroke('a', { color: '#ff0000', width: 5, brush: 'brush' }), makeStroke('b', { color: '#ff0000', width: 5, brush: 'brush' })];
      const fold = foldStrokeStyle(strokes, new Set(['a', 'b']));
      expect(fold).toMatchObject({ color: '#ff0000', width: 5, brush: 'brush', hasClosedShape: false });
   });

   it('marks disagreeing facets mixed', () => {
      const strokes = [makeStroke('a', { color: '#ff0000', width: 5, brush: 'pen' }), makeStroke('b', { color: '#00ff00', width: 5, brush: 'brush' })];
      const fold = foldStrokeStyle(strokes, new Set(['a', 'b']));
      expect(fold.color).toBe(MIXED);
      expect(fold.width).toBe(5);
      expect(fold.brush).toBe(MIXED);
   });

   it('ignores unselected strokes', () => {
      const strokes = [makeStroke('a', { width: 2 }), makeStroke('b', { width: 9 })];
      expect(foldStrokeStyle(strokes, new Set(['a'])).width).toBe(2);
   });

   it('folds fill over the closed shapes alone, never forced mixed by an outline stroke', () => {
      const strokes = [makeStroke('a', { shape: 'rect', filled: true }), makeStroke('b')]; // b is a plain freehand stroke
      const fold = foldStrokeStyle(strokes, new Set(['a', 'b']));
      expect(fold.hasClosedShape).toBe(true);
      expect(fold.filled).toBe(true);
   });

   it('marks fill mixed when the closed shapes disagree', () => {
      const strokes = [makeStroke('a', { shape: 'rect', filled: true }), makeStroke('b', { shape: 'ellipse' })];
      expect(foldStrokeStyle(strokes, new Set(['a', 'b'])).filled).toBe(MIXED);
   });

   it('reports no closed shape when the selection is all outlines', () => {
      const fold = foldStrokeStyle([makeStroke('a', { shape: 'line' })], new Set(['a']));
      expect(fold.hasClosedShape).toBe(false);
      expect(fold.filled).toBe(false);
   });
});

describe('applyStylePatchToStrokes', () => {
   it('applies color / width / brush to the selected strokes only', () => {
      const strokes = [makeStroke('a'), makeStroke('b')];
      const next = applyStylePatchToStrokes(strokes, new Set(['a']), { color: '#123456', width: 8, brush: 'highlighter' });
      expect(next[0]).toMatchObject({ color: '#123456', width: 8, brush: 'highlighter' });
      expect(next[1]).toBe(strokes[1]); // untouched keeps identity
   });

   it('stores an 8-digit hex verbatim', () => {
      const next = applyStylePatchToStrokes([makeStroke('a')], new Set(['a']), { color: '#12345680' });
      expect(next[0].color).toBe('#12345680');
   });

   it('fills a closed shape but never an outline stroke', () => {
      const strokes = [makeStroke('a', { shape: 'rect' }), makeStroke('b', { shape: 'line' })];
      const next = applyStylePatchToStrokes(strokes, new Set(['a', 'b']), { filled: true });
      expect(next[0].filled).toBe(true);
      expect(next[1].filled).toBeUndefined();
   });

   it('drops the fill field when cleared', () => {
      const next = applyStylePatchToStrokes([makeStroke('a', { shape: 'rect', filled: true })], new Set(['a']), { filled: false });
      expect('filled' in next[0]).toBe(false);
   });

   it('leaves points untouched', () => {
      const next = applyStylePatchToStrokes([makeStroke('a', { points: [1, 2, 3, 4] })], new Set(['a']), { width: 9 });
      expect(next[0].points).toEqual([1, 2, 3, 4]);
   });
});

describe('strokesLocalBounds', () => {
   it('unions the selected strokes point bounds', () => {
      const strokes = [makeStroke('a', { points: [0, 0, 10, 5] }), makeStroke('b', { points: [-4, 2, 6, 20] })];
      expect(strokesLocalBounds(strokes, new Set(['a', 'b']))).toEqual({ minX: -4, minY: 0, maxX: 10, maxY: 20 });
   });

   it('is null for an empty selection', () => {
      expect(strokesLocalBounds([makeStroke('a')], new Set())).toBeNull();
   });
});

describe('localBoundsCenter', () => {
   it('is the rect center', () => {
      expect(localBoundsCenter({ minX: 0, minY: 0, maxX: 10, maxY: 20 })).toEqual({ x: 5, y: 10 });
   });
});

describe('strokesWorldAABB', () => {
   it('offsets local bounds by the layer origin at rotation 0', () => {
      const strokes = [makeStroke('a', { points: [0, 0, 10, 10] })];
      const aabb = strokesWorldAABB({ x: 100, y: 50, width: 10, height: 10 }, strokes, new Set(['a']));
      expect(aabb).toEqual({ x: 100, y: 50, width: 10, height: 10 });
   });

   it('grows the AABB to enclose a rotated local rect', () => {
      const strokes = [makeStroke('a', { points: [0, 0, 10, 0, 10, 10, 0, 10] })];
      const aabb = strokesWorldAABB({ x: 0, y: 0, width: 10, height: 10, rotation: 45 }, strokes, new Set(['a']));
      // A 10x10 square turned 45deg about its center spans ~14.14 on each axis, centered on (5,5).
      expect(aabb!.width).toBeCloseTo(Math.SQRT2 * 10, 4);
      expect(aabb!.height).toBeCloseTo(Math.SQRT2 * 10, 4);
      expect(aabb!.x + aabb!.width / 2).toBeCloseTo(5, 4);
   });

   it('is null when the selection holds no point', () => {
      expect(strokesWorldAABB({ x: 0, y: 0, width: 10, height: 10 }, [makeStroke('a')], new Set())).toBeNull();
   });
});
