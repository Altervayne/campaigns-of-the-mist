/*
 * The drawing LAYER (board `DrawingBox` item) box math: growing / shrinking / merging the layer item that
 * wraps a stroke list, keeping the ink world-stable as its origin shifts. Board-item glue - it leans on the
 * item's `boardRotation` refit offset - so it sits with the board, over the surface-agnostic primitives in
 * `@/lib/drawing`.
 */

// -- Utils Imports --
import { rotatedRefitOffset } from './boardRotation';
import { pointsBounds, rebasePoints } from '@/lib/drawing/strokeGeometry';

// -- Type Imports --
import type { DrawingBoardContent, Stroke } from '@/lib/types/board';

/** The minimal drawing-layer shape the box math reads: its live origin plus its strokes. */
type DrawingBox = { x: number; y: number; content: DrawingBoardContent };

/** A resolved box (origin + size) plus the strokes re-based to that origin - the shape a layer grows/shrinks into. */
export interface DrawingBoxResult {
   x: number;
   y: number;
   width: number;
   height: number;
   strokes: Stroke[];
}

/** Folds a point list's bounds into a running union (null-safe both ways). */
function foldBounds(
   into: { minX: number; minY: number; maxX: number; maxY: number } | null,
   points: number[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
   const next = pointsBounds(points);
   if (!next) return into;
   if (!into) return next;
   return {
      minX: Math.min(into.minX, next.minX),
      minY: Math.min(into.minY, next.minY),
      maxX: Math.max(into.maxX, next.maxX),
      maxY: Math.max(into.maxY, next.maxY),
   };
}

/**
 * Grows a drawing layer to hold one more stroke. `strokeWorldPoints` is the new stroke in WORLD coords
 * (its ink position, stable under any re-basing); `makeStroke` stamps it into a layer-local stroke. The
 * new box is the union of every stroke over the new origin: when the origin holds (the stroke sits within
 * or below/right of it) the existing strokes are left untouched and only w/h grow; when the stroke reaches
 * up/left the origin shifts and every stroke re-bases to it, so the locals stay put on screen. Points stay
 * layer-local in the result; world is only the transient frame.
 */
export function appendStrokeToDrawing(
   item: DrawingBox,
   strokeWorldPoints: number[],
   makeStroke: (localPoints: number[]) => Stroke,
): DrawingBoxResult {
   const existing = item.content.strokes;
   // The new stroke into the current local frame (relative to the layer's current origin).
   const newLocal = rebasePoints(strokeWorldPoints, item.x, item.y);
   let bounds = foldBounds(null, newLocal);
   for (const stroke of existing) bounds = foldBounds(bounds, stroke.points);
   // No point anywhere (a degenerate stroke): keep the origin, zero the size, hold just the new stroke.
   if (!bounds) return { x: item.x, y: item.y, width: 0, height: 0, strokes: [makeStroke(newLocal)] };

   const shiftX = bounds.minX;
   const shiftY = bounds.minY;
   const width = bounds.maxX - bounds.minX;
   const height = bounds.maxY - bounds.minY;
   // Origin unchanged: append without re-basing the rest (the common, fast case).
   if (shiftX === 0 && shiftY === 0) {
      return { x: item.x, y: item.y, width, height, strokes: [...existing, makeStroke(newLocal)] };
   }
   // Origin moved up/left: re-base every stroke to the new origin so the ink holds still while the box grows.
   const strokes = existing.map((stroke) => ({ ...stroke, points: rebasePoints(stroke.points, shiftX, shiftY) }));
   strokes.push(makeStroke(rebasePoints(newLocal, shiftX, shiftY)));
   return { x: item.x + shiftX, y: item.y + shiftY, width, height, strokes };
}

/**
 * Shrinks a drawing layer back after a stroke is removed (an append's undo): drops the stroke by id,
 * re-fits the box to the union of the remaining strokes, and re-bases them to the tightened origin. The
 * inverse of {@link appendStrokeToDrawing} - the ink that stays holds its screen position. Callers append
 * onto a layer that always keeps at least its first stroke, so the remainder is non-empty in practice.
 */
export function recomputeDrawingBoxWithout(item: DrawingBox, strokeId: string): DrawingBoxResult {
   const remaining = item.content.strokes.filter((stroke) => stroke.id !== strokeId);
   let bounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
   for (const stroke of remaining) bounds = foldBounds(bounds, stroke.points);
   if (!bounds) return { x: item.x, y: item.y, width: 0, height: 0, strokes: remaining };

   const shiftX = bounds.minX;
   const shiftY = bounds.minY;
   const strokes =
      shiftX === 0 && shiftY === 0
         ? remaining
         : remaining.map((stroke) => ({ ...stroke, points: rebasePoints(stroke.points, shiftX, shiftY) }));
   return { x: item.x + shiftX, y: item.y + shiftY, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY, strokes };
}

/**
 * Shrinks a drawing layer after SEVERAL strokes are removed (an erase gesture's forward step): drops every
 * stroke whose id is in the set, re-fits the box to the survivors, and re-bases them to the tightened origin.
 * The multi-stroke {@link recomputeDrawingBoxWithout}. All strokes removed yields a zero box holding none -
 * the caller deletes the emptied layer instead of keeping it.
 */
export function recomputeDrawingBoxWithoutMany(item: DrawingBox, strokeIds: Set<string>): DrawingBoxResult {
   const remaining = item.content.strokes.filter((stroke) => !strokeIds.has(stroke.id));
   let bounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
   for (const stroke of remaining) bounds = foldBounds(bounds, stroke.points);
   if (!bounds) return { x: item.x, y: item.y, width: 0, height: 0, strokes: remaining };

   const shiftX = bounds.minX;
   const shiftY = bounds.minY;
   const strokes =
      shiftX === 0 && shiftY === 0
         ? remaining
         : remaining.map((stroke) => ({ ...stroke, points: rebasePoints(stroke.points, shiftX, shiftY) }));
   return { x: item.x + shiftX, y: item.y + shiftY, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY, strokes };
}

/**
 * Refits a drawing layer's box to `nextStrokes` and, for a ROTATED layer, offsets the origin so the ink stays
 * put: the layer renders rotated about its box center, so a plain refit that moves the center rigidly shifts
 * the whole layer. No-op at rotation 0. Both the optimistic store apply and the undo command call this, so
 * their box math stays byte-identical.
 */
export function recomputeDrawingBoxRotated(
   box: { x: number; y: number; width: number; height: number; rotation?: number },
   content: DrawingBoardContent,
   nextStrokes: Stroke[],
): DrawingBoxResult {
   const refit = recomputeDrawingBoxWithout({ x: box.x, y: box.y, content: { ...content, strokes: nextStrokes } }, '');
   const rotation = box.rotation ?? 0;
   if (!rotation) return refit;
   const offset = rotatedRefitOffset(
      { x: box.x, y: box.y, width: box.width, height: box.height },
      { x: refit.x, y: refit.y, width: refit.width, height: refit.height },
      rotation,
   );
   return { ...refit, x: refit.x + offset.x, y: refit.y + offset.y };
}

/**
 * Folds several drawing layers into `target` as one merged layer. Each source layer's strokes are taken to
 * WORLD coords (its ink position, origin-independent) and appended onto the target via
 * {@link appendStrokeToDrawing} - which unions the box and re-bases every stroke to the merged origin for
 * free - so the result's box is the union of every layer and its strokes stay in one local frame. `sources`
 * MUST run bottom -> top so the merged stroke order matches the paint order (the target's own strokes sit
 * lowest, then each source's in turn). Pure: the sources are read, never mutated.
 */
export function mergeDrawings(target: DrawingBox, sources: DrawingBox[]): DrawingBoxResult {
   // Seed from the target's own box (re-fit to a tight origin - a no-op for the always-tight drawing box),
   // then append every source stroke, in WORLD coords, onto the running result.
   let result = recomputeDrawingBoxWithout({ x: target.x, y: target.y, content: target.content }, '');
   for (const source of sources) {
      for (const stroke of source.content.strokes) {
         const world = rebasePoints(stroke.points, -source.x, -source.y);
         result = appendStrokeToDrawing(
            { x: result.x, y: result.y, content: { ...target.content, strokes: result.strokes } },
            world,
            (points) => ({ ...stroke, points }),
         );
      }
   }
   return result;
}
