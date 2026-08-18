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

// -- Type Imports --
import type { BoardItemKind } from '@/lib/types/board';

/** The free-form kinds that expose a rotate handle; everything structured stays un-rotatable. */
const ROTATABLE_KINDS: ReadonlySet<BoardItemKind> = new Set<BoardItemKind>(['post-it', 'image', 'text', 'drawing']);

/** Whether a kind can be rotated (gates both the handle and the toolbar angle field). */
export function isRotatableKind(kind: BoardItemKind): boolean {
   return ROTATABLE_KINDS.has(kind);
}

/** The Shift-snap increment for the rotate gesture, in degrees. */
export const ROTATE_SNAP_DEG = 15;

/** A 2D point / vector. */
export interface Vec2 {
   x: number;
   y: number;
}

/** A positioned box in world coords. */
export interface BoxRect {
   x: number;
   y: number;
   width: number;
   height: number;
}

/** The pointer's angle about a center, in degrees (atan2 in a y-down frame, matching CSS rotate). */
export function pointerAngleDeg(centerX: number, centerY: number, pointerX: number, pointerY: number): number {
   return (Math.atan2(pointerY - centerY, pointerX - centerX) * 180) / Math.PI;
}

/** Snaps an angle to the nearest multiple of `step` (degrees). */
export function snapAngle(deg: number, step: number): number {
   return Math.round(deg / step) * step;
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

/** Rotates a vector by `deg` degrees (local -> world under a center-origin CSS `rotate(deg)`). */
export function rotateVec(v: Vec2, deg: number): Vec2 {
   const rad = (deg * Math.PI) / 180;
   const cos = Math.cos(rad);
   const sin = Math.sin(rad);
   return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
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
