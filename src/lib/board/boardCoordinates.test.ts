// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { MAX_ZOOM, MIN_ZOOM, TOOLBAR_EDGE_CLEARANCE, TOOLBAR_TOP_CLEARANCE, centerViewport, clampZoom, fitViewport, gridSpacing, itemsInMarquee, screenDeltaToWorld, screenToWorld, toolbarClampDown, toolbarClampX, zoomToCursor } from './boardCoordinates';

// -- Type Imports --
import type { BoardItem, Viewport } from '@/lib/types/board';

/** A minimal spatial board item for fit tests (content irrelevant to the geometry). */
function spatial(id: string, x: number, y: number, width: number, height: number): BoardItem {
   return { id, kind: 'post-it', x, y, width, height, z: 0, content: { kind: 'post-it', mode: 'copy', data: { id: 'n25', text: '' } } };
}

/*
 * Tests for the pure board coordinate math. These pin down the two failure modes the
 * canvas is most sensitive to: a drag that drifts at non-1 zoom (delta must divide by
 * zoom), and a zoom that does not stay centered on the cursor.
 */

const ORIGIN = { left: 100, top: 50 };

describe('screenToWorld', () => {
   it('is the identity (minus the clip origin) at zoom 1, no pan', () => {
      const viewport: Viewport = { x: 0, y: 0, zoom: 1 };
      expect(screenToWorld(300, 250, ORIGIN, viewport)).toEqual({ x: 200, y: 200 });
   });

   it('accounts for pan and zoom', () => {
      const viewport: Viewport = { x: 40, y: 20, zoom: 2 };
      // localX = 300 - 100 = 200; worldX = (200 - 40) / 2 = 80.
      expect(screenToWorld(300, 250, ORIGIN, viewport)).toEqual({ x: 80, y: (250 - 50 - 20) / 2 });
   });
});

describe('screenDeltaToWorld', () => {
   it('divides the screen delta by zoom so a drag tracks the cursor', () => {
      expect(screenDeltaToWorld(10, 20, 1)).toEqual({ x: 10, y: 20 });
      expect(screenDeltaToWorld(10, 20, 0.5)).toEqual({ x: 20, y: 40 }); // zoomed out: world moves more
      expect(screenDeltaToWorld(10, 20, 2)).toEqual({ x: 5, y: 10 }); // zoomed in: world moves less
   });
});

describe('clampZoom', () => {
   it('clamps to the allowed range', () => {
      expect(clampZoom(0.1)).toBe(MIN_ZOOM);
      expect(clampZoom(0.05)).toBe(MIN_ZOOM); // below the floor clamps up
      expect(clampZoom(5)).toBe(MAX_ZOOM);
      expect(clampZoom(1)).toBe(1);
   });
});

describe('centerViewport', () => {
   const clip = { width: 800, height: 600 };

   it('puts the given world point at the clip center for the kept zoom', () => {
      const vp = centerViewport({ x: 120, y: -40 }, clip, 1.5);
      expect(vp.zoom).toBe(1.5);
      // The world point maps back to the clip center under this viewport.
      expect(screenToWorld(clip.width / 2, clip.height / 2, { left: 0, top: 0 }, vp)).toEqual({ x: 120, y: -40 });
   });

   it('centers the world origin at the clip center at zoom 1 (the reset-view case)', () => {
      expect(centerViewport({ x: 0, y: 0 }, clip, 1)).toEqual({ x: 400, y: 300, zoom: 1 });
   });
});

describe('zoomToCursor', () => {
   it('keeps the world point under the cursor fixed across the zoom', () => {
      const viewport: Viewport = { x: 30, y: -10, zoom: 1 };
      const screenX = 420;
      const screenY = 260;
      const worldBefore = screenToWorld(screenX, screenY, ORIGIN, viewport);

      const zoomedIn = zoomToCursor(viewport, ORIGIN, screenX, screenY, 1.8);
      const worldAfterIn = screenToWorld(screenX, screenY, ORIGIN, zoomedIn);
      expect(worldAfterIn.x).toBeCloseTo(worldBefore.x, 10);
      expect(worldAfterIn.y).toBeCloseTo(worldBefore.y, 10);

      const zoomedOut = zoomToCursor(viewport, ORIGIN, screenX, screenY, 0.4);
      const worldAfterOut = screenToWorld(screenX, screenY, ORIGIN, zoomedOut);
      expect(worldAfterOut.x).toBeCloseTo(worldBefore.x, 10);
      expect(worldAfterOut.y).toBeCloseTo(worldBefore.y, 10);
   });

   it('clamps the resulting zoom and still holds the cursor point at the clamp', () => {
      const viewport: Viewport = { x: 0, y: 0, zoom: 2 };
      const screenX = 250;
      const screenY = 150;
      const worldBefore = screenToWorld(screenX, screenY, ORIGIN, viewport);

      const result = zoomToCursor(viewport, ORIGIN, screenX, screenY, 10); // would exceed MAX_ZOOM
      expect(result.zoom).toBe(MAX_ZOOM);
      const worldAfter = screenToWorld(screenX, screenY, ORIGIN, result);
      expect(worldAfter.x).toBeCloseTo(worldBefore.x, 10);
      expect(worldAfter.y).toBeCloseTo(worldBefore.y, 10);
   });
});

