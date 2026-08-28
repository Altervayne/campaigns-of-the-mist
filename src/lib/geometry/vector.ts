/*
 * Framework-free 2D vector + angle math, shared across the drawing engine and the board's item geometry.
 * Angles follow the CSS convention (y-down, atan2), so a rotation here matches a center-origin CSS `rotate()`.
 */

/** A 2D point / vector. */
export interface Vec2 {
   x: number;
   y: number;
}

/** The Shift-snap increment for the rotate gesture, in degrees. */
export const ROTATE_SNAP_DEG = 15;

/** The pointer's angle about a center, in degrees (atan2 in a y-down frame, matching CSS rotate). */
export function pointerAngleDeg(centerX: number, centerY: number, pointerX: number, pointerY: number): number {
   return (Math.atan2(pointerY - centerY, pointerX - centerX) * 180) / Math.PI;
}

/** Snaps an angle to the nearest multiple of `step` (degrees). */
export function snapAngle(deg: number, step: number): number {
   return Math.round(deg / step) * step;
}

/** Rotates a vector by `deg` degrees (local -> world under a center-origin CSS `rotate(deg)`). */
export function rotateVec(v: Vec2, deg: number): Vec2 {
   const rad = (deg * Math.PI) / 180;
   const cos = Math.cos(rad);
   const sin = Math.sin(rad);
   return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}
