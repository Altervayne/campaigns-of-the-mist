// -- Type Imports --
import type { ConnectionControls, ConnectionPathType } from '@/lib/types/board';
import type { Point } from './boardConnections';

/*
 * Pure routing math for a connection: turns its two edge endpoints (+ optional bezier controls)
 * into an SVG path `d`, and reports the on-path midpoint + unit tangent there (for the center
 * arrow marker and the toolbar anchor). Framework-free so every shape is unit-testable. Endpoint
 * anchoring stays in boardConnections; this module only shapes the run between the two points.
 */

/** Circle-curve sagitta as a fraction of the chord length; fixes how far the arc bows out. */
const CIRCLE_BOW_RATIO = 0.2;
/** Bezier auto-control offset from each endpoint toward the other, as a fraction of the chord. */
const BEZIER_CHORD_FRACTION = 0.25;
/** Bezier auto-control perpendicular bow, as a fraction of the chord, so the default cubic reads as a curve. */
const BEZIER_BOW_RATIO = 0.15;

/** Rounds to 3 decimals and normalizes -0 to 0, for compact stable path strings. */
function f(v: number): string {
   return (Number(v.toFixed(3)) + 0).toString();
}

/** The unit vector of `v`, or `fallback` when `v` is (near) zero-length. */
function unit(v: Point, fallback: Point): Point {
   const len = Math.hypot(v.x, v.y);
   if (len < 1e-9) return fallback;
   return { x: v.x / len, y: v.y / len };
}

/** The chord's unit direction from `from` to `to` (falls back to +x for coincident points). */
function chordUnit(from: Point, to: Point): Point {
   return unit({ x: to.x - from.x, y: to.y - from.y }, { x: 1, y: 0 });
}

/** The single quadratic control point for the circle-curve: chord midpoint pushed perpendicular a fixed fraction of the chord, always to the same side. */
function circleControl(from: Point, to: Point): Point {
   const mx = (from.x + to.x) / 2;
   const my = (from.y + to.y) / 2;
   const dx = to.x - from.x;
   const dy = to.y - from.y;
   const len = Math.hypot(dx, dy);
   if (len < 1e-9) return { x: mx, y: my };
   const off = len * CIRCLE_BOW_RATIO;
   // Perpendicular (-dy, dx): a consistent bow side across every orientation.
   return { x: mx + (-dy / len) * off, y: my + (dx / len) * off };
}

/**
 * The two cubic control points in WORLD coordinates: stored `controls` are OFFSETS from their endpoints;
 * absent, they auto-place along the chord toward the other end AND perpendicular (same side as the
 * circle-curve), so the auto cubic reads as a gentle arc the user later bends, not a straight colinear
 * line. The same points the rendered curve uses, so the drag handles + tethers sit on the visible curve
 * whether the offsets are stored or auto.
 */
export function bezierControlPoints(from: Point, to: Point, controls?: ConnectionControls): { c1: Point; c2: Point } {
   if (controls) {
      return {
         c1: { x: from.x + controls.c1.x, y: from.y + controls.c1.y },
         c2: { x: to.x + controls.c2.x, y: to.y + controls.c2.y },
      };
   }
   const dx = to.x - from.x;
   const dy = to.y - from.y;
   const len = Math.hypot(dx, dy) || 1;
   // Perpendicular (-dy, dx)/len bowed a fixed fraction, same consistent side as the circle-curve.
   const px = (-dy / len) * (len * BEZIER_BOW_RATIO);
   const py = (dx / len) * (len * BEZIER_BOW_RATIO);
   return {
      c1: { x: from.x + dx * BEZIER_CHORD_FRACTION + px, y: from.y + dy * BEZIER_CHORD_FRACTION + py },
      c2: { x: to.x - dx * BEZIER_CHORD_FRACTION + px, y: to.y - dy * BEZIER_CHORD_FRACTION + py },
   };
}

/** The two orthogonal corner points: a double elbow through the chord center, dominant axis first. */
function orthogonalCorners(from: Point, to: Point): { c1: Point; c2: Point; horizontalFirst: boolean } {
   const horizontalFirst = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
   if (horizontalFirst) {
      const mx = (from.x + to.x) / 2;
      return { c1: { x: mx, y: from.y }, c2: { x: mx, y: to.y }, horizontalFirst };
   }
   const my = (from.y + to.y) / 2;
   return { c1: { x: from.x, y: my }, c2: { x: to.x, y: my }, horizontalFirst };
}

