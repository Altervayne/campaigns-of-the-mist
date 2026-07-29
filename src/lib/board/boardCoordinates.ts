// -- Type Imports --
import type { BoardItem, Viewport } from '@/lib/types/board';

/*
 * Pure world<->screen math for the board canvas. The world layer is rendered with
 * `transform: translate(viewport.x, viewport.y) scale(viewport.zoom)` and
 * `transform-origin: 0 0`, so every conversion here follows from that single transform.
 * Move, resize, zoom-to-cursor, and add-at-center all route through these helpers so
 * they can never disagree.
 */

/** The clamped zoom range for the canvas. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2;

/** The minimal screen-space offset (left/top) of the clip layer, from its bounding rect. */
export interface ClipOrigin {
   left: number;
   top: number;
}

/** Clamps a zoom value into {@link MIN_ZOOM}..{@link MAX_ZOOM}. */
export function clampZoom(zoom: number): number {
   return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Converts an absolute screen point (e.g. `event.clientX/Y`) to a world point, given the
 * clip layer's origin and the current viewport.
 */
export function screenToWorld(screenX: number, screenY: number, origin: ClipOrigin, viewport: Viewport): { x: number; y: number } {
   return {
      x: (screenX - origin.left - viewport.x) / viewport.zoom,
      y: (screenY - origin.top - viewport.y) / viewport.zoom,
   };
}

/**
 * Converts a screen-space delta (how far the cursor moved on screen) to a world-space
 * delta. This is what makes a drag track the cursor at any zoom: a 10px screen move at
 * zoom 2 is only 5 world units.
 */
export function screenDeltaToWorld(deltaX: number, deltaY: number, zoom: number): { x: number; y: number } {
   return { x: deltaX / zoom, y: deltaY / zoom };
}

/**
 * Screen-px a selection's floating toolbar keeps below the clip's top edge. The bar grows upward from
 * the box it anchors to, so a box whose top runs above the canvas would push the bar out of reach; this
 * covers the bar's own height plus a small margin.
 */
export const TOOLBAR_TOP_CLEARANCE = 48;

/**
 * World-px to push a selection's toolbar down so it clears the clip's top edge, from the world Y of the
 * box it anchors to; undefined when the box sits low enough to need none (a stable value, so an unclamped
 * box still skips a pan re-render). `topWorld` must already carry any live move delta.
 */
export function toolbarClampDown(topWorld: number, viewport: Viewport): number | undefined {
   const topScreen = viewport.y + topWorld * viewport.zoom;
   const overshoot = TOOLBAR_TOP_CLEARANCE - topScreen;
   return overshoot > 0 ? overshoot / viewport.zoom : undefined;
}

/** Screen-px a selection's floating toolbar keeps clear of the clip's left and right edges. */
export const TOOLBAR_EDGE_CLEARANCE = 8;

/** How a floating toolbar sits against its anchor point: centred over it, or starting at it. */
export type ToolbarAlign = 'center' | 'left';

/**
 * World-px to slide a selection's toolbar sideways so it stays fully inside the clip, from the world X of
 * the point it anchors at. The bar counter-scales by 1/zoom to hold a constant on-screen size, so
 * `barScreenWidth` is SCREEN px while the result is world px, like {@link toolbarClampDown}. Undefined
 * when the bar already fits (a stable value, so an unclamped box still skips a pan re-render). Near an
 * edge the bar gives up its centring rather than being cut off; one too wide for the clip keeps its left
 * end, where the grip lives, in view.
 */
export function toolbarClampX(
   anchorWorldX: number,
   barScreenWidth: number,
   align: ToolbarAlign,
   clipWidth: number,
   viewport: Viewport,
): number | undefined {
   // Before the bar or the clip has been measured there is nothing to clamp against.
   if (barScreenWidth <= 0 || clipWidth <= 0) return undefined;
   const anchorScreen = viewport.x + anchorWorldX * viewport.zoom;
   const leftScreen = align === 'center' ? anchorScreen - barScreenWidth / 2 : anchorScreen;
   const rightScreen = leftScreen + barScreenWidth;
   const minLeft = TOOLBAR_EDGE_CLEARANCE;
   const maxRight = clipWidth - TOOLBAR_EDGE_CLEARANCE;

   let shift = 0;
   if (leftScreen < minLeft) shift = minLeft - leftScreen;
   // Pushing left to reveal the right end never costs the left end: the floor wins for an over-wide bar.
   else if (rightScreen > maxRight) shift = Math.max(maxRight - rightScreen, minLeft - leftScreen);
   return shift !== 0 ? shift / viewport.zoom : undefined;
}

/**
 * The on-screen grid spacing band: the adaptive helper keeps a cell within these px so the
 * grid never turns to mush zoomed out or sparse zoomed in.
 */
const GRID_MIN_SCREEN = 16;
const GRID_MAX_SCREEN = 80;
/** The "nice" mantissas a world grid cell snaps to, per decade (graph-paper feel). */
const GRID_NICE_STEPS = [1, 2, 5];

/**
 * Returns the grid's on-screen cell size (px) for `zoom`, snapping the underlying WORLD
 * spacing to a nice 1/2/5 x 10^n number whose screen size lands in the comfortable band.
 * The band's ratio (5x) exceeds the largest gap between nice numbers (2.5x), so a value
 * always exists; the clamp is just a guard against absurd zooms.
 */
export function gridSpacing(zoom: number): number {
   for (let power = -2; power <= 7; power++) {
      for (const step of GRID_NICE_STEPS) {
         const screen = step * 10 ** power * zoom;
         if (screen >= GRID_MIN_SCREEN && screen <= GRID_MAX_SCREEN) return screen;
      }
   }
   return Math.min(GRID_MAX_SCREEN, Math.max(GRID_MIN_SCREEN, 40 * zoom));
}

/**
 * Returns the viewport that places `worldCenter` at the clip's screen center, keeping `zoom`. The one
 * centering the fit-to-content, reset-view, and coordinate-jump paths all share, so they can't disagree.
 */
export function centerViewport(worldCenter: { x: number; y: number }, clipSize: { width: number; height: number }, zoom: number): Viewport {
   return {
      zoom,
      x: clipSize.width / 2 - worldCenter.x * zoom,
      y: clipSize.height / 2 - worldCenter.y * zoom,
   };
}

/** A world-space axis-aligned rectangle (e.g. a marquee), as min/max corners. */
export interface WorldRect {
   minX: number;
   minY: number;
   maxX: number;
   maxY: number;
}

/**
 * Returns the ids of every spatial item whose world bounds INTERSECT `rect` (connections,
 * being zero-size, are skipped). Overlap, not containment, so grazing an item selects it -
 * the expected marquee feel.
 */
export function itemsInMarquee(items: BoardItem[], rect: WorldRect): string[] {
   return items
      .filter(
         (item) =>
            item.kind !== 'connection' &&
            item.x < rect.maxX &&
            item.x + item.width > rect.minX &&
            item.y < rect.maxY &&
            item.y + item.height > rect.minY,
      )
      .map((item) => item.id);
}

/**
 * Returns the viewport that frames every spatial item (connections, being zero-size, are
 * skipped) centered in a clip of `clipSize`, with `padding` screen px of margin and the
 * zoom clamped to the allowed range. An empty board (or a zero clip) returns the origin
 * viewport, so an empty bbox never yields NaN.
 */
export function fitViewport(items: BoardItem[], clipSize: { width: number; height: number }, padding: number): Viewport {
   const spatial = items.filter((item) => item.kind !== 'connection');
   if (spatial.length === 0 || clipSize.width <= 0 || clipSize.height <= 0) return { x: 0, y: 0, zoom: 1 };

   let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
   for (const item of spatial) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + item.height);
   }

   const contentWidth = maxX - minX;
   const contentHeight = maxY - minY;
   const availWidth = Math.max(1, clipSize.width - 2 * padding);
   const availHeight = Math.max(1, clipSize.height - 2 * padding);

   // A degenerate (zero-extent) bbox can't drive a zoom; keep 1 rather than dividing by 0.
   const fitZoom = contentWidth > 0 && contentHeight > 0 ? Math.min(availWidth / contentWidth, availHeight / contentHeight) : 1;
   const zoom = clampZoom(fitZoom);

   // Place the content's world center at the clip's screen center.
   return centerViewport({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, clipSize, zoom);
}

/**
 * Returns the viewport after a wheel zoom toward the cursor: the zoom is set to
 * `nextZoom` (clamped), and `x/y` are adjusted so the world point under the cursor stays
 * under the cursor.
 */
export function zoomToCursor(
   viewport: Viewport,
   origin: ClipOrigin,
   screenX: number,
   screenY: number,
   nextZoom: number,
): Viewport {
   const zoom = clampZoom(nextZoom);
   // The cursor's position within the clip layer (local screen coords).
   const localX = screenX - origin.left;
   const localY = screenY - origin.top;
   // The world point currently under the cursor must map back to the same local point
   // after the zoom: local = world * zoom + offset  =>  offset = local - world * zoom.
   const worldX = (localX - viewport.x) / viewport.zoom;
   const worldY = (localY - viewport.y) / viewport.zoom;
   return {
      zoom,
      x: localX - worldX * zoom,
      y: localY - worldY * zoom,
   };
}
