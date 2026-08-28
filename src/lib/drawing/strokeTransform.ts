/*
 * Pure affine math for transforming a drawing layer's strokes. A `Mat` is the six live cells of a 2D affine
 * matrix in SVG order - `[a, b, c, d, e, f]` maps a point to `(a*x + c*y + e, b*x + d*y + f)`. Points are the
 * flat `[x0,y0,x1,y1,...]` list the strokes store, so a matrix applies to a whole stroke in one pass.
 *
 * The free-transform box builds its move/scale/rotate/skew/flip from these constructors: each takes an
 * optional pivot and composes `T(p) · core · T(-p)` so the transform runs about that point (an opposite
 * corner, a box center). The rotate core reuses `rotateVec` so its convention matches the item rotation.
 * Framework-free and unit-tested.
 */

// -- Utils Imports --
import { rotateVec, type Vec2 } from '@/lib/geometry/vector';

/** A 2D affine matrix's six live cells, SVG order: `matrix(a, b, c, d, e, f)`. */
export type Mat = [number, number, number, number, number, number];

/** The identity matrix (a no-op transform). */
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** A pure translation by `(dx, dy)`. */
export function translate(dx: number, dy: number): Mat {
   return [1, 0, 0, 1, dx, dy];
}

/** Wraps a core transform to run about a pivot: `T(p) · core · T(-p)`. No pivot leaves the core unchanged. */
function aboutPivot(core: Mat, about?: Vec2): Mat {
   if (!about) return core;
   return multiply(multiply(translate(about.x, about.y), core), translate(-about.x, -about.y));
}

/** A scale by `(sx, sy)`, optionally about a pivot. A negative factor mirrors that axis (a flip). */
export function scale(sx: number, sy: number, about?: Vec2): Mat {
   return aboutPivot([sx, 0, 0, sy, 0, 0], about);
}

/** A rotation by `deg` degrees (CSS convention, via `rotateVec`), optionally about a pivot. */
export function rotate(deg: number, about?: Vec2): Mat {
   // The core's columns are the images of the basis vectors, so it matches the item-rotation convention.
   const ex = rotateVec({ x: 1, y: 0 }, deg);
   const ey = rotateVec({ x: 0, y: 1 }, deg);
   return aboutPivot([ex.x, ex.y, ey.x, ey.y, 0, 0], about);
}

/** A skew mapping `(x, y) -> (x + kx*y, y + ky*x)`, optionally about a pivot. */
export function skew(kx: number, ky: number, about?: Vec2): Mat {
   return aboutPivot([1, ky, kx, 1, 0, 0], about);
}

/** A mirror across the pivot's `'x'` (negate x, a horizontal flip) or `'y'` (negate y, a vertical flip) axis. */
export function flip(axis: 'x' | 'y', about?: Vec2): Mat {
   return axis === 'x' ? scale(-1, 1, about) : scale(1, -1, about);
}

/**
 * Composes two matrices: `multiply(m1, m2)` is the transform that applies `m2` first, then `m1` (the standard
 * matrix product `m1 · m2`). Lets transforms about a pivot chain as `T(p) · core · T(-p)`.
 */
export function multiply(m1: Mat, m2: Mat): Mat {
   const [a1, b1, c1, d1, e1, f1] = m1;
   const [a2, b2, c2, d2, e2, f2] = m2;
   return [
      a1 * a2 + c1 * b2,
      b1 * a2 + d1 * b2,
      a1 * c2 + c1 * d2,
      b1 * c2 + d1 * d2,
      a1 * e2 + c1 * f2 + e1,
      b1 * e2 + d1 * f2 + f1,
   ];
}

/** Applies a matrix to a flat `[x0,y0,x1,y1,...]` point list, returning a fresh list of the same length. */
export function applyMatrixToPoints(points: number[], m: Mat): number[] {
   const [a, b, c, d, e, f] = m;
   const out = new Array<number>(points.length);
   for (let i = 0; i < points.length - 1; i += 2) {
      const x = points[i];
      const y = points[i + 1];
      out[i] = a * x + c * y + e;
      out[i + 1] = b * x + d * y + f;
   }
   return out;
}
