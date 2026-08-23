/*
 * Pure affine math for transforming a drawing layer's strokes. A `Mat` is the six live cells of a 2D affine
 * matrix in SVG order - `[a, b, c, d, e, f]` maps a point to `(a*x + c*y + e, b*x + d*y + f)`. Points are the
 * flat `[x0,y0,x1,y1,...]` list the strokes store, so a matrix applies to a whole stroke in one pass.
 *
 * Phase 1 needs only translate (move), so that constructor plus `applyMatrixToPoints` and `multiply` (matrix
 * compose, for chaining transforms about a pivot later) live here. Scale/rotate/skew/flip join in a later phase.
 * Framework-free and unit-tested.
 */

/** A 2D affine matrix's six live cells, SVG order: `matrix(a, b, c, d, e, f)`. */
export type Mat = [number, number, number, number, number, number];

/** The identity matrix (a no-op transform). */
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** A pure translation by `(dx, dy)`. */
export function translate(dx: number, dy: number): Mat {
   return [1, 0, 0, 1, dx, dy];
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
