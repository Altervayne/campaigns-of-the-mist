/*
 * Pure rotation math for board items. A rotatable box carries a `rotation` (degrees) applied as a
 * center-origin CSS `rotate()`, so the center is fixed under rotation and only the four corners swing.
 * The rotate gesture derives an angle from the pointer about that center; a resize on a rotated box
 * grows along the box's LOCAL axes and repositions so the opposite corner stays pinned in world space.
 *
 * Angles follow the CSS convention: `rotateVec` maps a LOCAL offset to a WORLD offset via the standard
 * matrix, and its inverse (negative degrees) maps a world delta back into the box frame. Everything here
 * is framework-free and unit-tested.
 */

// -- Utils Imports --
import { ROTATE_SNAP_DEG, pointerAngleDeg, rotateVec, snapAngle, type Vec2 } from '@/lib/geometry/vector';

// -- Type Imports --
import type { BoardItemKind } from '@/lib/types/board';

// The generic vector/angle primitives now live in the neutral geometry home (drawing + board share them);
// re-exported so existing `@/lib/board/boardRotation` importers keep working.
export { ROTATE_SNAP_DEG, pointerAngleDeg, rotateVec, snapAngle };
export type { Vec2 };

/** The free-form kinds that expose a rotate handle; everything structured stays un-rotatable. */
const ROTATABLE_KINDS: ReadonlySet<BoardItemKind> = new Set<BoardItemKind>(['post-it', 'image', 'text', 'drawing']);

/** Whether a kind can be rotated (gates both the handle and the toolbar angle field). */
export function isRotatableKind(kind: BoardItemKind): boolean {
   return ROTATABLE_KINDS.has(kind);
}

/** A positioned box in world coords. */
export interface BoxRect {
   x: number;
   y: number;
   width: number;
   height: number;
}

/** Wraps an angle into `[0, 360)`. */
export function normalizeAngle(deg: number): number {
   return ((deg % 360) + 360) % 360;
}

/**
 * World-px the top of a box rotated by `deg` rises above its unrotated top edge: the rotated bounding
 * box's half-height minus the plain half-height. Zero at 0 / 180 deg. Lets an UPRIGHT toolbar sit above
 * the rotated item's visual top instead of tilting with it.
 */
export function rotatedTopExtra(width: number, height: number, deg: number): number {
   const rad = (deg * Math.PI) / 180;
   const halfHeight = Math.abs((width / 2) * Math.sin(rad)) + Math.abs((height / 2) * Math.cos(rad));
   return halfHeight - height / 2;
}

/** Per-axis lower bounds for a rotated resize. */
export interface SizeFloor {
   width: number;
   height: number;
}

/**
 * A bottom-right resize on a box rotated by `rotationDeg`. The world drag delta is folded into the box's
 * LOCAL frame so the grip grows width/height along the box's own axes; x/y then shift so the OPPOSITE
 * (top-left) corner stays pinned in world under the center-origin rotation. At `rotationDeg = 0` this
 * reduces exactly to the unrotated grow-from-top-left path (x/y unchanged).
 */
export function rotatedResize(orig: BoxRect, worldDelta: Vec2, rotationDeg: number, min: SizeFloor): BoxRect {
   const local = rotateVec(worldDelta, -rotationDeg);
   const width = Math.max(min.width, orig.width + local.x);
   const height = Math.max(min.height, orig.height + local.y);

   const center = { x: orig.x + orig.width / 2, y: orig.y + orig.height / 2 };
   // The local top-left corner in world coords, from the ORIGINAL center + size; it must not move.
   const topLeft = {
      x: center.x + rotateVec({ x: -orig.width / 2, y: -orig.height / 2 }, rotationDeg).x,
      y: center.y + rotateVec({ x: -orig.width / 2, y: -orig.height / 2 }, rotationDeg).y,
   };
   // The new center places the pinned corner back at the same world point for the grown size.
   const half = rotateVec({ x: width / 2, y: height / 2 }, rotationDeg);
   const newCenter = { x: topLeft.x + half.x, y: topLeft.y + half.y };
   return { x: newCenter.x - width / 2, y: newCenter.y - height / 2, width, height };
}

/**
 * A drawing layer renders rotated about its box center, so refitting the box (which moves the center) rigidly
 * shifts the ink by (I - R)*(center change). Given the box before/after a refit and the layer's rotation,
 * returns the origin offset that cancels that shift - add it to the refit origin. Zero at rotation 0.
 */
export function rotatedRefitOffset(prev: BoxRect, next: BoxRect, rotationDeg: number): Vec2 {
   if (!rotationDeg) return { x: 0, y: 0 };
   const dc = {
      x: prev.x + prev.width / 2 - (next.x + next.width / 2),
      y: prev.y + prev.height / 2 - (next.y + next.height / 2),
   };
   const rotated = rotateVec(dc, rotationDeg);
   return { x: dc.x - rotated.x, y: dc.y - rotated.y };
}
