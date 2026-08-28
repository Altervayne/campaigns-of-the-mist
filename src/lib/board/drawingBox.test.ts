// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { appendStrokeToDrawing, mergeDrawings, recomputeDrawingBoxWithout, recomputeDrawingBoxWithoutMany } from './drawingBox';
import { rebasePoints } from '@/lib/drawing/strokeGeometry';
import { DEFAULT_STROKE_WIDTH } from '@/lib/drawing/constants';

// -- Type Imports --
import type { BrushKind, DrawingBoardContent, Stroke } from '@/lib/types/board';

/** A layer-local stroke fixture (only the fields the box math reads matter). Defaults to a pen stroke. */
function stroke(id: string, points: number[], brush: BrushKind = 'pen', width: number = DEFAULT_STROKE_WIDTH): Stroke {
   return { id, brush, color: null, width, points };
}

/** A minimal drawing layer at an origin, holding the given layer-local strokes. */
function layer(x: number, y: number, strokes: Stroke[]): { x: number; y: number; content: DrawingBoardContent } {
   return { x, y, content: { kind: 'drawing', strokes } };
}

/*
 * The drawing LAYER box math: growing / shrinking / merging the layer item that wraps a stroke list, keeping
 * the ink world-stable as its origin shifts. Board-item glue over the surface-agnostic stroke primitives.
 */

describe('recomputeDrawingBoxWithoutMany', () => {
   it('drops several strokes, re-fits the box, and re-bases the survivors', () => {
      // origin (-5,-8): survivor s1 at world (0,0)-(10,10); s2/s3 reach up/left and are erased.
      const item = layer(-5, -8, [stroke('s1', [5, 8, 15, 18]), stroke('s2', [0, 0, 8, 11]), stroke('s3', [0, 0, 1, 1])]);
      const next = recomputeDrawingBoxWithoutMany(item, new Set(['s2', 's3']));
      expect(next).toEqual({ x: 0, y: 0, width: 10, height: 10, strokes: [stroke('s1', [0, 0, 10, 10])] });
   });

   it('returns a zero box holding no stroke when every stroke is removed', () => {
      const item = layer(0, 0, [stroke('s1', [0, 0, 10, 10]), stroke('s2', [3, 3, 4, 4])]);
      expect(recomputeDrawingBoxWithoutMany(item, new Set(['s1', 's2']))).toEqual({ x: 0, y: 0, width: 0, height: 0, strokes: [] });
   });
});

describe('appendStrokeToDrawing', () => {
   const mint = (id: string) => (points: number[]) => stroke(id, points);

   it('grows width/height without re-basing when the stroke stays below/right of the origin', () => {
      const item = layer(0, 0, [stroke('s1', [0, 0, 10, 10])]);
      const next = appendStrokeToDrawing(item, [5, 5, 20, 20], mint('s2'));
      expect(next).toEqual({
         x: 0,
         y: 0,
         width: 20,
         height: 20,
         // The existing stroke is untouched (same object contents); the new one lands local to the held origin.
         strokes: [stroke('s1', [0, 0, 10, 10]), stroke('s2', [5, 5, 20, 20])],
      });
   });

   it('shifts the origin up/left and re-bases every stroke, holding the ink still on screen', () => {
      const item = layer(0, 0, [stroke('s1', [0, 0, 10, 10])]);
      const next = appendStrokeToDrawing(item, [-5, -8, 3, 3], mint('s2'));
      expect(next).toEqual({
         x: -5,
         y: -8,
         width: 15,
         height: 18,
         strokes: [stroke('s1', [5, 8, 15, 18]), stroke('s2', [0, 0, 8, 11])],
      });
      // Ink is world-stable: local + new origin recovers each stroke's original world coords.
      expect(rebasePoints(next.strokes[0].points, -next.x, -next.y)).toEqual([0, 0, 10, 10]);
      expect(rebasePoints(next.strokes[1].points, -next.x, -next.y)).toEqual([-5, -8, 3, 3]);
   });

   it('appends against a non-zero layer origin by converting the world stroke into the local frame', () => {
      const item = layer(100, 100, [stroke('s1', [0, 0, 10, 10])]); // world (100,100)-(110,110)
      const next = appendStrokeToDrawing(item, [105, 105, 130, 130], mint('s2'));
      expect(next).toEqual({
         x: 100,
         y: 100,
         width: 30,
         height: 30,
         strokes: [stroke('s1', [0, 0, 10, 10]), stroke('s2', [5, 5, 30, 30])],
      });
   });
});

