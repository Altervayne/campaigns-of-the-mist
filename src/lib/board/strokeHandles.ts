/*
 * The free-transform box's handle geometry, in a drawing layer's LOCAL frame: where the 8 scale grips and
 * the rotate knob sit around the selection's bounding box, which grip a pointer lands on, and the matrix a
 * grip's drag produces. All pure and unit-tested; the hook maps world pointers into the local frame first
 * and feeds world-space sizes in (px ÷ zoom), so nothing here needs the camera.
 *
 * Handle -> matrix: a corner scales both axes about the OPPOSITE corner (Shift constrains the aspect); an
 * edge scales one axis about the opposite edge; Ctrl on an edge SKEWS along it instead; the knob rotates
 * about the box center (Shift snaps to 15deg). A grip dragged past its pivot yields a negative factor - a
 * flip - for free. A selection holding a 2-corner shape (ellipse/rect) can't carry rotation/skew, so those
 * are disabled for it (the rotate knob is hidden and Ctrl+edge falls back to a plain edge scale).
 */

// -- Utils Imports --
import { ROTATE_SNAP_DEG, pointerAngleDeg, snapAngle } from './boardRotation';
import { rotate, scale, skew, type Mat } from './strokeTransform';

// -- Type Imports --
import type { WorldRect } from './drawingStyle';
import type { Point } from './boardConnections';

/** On-screen sizing for the handles (px, counter-scaled by zoom to a constant world size). */
export const HANDLE_GRIP_PX = 10;
export const ROTATE_KNOB_PX = 12;
/** Gap from the box's top edge up to the rotate knob. */
export const ROTATE_STALK_PX = 22;
/** A tiny selection's box is padded to this on-screen span so its handles never overlap. */
export const MIN_HANDLE_BOX_PX = 28;
/** Pointer reach around a handle's center that still counts as a grab. */
export const HANDLE_HIT_PX = 12;

/** The eight scale grips plus the rotate knob. */
export type HandleId = 'rotate' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 'e' | 's' | 'w';

const CORNERS = ['nw', 'ne', 'se', 'sw'] as const;
const EDGES = ['n', 'e', 's', 'w'] as const;

const isCorner = (id: HandleId): boolean => (CORNERS as readonly string[]).includes(id);
const isEdge = (id: HandleId): boolean => (EDGES as readonly string[]).includes(id);

/** Divide guarding a zero denominator (a degenerate span) to a no-op factor of 1. */
const safeDiv = (n: number, d: number): number => (d === 0 ? 1 : n / d);
const sign = (n: number): number => (n < 0 ? -1 : 1);

/** Pads a bbox to a minimum span (world units) about its center, so a tiny selection's handles stay apart. */
export function handleLayoutBox(b: WorldRect, minSpan: number): WorldRect {
   const cx = (b.minX + b.maxX) / 2;
   const cy = (b.minY + b.maxY) / 2;
   const halfW = Math.max((b.maxX - b.minX) / 2, minSpan / 2);
   const halfH = Math.max((b.maxY - b.minY) / 2, minSpan / 2);
   return { minX: cx - halfW, minY: cy - halfH, maxX: cx + halfW, maxY: cy + halfH };
}

/** Each handle's anchor point in the local frame (the knob sits `stalk` above the top-mid edge). */
export function handleAnchors(box: WorldRect, stalk: number): Record<HandleId, Point> {
   const { minX, minY, maxX, maxY } = box;
   const midX = (minX + maxX) / 2;
   const midY = (minY + maxY) / 2;
   return {
      nw: { x: minX, y: minY },
      ne: { x: maxX, y: minY },
      se: { x: maxX, y: maxY },
      sw: { x: minX, y: maxY },
      n: { x: midX, y: minY },
      e: { x: maxX, y: midY },
      s: { x: midX, y: maxY },
      w: { x: minX, y: midY },
      rotate: { x: midX, y: minY - stalk },
   };
}

/**
 * The handle under a local point, or null. Tested in priority order - the rotate knob first (it sits outside
 * the box, clear of the corners), then corners, then edges. A selection holding a shape has no rotate knob.
 */
