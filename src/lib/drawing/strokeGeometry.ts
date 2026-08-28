/*
 * Pure stroke geometry: world bounds, world<->local rebasing, the shape-tool vertex generators (regular
 * polygon, ellipse ring, bounding-box corners), and the eraser/marquee hit-tests. Kept free of React/store
 * so the math is unit-testable. Shapes store only their raw samples (or a two-corner box), so the box
 * helpers here also back the paint + hit-test paths.
 */

// -- Utils Imports --
import { SHAPE_ELLIPSE_SEGMENTS } from './constants';

// -- Type Imports --
import type { Stroke } from './types';

/** The world-space bounds of a flat `[x0,y0,x1,y1,...]` point list, or null when it holds no point. */
export function pointsBounds(points: number[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
   if (points.length < 2) return null;
   let minX = Infinity;
   let minY = Infinity;
   let maxX = -Infinity;
   let maxY = -Infinity;
   for (let i = 0; i < points.length - 1; i += 2) {
      const x = points[i];
      const y = points[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
   }
   return { minX, minY, maxX, maxY };
}

/** Rebases a flat point list by subtracting an origin (world -> layer-local, or the inverse with a negated origin). */
export function rebasePoints(points: number[], originX: number, originY: number): number[] {
   const out = new Array<number>(points.length);
   for (let i = 0; i < points.length - 1; i += 2) {
      out[i] = points[i] - originX;
      out[i + 1] = points[i + 1] - originY;
   }
   return out;
}

/**
 * Snaps the A->B direction to the nearest multiple of `stepRad`, keeping the segment's length. Used for the
 * shape tools' angle constraint (Shift). A zero-length segment has no direction, so B is returned unchanged.
 */
export function snapAngle(ax: number, ay: number, bx: number, by: number, stepRad: number): { x: number; y: number } {
   const dx = bx - ax;
   const dy = by - ay;
   const len = Math.hypot(dx, dy);
   if (len === 0) return { x: bx, y: by };
   const snapped = Math.round(Math.atan2(dy, dx) / stepRad) * stepRad;
   return { x: ax + Math.cos(snapped) * len, y: ay + Math.sin(snapped) * len };
}

/**
 * The vertices of a regular N-gon, flat `[x0,y0,x1,y1,...]`. `radius` is the circumradius (center to a
 * vertex) and `rotation` turns the whole polygon; at rotation 0 the first vertex points straight up. Vertex
 * i sits at `rotation - PI/2 + i*(2PI/sides)`. A zero radius collapses every vertex onto the center. The
 * shared source for the drag preview AND the committed stroke, so the two can never disagree.
 */
export function regularPolygonVertices(cx: number, cy: number, radius: number, sides: number, rotation: number): number[] {
   const out = new Array<number>(sides * 2);
   const step = (2 * Math.PI) / sides;
   for (let i = 0; i < sides; i++) {
      const angle = rotation - Math.PI / 2 + i * step;
      out[i * 2] = cx + radius * Math.cos(angle);
      out[i * 2 + 1] = cy + radius * Math.sin(angle);
   }
   return out;
}

/**
 * The two box corners for a bounding-box shape drag, anchored at A. Freed = A->B verbatim (an
 * ellipse/rectangle). Constrained = equal axes (a circle/square): the side is the larger drag extent, and
 * B keeps the cursor's quadrant off A (sign defaults to +1 on a zero extent). Returns `[ax,ay,bx,by]`.
 */
export function shapeBoxCorners(ax: number, ay: number, bx: number, by: number, constrained: boolean): number[] {
   if (!constrained) return [ax, ay, bx, by];
   const dx = bx - ax;
   const dy = by - ay;
   const side = Math.max(Math.abs(dx), Math.abs(dy));
   const sx = dx < 0 ? -1 : 1;
   const sy = dy < 0 ? -1 : 1;
   return [ax, ay, ax + sx * side, ay + sy * side];
}

/** The min/max box over a two-corner `[ax,ay,bx,by]` list, so a reversed or re-based corner pair normalizes. */
export function shapeBox(points: number[]): { x0: number; y0: number; x1: number; y1: number } {
   const ax = points[0] ?? 0;
   const ay = points[1] ?? 0;
   const bx = points[2] ?? ax;
   const by = points[3] ?? ay;
   return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
}

/** The four box corners (clockwise from top-left) of a two-corner shape, flat `[x0,y0,...]`. */
export function shapeRectCorners(points: number[]): number[] {
   const { x0, y0, x1, y1 } = shapeBox(points);
   return [x0, y0, x1, y0, x1, y1, x0, y1];
}

/**
 * The vertices of an ellipse sampled to `segments` points, flat `[x0,y0,...]`. Vertex i sits at angle
 * `i*(2PI/segments)` on the axes `rx`/`ry` about the center. A zero radius collapses every vertex onto the
 * center. The shared ring for the brush outline AND the eraser hit-test, so the two can never disagree.
 */
export function ellipseVertices(cx: number, cy: number, rx: number, ry: number, segments: number): number[] {
   const out = new Array<number>(segments * 2);
   const step = (2 * Math.PI) / segments;
   for (let i = 0; i < segments; i++) {
      const angle = i * step;
      out[i * 2] = cx + rx * Math.cos(angle);
      out[i * 2 + 1] = cy + ry * Math.sin(angle);
   }
   return out;
}

/** The ellipse ring of a two-corner shape, sampled at {@link SHAPE_ELLIPSE_SEGMENTS}. */
export function shapeEllipseRing(points: number[]): number[] {
   const { x0, y0, x1, y1 } = shapeBox(points);
   return ellipseVertices((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, SHAPE_ELLIPSE_SEGMENTS);
}

/** True when a line's two endpoints sit within `min` world px - a near-zero drag to discard on commit. */
export function isLineDegenerate(points: number[], min: number): boolean {
   if (points.length < 4) return true;
   return Math.hypot(points[2] - points[0], points[3] - points[1]) < min;
}

/** Even-odd ray cast: true when (px,py) lies inside the closed polygon over a flat `[x0,y0,...]` vertex list. */
function pointInPolygon(px: number, py: number, points: number[]): boolean {
   const n = Math.floor(points.length / 2);
   let inside = false;
   for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = points[i * 2];
      const yi = points[i * 2 + 1];
      const xj = points[j * 2];
      const yj = points[j * 2 + 1];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
   }
   return inside;
}

/** Squared distance from point (px,py) to the segment (ax,ay)-(bx,by). A zero-length segment reads as its endpoint. */
function pointSegmentDistanceSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
   const dx = bx - ax;
   const dy = by - ay;
   const lenSq = dx * dx + dy * dy;
   if (lenSq === 0) {
      const ex = px - ax;
      const ey = py - ay;
      return ex * ex + ey * ey;
   }
   let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
   t = Math.max(0, Math.min(1, t));
   const cx = ax + t * dx;
   const cy = ay + t * dy;
   const ex = px - cx;
   const ey = py - cy;
   return ex * ex + ey * ey;
}

/**
 * True when a world point lands on a stroke's inked band: the point-to-polyline distance over the stroke's
 * RAW sample points (not the smoothed bezier - cheaper, close enough for a scrub) is within half the stroke
 * width plus `tolerance`. `item` supplies the layer origin, since points are layer-local; the test runs in
 * world space. A point-only stroke tests against that single point; an empty stroke never hits.
 */
export function strokeHitsPoint(item: { x: number; y: number }, stroke: Stroke, worldX: number, worldY: number, tolerance: number): boolean {
   const points = stroke.points;
   const count = Math.floor(points.length / 2);
   if (count === 0) return false;
   const reach = stroke.width / 2 + tolerance;
   const reachSq = reach * reach;
   const localX = worldX - item.x;
   const localY = worldY - item.y;
   // A bounding-box shape stores only its two diagonal corners, so the raw-polyline walk below would bite
   // the diagonal, not the shape. Test the outline (box edges / sampled ring); a filled shape also erases
   // anywhere in its interior.
   if (stroke.shape === 'ellipse' || stroke.shape === 'rect') {
      const { x0, y0, x1, y1 } = shapeBox(points);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const rx = (x1 - x0) / 2;
      const ry = (y1 - y0) / 2;
      if (stroke.filled) {
         if (stroke.shape === 'rect') {
            if (localX >= x0 && localX <= x1 && localY >= y0 && localY <= y1) return true;
         } else if (rx > 0 && ry > 0) {
            const nx = (localX - cx) / rx;
            const ny = (localY - cy) / ry;
            if (nx * nx + ny * ny <= 1) return true;
         }
      }
      const ring = stroke.shape === 'ellipse' ? shapeEllipseRing(points) : shapeRectCorners(points);
      const ringCount = ring.length / 2;
      for (let i = 0; i < ringCount; i++) {
         const a = i * 2;
         const b = ((i + 1) % ringCount) * 2;
         if (pointSegmentDistanceSq(localX, localY, ring[a], ring[a + 1], ring[b], ring[b + 1]) <= reachSq) return true;
      }
      return false;
   }
   if (count === 1) {
      const ex = localX - points[0];
      const ey = localY - points[1];
      return ex * ex + ey * ey <= reachSq;
   }
   // A filled polygon erases anywhere in its interior too (the outline walk below still catches an unfilled one).
   if (stroke.shape === 'polygon' && stroke.filled && count >= 3 && pointInPolygon(localX, localY, points)) return true;
   for (let i = 0; i < count - 1; i++) {
      if (pointSegmentDistanceSq(localX, localY, points[i * 2], points[i * 2 + 1], points[i * 2 + 2], points[i * 2 + 3]) <= reachSq) return true;
   }
   // A polygon's closing edge (last vertex back to the first) is inked too, so the eraser bites it like
   // any other segment; an open stroke stops at its last point.
   if (stroke.shape === 'polygon' && count >= 3) {
      const last = (count - 1) * 2;
      if (pointSegmentDistanceSq(localX, localY, points[last], points[last + 1], points[0], points[1]) <= reachSq) return true;
   }
   return false;
}

/** A world-space rectangle (normalized min/max corners) - the marquee's footprint for a stroke hit-test. */
export interface WorldRect {
   minX: number;
   minY: number;
   maxX: number;
   maxY: number;
}

/**
 * True when a stroke's bounding box overlaps a world rect (a marquee's coarse hit-test). `item` supplies the
 * layer origin, since points are layer-local; the stroke's local bounds are offset to world and tested for an
 * axis-aligned overlap. A v1 bbox test - a precise segment-rect intersection is deferred; an empty stroke never
 * hits.
 */
export function strokeIntersectsRect(item: { x: number; y: number }, stroke: Stroke, worldRect: WorldRect): boolean {
   const bounds = pointsBounds(stroke.points);
   if (!bounds) return false;
   const minX = bounds.minX + item.x;
   const maxX = bounds.maxX + item.x;
   const minY = bounds.minY + item.y;
   const maxY = bounds.maxY + item.y;
   return minX <= worldRect.maxX && maxX >= worldRect.minX && minY <= worldRect.maxY && maxY >= worldRect.minY;
}
