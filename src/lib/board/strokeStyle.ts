/*
 * Pure style helpers for the stroke transform tool's style toolbar: folding one style value across a
 * multi-stroke selection (with a "mixed" marker when they disagree), applying a style patch to the
 * selected strokes, and the selection's bounds in local / world space (the toolbar's anchor). Kept free
 * of React/store so the fold + patch stay unit-testable.
 */

// -- Utils Imports --
import { pointsBounds, type WorldRect } from './drawingStyle';
import { rotateVec } from './boardRotation';

// -- Type Imports --
import type { BrushKind, Stroke } from '@/lib/types/board';
import type { Point } from './boardConnections';

/** Marks a field the selection disagrees on (its strokes hold different values). */
export const MIXED = 'mixed';
export type Mixed = typeof MIXED;

/** A layer frame the world-bounds map reads: origin, size, and its own center-origin rotation. */
export interface StrokeStyleLayerFrame {
   x: number;
   y: number;
   width: number;
   height: number;
   rotation?: number;
}

/** A style edit to fold onto the selected strokes; an absent field leaves that facet untouched. */
export interface StrokeStylePatch {
   color?: string | null;
   width?: number;
   brush?: BrushKind;
   filled?: boolean;
}

/** The selection's folded style: one value per facet, or `MIXED` when its strokes disagree. */
export interface StrokeStyleFold {
   color: string | null | Mixed;
   width: number | Mixed;
   brush: BrushKind | Mixed;
   /** Folded over the closed-shape strokes only (the fill toggle's scope); `false` when none are filled. */
   filled: boolean | Mixed;
   /** Whether any selected stroke is a closed shape (polygon / ellipse / rect) - so the fill toggle shows. */
   hasClosedShape: boolean;
}

/** A closed shape whose interior can be filled: a polygon or a bounding-box ellipse / rect. */
export function isClosedShape(stroke: Pick<Stroke, 'shape'>): boolean {
   return stroke.shape === 'polygon' || stroke.shape === 'ellipse' || stroke.shape === 'rect';
}

/** Folds one facet across a list: the shared value, or `MIXED` when any two differ (empty -> the fallback). */
function foldField<T>(values: T[], fallback: T): T | Mixed {
   if (values.length === 0) return fallback;
   const first = values[0];
   return values.every((value) => value === first) ? first : MIXED;
}

/**
 * Folds the selected strokes' style into one value per facet, marking a facet `MIXED` where they disagree.
 * `filled` folds over the closed-shape strokes alone (its toggle's scope), so an unfillable stroke in the
 * selection never forces it to "mixed". An empty selection folds to the neutral defaults.
 */
export function foldStrokeStyle(strokes: Stroke[], strokeIds: ReadonlySet<string>): StrokeStyleFold {
   const selected = strokes.filter((stroke) => strokeIds.has(stroke.id));
   const closed = selected.filter(isClosedShape);
   return {
      color: foldField(selected.map((stroke) => stroke.color), null),
      width: foldField(selected.map((stroke) => stroke.width), 0),
      brush: foldField(selected.map((stroke) => stroke.brush), 'pen'),
      filled: closed.length === 0 ? false : foldField(closed.map((stroke) => !!stroke.filled), false),
      hasClosedShape: closed.length > 0,
   };
}

/**
 * Applies a style patch to the selected strokes, leaving the rest and every point untouched. `filled` lands
 * only on closed shapes (an outline stroke has no interior), and a false `filled` drops the field so a
 * cleared shape matches a never-filled one. Returns a fresh array; only the patched strokes get new identity.
 */
export function applyStylePatchToStrokes(strokes: Stroke[], strokeIds: ReadonlySet<string>, patch: StrokeStylePatch): Stroke[] {
   return strokes.map((stroke) => {
      if (!strokeIds.has(stroke.id)) return stroke;
      const next: Stroke = { ...stroke };
      if (patch.color !== undefined) next.color = patch.color;
      if (patch.width !== undefined) next.width = patch.width;
      if (patch.brush !== undefined) next.brush = patch.brush;
      if (patch.filled !== undefined && isClosedShape(stroke)) {
         if (patch.filled) next.filled = true;
         else delete next.filled;
      }
      return next;
   });
}

/** The selected strokes' union bounds in the layer's LOCAL frame (relative to its origin), or null when empty. */
export function strokesLocalBounds(strokes: Stroke[], strokeIds: ReadonlySet<string>): WorldRect | null {
   let box: WorldRect | null = null;
   for (const stroke of strokes) {
      if (!strokeIds.has(stroke.id)) continue;
      const b = pointsBounds(stroke.points);
      if (!b) continue;
      box = box
         ? { minX: Math.min(box.minX, b.minX), minY: Math.min(box.minY, b.minY), maxX: Math.max(box.maxX, b.maxX), maxY: Math.max(box.maxY, b.maxY) }
         : b;
   }
   return box;
}

/** The center of a local-bounds rect - the pivot a group flip mirrors about. */
export function localBoundsCenter(bounds: WorldRect): Point {
   return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

/**
 * The selection's WORLD axis-aligned bounding box (origin + size), the upright toolbar's anchor. A rotated
 * layer's local bounds are a tilted rect in world space, so its four corners map to world (about the layer
 * center) and their min/max forms the AABB. Null when the selection holds no point.
 */
export function strokesWorldAABB(frame: StrokeStyleLayerFrame, strokes: Stroke[], strokeIds: ReadonlySet<string>): { x: number; y: number; width: number; height: number } | null {
   const local = strokesLocalBounds(strokes, strokeIds);
   if (!local) return null;
   const rotation = frame.rotation ?? 0;
   const corners: Point[] = [
      { x: local.minX, y: local.minY },
      { x: local.maxX, y: local.minY },
      { x: local.maxX, y: local.maxY },
      { x: local.minX, y: local.maxY },
   ];
   const world = corners.map((corner) => localToWorld(frame, corner, rotation));
   const xs = world.map((p) => p.x);
   const ys = world.map((p) => p.y);
   const minX = Math.min(...xs);
   const minY = Math.min(...ys);
   return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/** Maps a layer-local point to world, applying the layer's center-origin rotation. */
function localToWorld(frame: StrokeStyleLayerFrame, local: Point, rotation: number): Point {
   if (!rotation) return { x: local.x + frame.x, y: local.y + frame.y };
   const cx = frame.width / 2;
   const cy = frame.height / 2;
   const rotated = rotateVec({ x: local.x - cx, y: local.y - cy }, rotation);
   return { x: frame.x + cx + rotated.x, y: frame.y + cy + rotated.y };
}