export function pickHandle(local: Point, box: WorldRect, stalk: number, hitRadius: number, hasShape: boolean): HandleId | null {
   const anchors = handleAnchors(box, stalk);
   const order: HandleId[] = hasShape ? [...CORNERS, ...EDGES] : ['rotate', ...CORNERS, ...EDGES];
   for (const id of order) {
      const p = anchors[id];
      if (Math.hypot(local.x - p.x, local.y - p.y) <= hitRadius) return id;
   }
   return null;
}

/** Modifiers live at a handle drag: Shift = constrain (aspect / angle snap), Ctrl/Cmd = skew an edge. */
export interface HandleDragOpts {
   shiftKey: boolean;
   skew: boolean;
   hasShape: boolean;
}

/** The pivot (opposite corner/edge) each scale handle grows from, in the local box frame. */
function scalePivot(handle: HandleId, box: WorldRect): Point {
   const { minX, minY, maxX, maxY } = box;
   switch (handle) {
      case 'se': return { x: minX, y: minY };
      case 'nw': return { x: maxX, y: maxY };
      case 'ne': return { x: minX, y: maxY };
      case 'sw': return { x: maxX, y: minY };
      case 'e': return { x: minX, y: minY };
      case 'w': return { x: maxX, y: minY };
      case 's': return { x: minX, y: minY };
      case 'n': return { x: minX, y: maxY };
      default: return { x: minX, y: minY };
   }
}

/**
 * The matrix a handle drag produces, in the local frame. `grab`/`cur` are the pointer's local positions at
 * press and now; `box` is the (padded) layout box captured at press. A scale tracks the grip by its drag
 * delta, so the opposite corner/edge stays pinned; crossing the pivot flips that axis. A skew shears along
 * the dragged edge. Rotate turns the ink about the box center.
 */
export function handleMatrix(handle: HandleId, box: WorldRect, grab: Point, cur: Point, opts: HandleDragOpts): Mat {
   const { minX, minY, maxX, maxY } = box;
   const midX = (minX + maxX) / 2;
   const midY = (minY + maxY) / 2;

   if (handle === 'rotate') {
      const start = pointerAngleDeg(midX, midY, grab.x, grab.y);
      const now = pointerAngleDeg(midX, midY, cur.x, cur.y);
      let delta = now - start;
      if (opts.shiftKey) delta = snapAngle(delta, ROTATE_SNAP_DEG);
      return rotate(delta, { x: midX, y: midY });
   }

   const dx = cur.x - grab.x;
   const dy = cur.y - grab.y;

   // Ctrl/Cmd on an edge shears along it; a selection with a shape can't skew, so it falls through to scale.
   if (opts.skew && !opts.hasShape && isEdge(handle)) {
      const h = maxY - minY;
      const w = maxX - minX;
      switch (handle) {
         case 'n': return skew(safeDiv(dx, -h), 0, { x: 0, y: maxY });
         case 's': return skew(safeDiv(dx, h), 0, { x: 0, y: minY });
         case 'e': return skew(0, safeDiv(dy, w), { x: minX, y: 0 });
         case 'w': return skew(0, safeDiv(dy, -w), { x: maxX, y: 0 });
      }
   }

   // Scale: move the grip's anchor by the drag delta, then read the factor off the pinned pivot.
   const pivot = scalePivot(handle, box);
   const anchors = handleAnchors(box, 0);
   const anchor = anchors[handle];
   const xActive = handle !== 'n' && handle !== 's';
   const yActive = handle !== 'e' && handle !== 'w';
   let sx = xActive ? safeDiv(anchor.x + dx - pivot.x, anchor.x - pivot.x) : 1;
   let sy = yActive ? safeDiv(anchor.y + dy - pivot.y, anchor.y - pivot.y) : 1;

   // Shift on a corner constrains the aspect: same magnitude on both axes, each axis keeping its own sign.
   if (opts.shiftKey && isCorner(handle)) {
      const mag = Math.max(Math.abs(sx), Math.abs(sy));
      sx = sign(sx) * mag;
      sy = sign(sy) * mag;
   }

   return scale(sx, sy, pivot);
}
