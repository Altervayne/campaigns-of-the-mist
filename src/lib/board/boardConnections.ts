// -- Utils Imports --
import { rotateVec } from './boardRotation';

// -- Type Imports --
import type { BoardItem, ConnectionArrow, ConnectionStyle } from '@/lib/types/board';

/*
 * Pure geometry + lookup for board connections. A connection is a straight line drawn
 * edge-to-edge between two items, clipped to each item's bounding box along the
 * centre-to-centre ray (the spec's nearest-edge lean), so it tracks both items as they
 * move or resize. Kept framework-free so the math is unit-testable.
 */

/** A point in world coordinates. */
export interface Point {
   x: number;
   y: number;
}

/**
 * The minimal placement a connection endpoint reads from an item. `radius` is the corner radius
 * (world units) so the anchor lands on the straight part of a rounded outline, not in the corner
 * gap; `circle` marks a circular kind (the pin) so the anchor meets the dot exactly; `rotation`
 * (degrees, center-origin) tilts the outline so the anchor meets a rotated item's real edge. All
 * optional: absent radius is a sharp box (back-compat); the free end (cursor) passes a zero-size rect.
 */
export interface RectLike {
   x: number;
   y: number;
   width: number;
   height: number;
   radius?: number;
   circle?: boolean;
   rotation?: number;
}

/** The default corner radius (world units) for the connection anchor clamp on rounded kinds. */
export const CONNECTION_CORNER_RADIUS = 8;

/** Default styling for a freshly drawn connection (visible on both light and dark; solid + straight by default). */
export const DEFAULT_CONNECTION_STYLE = { width: 3, color: '#3b82f6', pathType: 'straight' } as const;

/**
 * Read-time default for an optional `pathType` (pre-2.3.0 connections have none). Backfills to
 * `straight`, so it persists on the next content write without a destructive migration.
 */
export function normalizeConnectionStyle(style: ConnectionStyle): ConnectionStyle {
   if (style.pathType) return style;
   return { ...style, pathType: 'straight' };
}

/**
 * The point on an item's visible outline (centre `cx,cy`, half-extents `hw,hh`) along the ray
 * `(dx,dy)` from its centre. A circular kind meets its circle; a rounded rect clamps the exit's
 * off-axis coordinate onto the straight part of the edge by the corner radius `r`, so a near-corner
 * ray never lands in the rounded-off gap (which left the old box edge overhanging into space).
 */
function edgePoint(cx: number, cy: number, hw: number, hh: number, dx: number, dy: number, r: number, circle: boolean): Point {
   if (dx === 0 && dy === 0) return { x: cx, y: cy };
   if (circle) {
      const radius = Math.min(hw, hh);
      const len = Math.hypot(dx, dy);
      return { x: cx + (dx / len) * radius, y: cy + (dy / len) * radius };
   }
   const clamp = Math.max(0, Math.min(r, hw, hh)); // corner radius, never beyond the half-extents
   // Scale the ray so it just reaches the nearer of the vertical / horizontal edges.
   const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
   const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
   const t = Math.min(tx, ty);
   let x = cx + dx * t;
   let y = cy + dy * t;
   // Exits a left/right edge -> pull its y onto the straight span; exits a top/bottom edge -> pull x.
   // A corner exit (tx === ty) clamps both, landing where the rounded corner begins.
   if (tx <= ty) { const lim = hh - clamp; y = Math.max(cy - lim, Math.min(cy + lim, y)); }
   if (ty <= tx) { const lim = hw - clamp; x = Math.max(cx - lim, Math.min(cx + lim, x)); }
   return { x, y };
}

/**
 * The two endpoints of a connection between `fromItem` and `toItem`: each is where the
 * centre-to-centre line meets that item's visible outline, so the line runs edge-to-edge without
 * overhanging a rounded corner. Pass a zero-size rect for a free end (the connect-drag preview).
 */
/**
 * The edge point for one endpoint item along the world ray `(worldDx, worldDy)` from its center,
 * accounting for its `rotation` (degrees, center-origin). The ray is folded into the box's local frame
 * (rotate -deg), the axis-aligned edge is solved there off the center, then rotated back to world
 * (rotate +deg). At 0 deg this is exactly the axis-aligned `edgePoint`. A circle is rotation-invariant.
 */