describe('mergeDrawings', () => {
   it('unions the box and keeps the target\'s strokes first, then each source\'s, in order', () => {
      const target = layer(0, 0, [stroke('t1', [0, 0, 10, 10])]);
      // A far-away source (world (100,100)-(110,110)): the box grows to hold both, origin unchanged.
      const source = layer(100, 100, [stroke('s1', [0, 0, 10, 10])]);
      const merged = mergeDrawings(target, [source]);
      expect(merged).toEqual({
         x: 0,
         y: 0,
         width: 110,
         height: 110,
         strokes: [stroke('t1', [0, 0, 10, 10]), stroke('s1', [100, 100, 110, 110])],
      });
   });

   it('shifts the origin up/left and re-bases every stroke when a source reaches above/left', () => {
      const target = layer(0, 0, [stroke('t1', [0, 0, 10, 10])]);
      const source = layer(-20, -20, [stroke('s1', [0, 0, 5, 5])]); // world (-20,-20)-(-15,-15)
      const merged = mergeDrawings(target, [source]);
      expect(merged).toEqual({
         x: -20,
         y: -20,
         width: 30,
         height: 30,
         strokes: [stroke('t1', [20, 20, 30, 30]), stroke('s1', [0, 0, 5, 5])],
      });
      // The ink is world-stable: local + merged origin recovers each stroke's original world coords.
      expect(rebasePoints(merged.strokes[0].points, -merged.x, -merged.y)).toEqual([0, 0, 10, 10]);
      expect(rebasePoints(merged.strokes[1].points, -merged.x, -merged.y)).toEqual([-20, -20, -15, -15]);
   });

   it('folds several sources bottom -> top, preserving stroke stacking order', () => {
      const target = layer(0, 0, [stroke('t1', [0, 0, 1, 1])]);
      const lower = layer(0, 0, [stroke('a1', [0, 0, 1, 1])]);
      const upper = layer(0, 0, [stroke('b1', [0, 0, 1, 1])]);
      const merged = mergeDrawings(target, [lower, upper]);
      expect(merged.strokes.map((s) => s.id)).toEqual(['t1', 'a1', 'b1']);
      expect({ x: merged.x, y: merged.y, width: merged.width, height: merged.height }).toEqual({ x: 0, y: 0, width: 1, height: 1 });
   });

   it('carries every stroke of a multi-stroke source', () => {
      const target = layer(0, 0, [stroke('t1', [0, 0, 4, 4])]);
      const source = layer(0, 0, [stroke('s1', [0, 0, 2, 2]), stroke('s2', [1, 1, 3, 3])]);
      const merged = mergeDrawings(target, [source]);
      expect(merged.strokes.map((s) => s.id)).toEqual(['t1', 's1', 's2']);
   });
});

describe('recomputeDrawingBoxWithout', () => {
   it('re-fits the box to the remaining strokes and re-bases them (the inverse of an up/left append)', () => {
      // The layer left by the up/left append above: origin (-5,-8), two strokes.
      const item = layer(-5, -8, [stroke('s1', [5, 8, 15, 18]), stroke('s2', [0, 0, 8, 11])]);
      const next = recomputeDrawingBoxWithout(item, 's2');
      expect(next).toEqual({ x: 0, y: 0, width: 10, height: 10, strokes: [stroke('s1', [0, 0, 10, 10])] });
   });

   it('leaves the box untouched when the removed stroke was inside the extent', () => {
      const item = layer(0, 0, [stroke('s1', [0, 0, 10, 10]), stroke('s2', [3, 3, 4, 4])]);
      const next = recomputeDrawingBoxWithout(item, 's2');
      expect(next).toEqual({ x: 0, y: 0, width: 10, height: 10, strokes: [stroke('s1', [0, 0, 10, 10])] });
   });
});