describe('gridSpacing', () => {
   it('keeps the on-screen cell within the comfortable band across the whole zoom range', () => {
      for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM + 0.001; zoom += 0.01) {
         const spacing = gridSpacing(zoom);
         expect(spacing).toBeGreaterThanOrEqual(16);
         expect(spacing).toBeLessThanOrEqual(80);
      }
   });

   it('stays in band at extreme zooms too (guards the fallback)', () => {
      for (const zoom of [0.01, 0.05, 5, 50]) {
         const spacing = gridSpacing(zoom);
         expect(spacing).toBeGreaterThanOrEqual(16);
         expect(spacing).toBeLessThanOrEqual(80);
      }
   });

   it('snaps the underlying world spacing to a nice 1/2/5 x 10^n number', () => {
      const worldUnits = gridSpacing(1) / 1; // screen / zoom, with zoom 1
      const mantissa = worldUnits / 10 ** Math.floor(Math.log10(worldUnits));
      expect([1, 2, 5]).toContain(Math.round(mantissa));
   });
});

describe('fitViewport', () => {
   const clip = { width: 800, height: 600 };

   it('returns the origin viewport for an empty board', () => {
      expect(fitViewport([], clip, 40)).toEqual({ x: 0, y: 0, zoom: 1 });
   });

   it('returns the origin viewport for a zero-size clip', () => {
      expect(fitViewport([spatial('a', 0, 0, 100, 100)], { width: 0, height: 0 }, 40)).toEqual({ x: 0, y: 0, zoom: 1 });
   });

   it('frames items centered, padded, and zoom-clamped', () => {
      // Two items spanning world x:[0,1000], y:[0,500]; clip 800x600, padding 40.
      const items = [spatial('a', 0, 0, 100, 100), spatial('b', 900, 400, 100, 100)];
      const vp = fitViewport(items, clip, 40);

      // Fit zoom = min((800-80)/1000, (600-80)/500) = min(0.72, 1.04) = 0.72, in range.
      expect(vp.zoom).toBeCloseTo(0.72, 5);
      // The content center (500, 250) lands at the clip center (400, 300).
      expect(500 * vp.zoom + vp.x).toBeCloseTo(400, 5);
      expect(250 * vp.zoom + vp.y).toBeCloseTo(300, 5);
   });

   it('clamps the fit zoom to the allowed range for a tiny board', () => {
      // A single small item would fit at a huge zoom; it clamps to MAX_ZOOM.
      const vp = fitViewport([spatial('a', 0, 0, 10, 10)], clip, 40);
      expect(vp.zoom).toBe(MAX_ZOOM);
   });

   it('skips connections (zero-size) when computing the bounds', () => {
      const connection: BoardItem = { id: 'c', kind: 'connection', x: 0, y: 0, width: 0, height: 0, z: 0, content: { kind: 'connection', from: 'a', to: 'b', style: { width: 1, color: '#000' } } };
      const withConn = fitViewport([spatial('a', 100, 100, 100, 100), connection], clip, 40);
      const without = fitViewport([spatial('a', 100, 100, 100, 100)], clip, 40);
      expect(withConn).toEqual(without);
   });
});

describe('itemsInMarquee', () => {
   const items: BoardItem[] = [
      spatial('a', 0, 0, 100, 100), // top-left
      spatial('b', 300, 300, 100, 100), // bottom-right
      spatial('c', 50, 50, 100, 100), // overlaps the box edge
   ];

   it('returns items whose bounds intersect the rect (overlap, not containment)', () => {
      // A box covering the top-left region grazes 'a' and 'c' but not 'b'.
      const hits = itemsInMarquee(items, { minX: -10, minY: -10, maxX: 120, maxY: 120 });
      expect(hits.sort()).toEqual(['a', 'c']);
   });

   it('returns nothing for a rect clear of every item', () => {
      expect(itemsInMarquee(items, { minX: 1000, minY: 1000, maxX: 1100, maxY: 1100 })).toEqual([]);
   });

   it('skips connections even when the rect covers their (zero-size) origin', () => {
      const withConn: BoardItem[] = [
         ...items,
         { id: 'conn', kind: 'connection', x: 0, y: 0, width: 0, height: 0, z: 0, content: { kind: 'connection', from: 'a', to: 'b', style: { width: 1, color: '#000' } } },
      ];
      const hits = itemsInMarquee(withConn, { minX: -10, minY: -10, maxX: 500, maxY: 500 });
      expect(hits).not.toContain('conn');
   });
});