/** The SVG path `d` for a connection of `type` between `from` and `to` (bezier reads `controls`). */
export function connectionPath(type: ConnectionPathType, from: Point, to: Point, controls?: ConnectionControls): string {
   switch (type) {
      case 'orthogonal': {
         const { c1, c2 } = orthogonalCorners(from, to);
         return `M ${f(from.x)} ${f(from.y)} L ${f(c1.x)} ${f(c1.y)} L ${f(c2.x)} ${f(c2.y)} L ${f(to.x)} ${f(to.y)}`;
      }
      case 'circle': {
         const ctrl = circleControl(from, to);
         return `M ${f(from.x)} ${f(from.y)} Q ${f(ctrl.x)} ${f(ctrl.y)} ${f(to.x)} ${f(to.y)}`;
      }
      case 'bezier': {
         const { c1, c2 } = bezierControlPoints(from, to, controls);
         return `M ${f(from.x)} ${f(from.y)} C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(to.x)} ${f(to.y)}`;
      }
      case 'straight':
      default:
         return `M ${f(from.x)} ${f(from.y)} L ${f(to.x)} ${f(to.y)}`;
   }
}

/** A point on a path plus the unit tangent there. */
export interface PathMidpoint {
   point: Point;
   tangent: Point;
}

/** Quadratic bezier point + unit tangent at t = 0.5. */
function quadraticMidpoint(p0: Point, p1: Point, p2: Point): PathMidpoint {
   const point = {
      x: 0.25 * p0.x + 0.5 * p1.x + 0.25 * p2.x,
      y: 0.25 * p0.y + 0.5 * p1.y + 0.25 * p2.y,
   };
   // B'(0.5) reduces to (p2 - p0).
   const tangent = unit({ x: p2.x - p0.x, y: p2.y - p0.y }, { x: 1, y: 0 });
   return { point, tangent };
}

/** Cubic bezier point + unit tangent at t = 0.5. */
function cubicMidpoint(p0: Point, p1: Point, p2: Point, p3: Point): PathMidpoint {
   const point = {
      x: 0.125 * p0.x + 0.375 * p1.x + 0.375 * p2.x + 0.125 * p3.x,
      y: 0.125 * p0.y + 0.375 * p1.y + 0.375 * p2.y + 0.125 * p3.y,
   };
   // B'(0.5) is proportional to 0.25(p1-p0) + 0.5(p2-p1) + 0.25(p3-p2).
   const dir = {
      x: 0.25 * (p1.x - p0.x) + 0.5 * (p2.x - p1.x) + 0.25 * (p3.x - p2.x),
      y: 0.25 * (p1.y - p0.y) + 0.5 * (p2.y - p1.y) + 0.25 * (p3.y - p2.y),
   };
   return { point, tangent: unit(dir, chordUnit(p0, p3)) };
}

/**
 * The on-path midpoint of a connection and the unit tangent there. Straight reduces to the geometric
 * `(from + to) / 2` and the chord direction; curves land on the curve. Used to place the center marker
 * and anchor the midpoint toolbar so both follow a bend.
 */
export function connectionMidpoint(type: ConnectionPathType, from: Point, to: Point, controls?: ConnectionControls): PathMidpoint {
   switch (type) {
      case 'orthogonal': {
         const { horizontalFirst } = orthogonalCorners(from, to);
         const point = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
         // The center sits on the middle (elbow-to-elbow) segment: vertical when horizontal-first, else horizontal.
         const seg = horizontalFirst ? { x: 0, y: to.y - from.y } : { x: to.x - from.x, y: 0 };
         return { point, tangent: unit(seg, chordUnit(from, to)) };
      }
      case 'circle':
         return quadraticMidpoint(from, circleControl(from, to), to);
      case 'bezier': {
         const { c1, c2 } = bezierControlPoints(from, to, controls);
         return cubicMidpoint(from, c1, c2, to);
      }
      case 'straight':
      default:
         return {
            point: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
            tangent: chordUnit(from, to),
         };
   }
}

/**
 * The new stored OFFSET for a dragged bezier control: its start WORLD position shifted by the pointer's
 * screen delta (converted to world by `/ zoom`), re-expressed relative to its `endpoint` (`from` for c1,
 * `to` for c2). Pure, so the handle-drag math is unit-tested without the DOM.
 */
export function draggedControlOffset(startControlWorld: Point, endpoint: Point, screenDelta: Point, zoom: number): Point {
   return {
      x: startControlWorld.x + screenDelta.x / zoom - endpoint.x,
      y: startControlWorld.y + screenDelta.y / zoom - endpoint.y,
   };
}
