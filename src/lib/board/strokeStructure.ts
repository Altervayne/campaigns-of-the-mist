/*
 * Pure structural helpers for the stroke transform tool: reordering the selected strokes within a layer's
 * paint order (array order IS paint order) and duplicating them with fresh ids and a small offset. Kept free
 * of React / the store / id generation (the caller passes a `makeId`) so the splice + copy stay unit-testable.
 */

// -- Type Imports --
import type { Stroke } from '@/lib/types/board';

/** Local-frame nudge for a duplicated stroke, so its copy lands visibly beside the original (matches items). */
export const STROKE_DUPLICATE_OFFSET = 16;

/** Where a reorder moves the selected strokes within the layer's paint order. */
export type StrokeReorder = 'front' | 'back';

/** A structural op the transform toolbar dispatches on the selection: reorder, duplicate, or delete. */
export type StrokeStructureOp = StrokeReorder | 'duplicate' | 'delete';

/**
 * Reorders the selected strokes to the front (top, array end) or back (bottom, array start) of the layer's
 * paint order, preserving BOTH the selected group's relative order and the untouched strokes' order. A
 * selection that's empty or the whole layer leaves the array unchanged (nothing to move against).
 */
export function reorderStrokes(strokes: Stroke[], strokeIds: ReadonlySet<string>, edge: StrokeReorder): Stroke[] {
   const selected = strokes.filter((stroke) => strokeIds.has(stroke.id));
   if (selected.length === 0 || selected.length === strokes.length) return strokes;
   const rest = strokes.filter((stroke) => !strokeIds.has(stroke.id));
   return edge === 'front' ? [...rest, ...selected] : [...selected, ...rest];
}

/** Translates a stroke's flat [x,y,...] points by a local offset (even indices are x, odd are y). */
function offsetPoints(points: number[], dx: number, dy: number): number[] {
   return points.map((value, index) => (index % 2 === 0 ? value + dx : value + dy));
}

/**
 * Duplicates the selected strokes: each copy takes a fresh id (from `makeId`) and a small local offset, and
 * the copies append after the originals so they paint on top. Returns the full next strokes array plus the
 * copies' new ids (the post-duplicate selection). Preserves the selected group's relative order; the parallel
 * `pressure` array is cloned so the copy never shares points with its source.
 */
export function duplicateStrokes(
   strokes: Stroke[],
   strokeIds: ReadonlySet<string>,
   makeId: () => string,
   offset: number = STROKE_DUPLICATE_OFFSET,
): { strokes: Stroke[]; newIds: Set<string> } {
   const copies: Stroke[] = [];
   const newIds = new Set<string>();
   for (const stroke of strokes) {
      if (!strokeIds.has(stroke.id)) continue;
      const id = makeId();
      newIds.add(id);
      const copy: Stroke = { ...stroke, id, points: offsetPoints(stroke.points, offset, offset) };
      if (stroke.pressure) copy.pressure = [...stroke.pressure];
      copies.push(copy);
   }
   return { strokes: [...strokes, ...copies], newIds };
}