describe('toolbarClampDown', () => {
   it('returns nothing while the box top sits at or below the clearance line', () => {
      const viewport: Viewport = { x: 0, y: 0, zoom: 1 };
      expect(toolbarClampDown(TOOLBAR_TOP_CLEARANCE, viewport)).toBeUndefined();
      expect(toolbarClampDown(500, viewport)).toBeUndefined();
   });

   it('returns the world-px overshoot once the box top runs above the clearance line', () => {
      const viewport: Viewport = { x: 0, y: 0, zoom: 1 };
      // Top at screen 8, so the bar must drop 40px to reach the clearance line.
      expect(toolbarClampDown(8, viewport)).toBe(TOOLBAR_TOP_CLEARANCE - 8);
   });

   it('measures the overshoot in screen px but reports it in world px', () => {
      // Top at world -100, zoom 2 -> screen -200; overshoot 248 screen px = 124 world px.
      expect(toolbarClampDown(-100, { x: 0, y: 0, zoom: 2 })).toBe((TOOLBAR_TOP_CLEARANCE + 200) / 2);
   });

   it('follows the pan, so panning the box back down releases the clamp', () => {
      expect(toolbarClampDown(0, { x: 0, y: 0, zoom: 1 })).toBe(TOOLBAR_TOP_CLEARANCE);
      expect(toolbarClampDown(0, { x: 0, y: TOOLBAR_TOP_CLEARANCE, zoom: 1 })).toBeUndefined();
   });
});

describe('toolbarClampX', () => {
   const viewport: Viewport = { x: 0, y: 0, zoom: 1 };
   const BAR = 200;
   const CLIP = 1000;

   it('returns nothing while the bar sits clear of both edges', () => {
      expect(toolbarClampX(500, BAR, 'center', CLIP, viewport)).toBeUndefined();
      expect(toolbarClampX(500, BAR, 'left', CLIP, viewport)).toBeUndefined();
   });

   it('returns nothing until the bar and the clip have been measured', () => {
      // A bar hard off the left edge, so only the unmeasured guard can be keeping the clamp away.
      expect(toolbarClampX(-500, 0, 'center', CLIP, viewport)).toBeUndefined();
      expect(toolbarClampX(-500, BAR, 'center', 0, viewport)).toBeUndefined();
   });

   it('pushes a centred bar right when it runs off the left edge', () => {
      // Anchor at screen 50, so the bar spans -50..150; its left end must reach the clearance line.
      expect(toolbarClampX(50, BAR, 'center', CLIP, viewport)).toBe(TOOLBAR_EDGE_CLEARANCE + 50);
   });

   it('pushes a centred bar left when it runs off the right edge', () => {
      // Anchor at screen 950, so the bar spans 850..1050; its right end must reach 1000 - clearance.
      expect(toolbarClampX(950, BAR, 'center', CLIP, viewport)).toBe(-(50 + TOOLBAR_EDGE_CLEARANCE));
   });

   it('clamps a left-aligned bar differently from a centred one at the SAME anchor', () => {
      // The group bar starts at its anchor; the item bar straddles it. At an anchor 20px inside the left
      // edge the centred bar is already half cut off, while the left-aligned one still fits.
      expect(toolbarClampX(20, BAR, 'center', CLIP, viewport)).toBe(TOOLBAR_EDGE_CLEARANCE + 80);
      expect(toolbarClampX(20, BAR, 'left', CLIP, viewport)).toBeUndefined();
      // Mirrored at the right edge: the left-aligned bar hangs a full width past the anchor, the centred
      // one only half of it.
      expect(toolbarClampX(880, BAR, 'left', CLIP, viewport)).toBe(-(80 + TOOLBAR_EDGE_CLEARANCE));
      expect(toolbarClampX(880, BAR, 'center', CLIP, viewport)).toBeUndefined();
   });

   it('measures the overshoot in screen px but reports it in world px', () => {
      // Anchor at world 10, zoom 2 -> screen 20. The bar is 200 SCREEN px whatever the zoom (it
      // counter-scales), so it spans -80..120 and must move 88 screen px = 44 world px. Treating the
      // bar's width as world units would size it 400 screen px here and give a different answer.
      expect(toolbarClampX(10, BAR, 'center', CLIP, { x: 0, y: 0, zoom: 2 })).toBe((TOOLBAR_EDGE_CLEARANCE + 80) / 2);
   });

   it('follows the pan, so panning the bar back inside releases the clamp', () => {
      expect(toolbarClampX(0, BAR, 'left', CLIP, viewport)).toBe(TOOLBAR_EDGE_CLEARANCE);
      expect(toolbarClampX(0, BAR, 'left', CLIP, { x: TOOLBAR_EDGE_CLEARANCE, y: 0, zoom: 1 })).toBeUndefined();
   });

   it('keeps the left end of a bar too wide for the clip in view', () => {
      // A 200px bar in a 100px clip cannot fit; the grip lives at the left end, so that end wins.
      expect(toolbarClampX(50, BAR, 'left', 100, viewport)).toBe(TOOLBAR_EDGE_CLEARANCE - 50);
      expect(toolbarClampX(50, BAR, 'left', 100, viewport)).toBeLessThan(0);
   });
});