function edgeOf(item: RectLike, cx: number, cy: number, worldDx: number, worldDy: number): Point {
   const hw = item.width / 2;
   const hh = item.height / 2;
   const r = item.radius ?? 0;
   const circle = item.circle ?? false;
   const deg = item.rotation ?? 0;
   if (!deg) return edgePoint(cx, cy, hw, hh, worldDx, worldDy, r, circle);
   const localRay = rotateVec({ x: worldDx, y: worldDy }, -deg);
   const localEdge = edgePoint(0, 0, hw, hh, localRay.x, localRay.y, r, circle); // offset from the center
   const worldOffset = rotateVec(localEdge, deg);
   return { x: cx + worldOffset.x, y: cy + worldOffset.y };
}

export function connectionEndpoints(fromItem: RectLike, toItem: RectLike): { from: Point; to: Point } {
   const aCx = fromItem.x + fromItem.width / 2;
   const aCy = fromItem.y + fromItem.height / 2;
   const bCx = toItem.x + toItem.width / 2;
   const bCy = toItem.y + toItem.height / 2;
   const dx = bCx - aCx;
   const dy = bCy - aCy;
   return {
      from: edgeOf(fromItem, aCx, aCy, dx, dy),
      to: edgeOf(toItem, bCx, bCy, -dx, -dy),
   };
}

/**
 * The center marker's geometry: three points in the order `[wingA, tip, wingB]`. A `full` arrow fills
 * this as a triangle (`wingA -> tip -> wingB` closed); a `chevron` strokes it as an open polyline (same
 * three points, no close). `mid` is the marker's center (the connection midpoint), exposed for tests.
 */
export interface ArrowGeometry {
   points: [Point, Point, Point];
   mid: Point;
}

/**
 * Marker sizing (world units) from the line `width`: the tip sits `TIP` ahead of the midpoint, the wings
 * trail `TAIL` behind and splay `SPAN` to each side. Each is a width multiple plus a small floor so the
 * marker still reads on a hairline line while it scales with a thick one.
 */
const ARROW_TIP = { mult: 2, base: 4 };
const ARROW_TAIL = { mult: 1.4, base: 3 };
const ARROW_SPAN = { mult: 2, base: 3 };

/**
 * The center marker's geometry at an explicit path point `mid`, pointing along `tangent`: `forward`
 * runs with the tangent, `backward` flips it 180°. Size scales with the connection `width`. Pure - the
 * caller renders `full` as a filled triangle and `chevron` as a stroked open polyline. Path-aware, so
 * the marker sits on a curve's midpoint with the local direction, not on the straight-line midpoint.
 */
export function connectionArrowGeometryAt(mid: Point, tangent: Point, arrow: ConnectionArrow, width: number): ArrowGeometry {
   let angle = Math.atan2(tangent.y, tangent.x);
   if (arrow.direction === 'backward') angle += Math.PI;

   const tipLen = width * ARROW_TIP.mult + ARROW_TIP.base;
   const tailLen = width * ARROW_TAIL.mult + ARROW_TAIL.base;
   const span = width * ARROW_SPAN.mult + ARROW_SPAN.base;

   const ux = Math.cos(angle); // along the pointing direction
   const uy = Math.sin(angle);
   const px = -uy; // perpendicular (splay axis)
   const py = ux;

   const tip = { x: mid.x + ux * tipLen, y: mid.y + uy * tipLen };
   const baseX = mid.x - ux * tailLen;
   const baseY = mid.y - uy * tailLen;
   const wingA = { x: baseX + px * span, y: baseY + py * span };
   const wingB = { x: baseX - px * span, y: baseY - py * span };

   return { points: [wingA, tip, wingB], mid };
}

/**
 * The center marker's geometry for a straight connection between `from` and `to`: centred on the
 * endpoints' midpoint, pointing along the line. Thin wrapper over {@link connectionArrowGeometryAt}
 * for the straight case (and its tests); curved paths pass their own on-path point + tangent.
 */
export function connectionArrowGeometry(from: Point, to: Point, arrow: ConnectionArrow, width: number): ArrowGeometry {
   const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
   return connectionArrowGeometryAt(mid, { x: to.x - from.x, y: to.y - from.y }, arrow, width);
}

/**
 * The ids of every connection item that references `itemId` (as `from` or `to`). Used to
 * cascade-delete an item's lines so no orphan line is ever left behind.
 */
export function connectionsReferencing(items: Record<string, BoardItem>, itemId: string): string[] {
   return Object.values(items)
      .filter((item) => item.content.kind === 'connection' && (item.content.from === itemId || item.content.to === itemId))
      .map((item) => item.id);
}
