// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { handleAnchors, handleLayoutBox, handleMatrix, pickHandle, type HandleId } from './strokeHandles';
import { applyMatrixToPoints } from './strokeTransform';

// -- Type Imports --
import type { WorldRect } from './strokeGeometry';
import type { Point } from '@/lib/geometry/point';

/*
 * The free-transform box's handle geometry + the handle->matrix mapping. The gesture wiring (the cursor layer)
 * is verified by hand; these lock the box padding, the hit priority, and the matrix each grip drag produces.
 */

const BOX: WorldRect = { minX: 0, minY: 0, maxX: 100, maxY: 50 };
const apply = (p: Point, m: ReturnType<typeof handleMatrix>): Point => {
   const out = applyMatrixToPoints([p.x, p.y], m);
   return { x: out[0], y: out[1] };
};
const drag = (handle: HandleId, from: Point, to: Point, opts: { shiftKey?: boolean; skew?: boolean; hasShape?: boolean } = {}) =>
   handleMatrix(handle, BOX, from, to, { shiftKey: opts.shiftKey ?? false, skew: opts.skew ?? false, hasShape: opts.hasShape ?? false });

describe('handleLayoutBox', () => {
   it('leaves a comfortably-sized box untouched', () => {
      expect(handleLayoutBox(BOX, 20)).toEqual(BOX);
   });

   it('pads a tiny box to the minimum span about its center', () => {
      const tiny: WorldRect = { minX: 10, minY: 10, maxX: 12, maxY: 12 };
      expect(handleLayoutBox(tiny, 20)).toEqual({ minX: 1, minY: 1, maxX: 21, maxY: 21 });
   });
});

describe('pickHandle', () => {
   it('grabs the corner nearest the pointer within the hit radius', () => {
      expect(pickHandle({ x: 2, y: 2 }, BOX, 20, 6, false)).toBe('nw');
      expect(pickHandle({ x: 98, y: 48 }, BOX, 20, 6, false)).toBe('se');
   });

   it('grabs the rotate knob on its stalk below the bottom edge', () => {
      expect(pickHandle({ x: 50, y: 70 }, BOX, 20, 6, false)).toBe('rotate');
   });

   it('drops the rotate knob when the selection holds a shape', () => {
      expect(pickHandle({ x: 50, y: -20 }, BOX, 20, 6, true)).toBeNull();
   });

   it('returns null on empty space', () => {
      expect(pickHandle({ x: 50, y: 25 }, BOX, 20, 6, false)).toBeNull();
   });
});

describe('handleMatrix - corner scale', () => {
   it('scales both axes about the opposite corner', () => {
      const m = drag('se', { x: 100, y: 50 }, { x: 150, y: 50 });
      expect(apply({ x: 0, y: 0 }, m)).toEqual({ x: 0, y: 0 }); // pivot nw fixed
      expect(apply({ x: 100, y: 50 }, m)).toEqual({ x: 150, y: 50 }); // the grip tracks the pointer
   });

   it('constrains the aspect under Shift (same magnitude on both axes)', () => {
      const m = drag('se', { x: 100, y: 50 }, { x: 200, y: 60 }, { shiftKey: true });
      // sx would be 2, sy 1.2; Shift lifts both to 2.
      expect(apply({ x: 100, y: 50 }, m)).toEqual({ x: 200, y: 100 });
   });
});

describe('handleMatrix - edge scale', () => {
   it('scales one axis only about the opposite edge', () => {
      const m = drag('e', { x: 100, y: 25 }, { x: 50, y: 25 });
      expect(apply({ x: 100, y: 10 }, m)).toEqual({ x: 50, y: 10 }); // x halves
      expect(apply({ x: 0, y: 10 }, m)).toEqual({ x: 0, y: 10 }); // opposite edge pinned, y untouched
   });

   it('flips the axis when the grip is dragged past the pivot (negative scale)', () => {
      const m = drag('e', { x: 100, y: 25 }, { x: -20, y: 25 });
      expect(apply({ x: 100, y: 10 }, m)).toEqual({ x: -20, y: 10 }); // right edge crossed left of the pivot
   });
});

describe('handleMatrix - rotate', () => {
   it('rotates the ink about the box center', () => {
      const m = drag('rotate', { x: 150, y: 25 }, { x: 50, y: 125 });
      const c = apply({ x: 50, y: 25 }, m);
      expect(c.x).toBeCloseTo(50); // center fixed
      expect(c.y).toBeCloseTo(25);
      const p = apply({ x: 150, y: 25 }, m); // +90deg (y-down) about center
      expect(p.x).toBeCloseTo(50);
      expect(p.y).toBeCloseTo(125);
   });

   it('snaps the angle to 15deg increments under Shift', () => {
      // A ~20deg turn snaps to 15deg: the point lands on the 15deg image, not the raw 20deg one.
      const start = { x: 60, y: 25 }; // ~0deg from center (50,25)
      const at20 = { x: 50 + 10 * Math.cos((20 * Math.PI) / 180), y: 25 + 10 * Math.sin((20 * Math.PI) / 180) };
      const m = handleMatrix('rotate', BOX, start, at20, { shiftKey: true, skew: false, hasShape: false });
      const p = apply({ x: 60, y: 25 }, m);
      const expected = { x: 50 + 10 * Math.cos((15 * Math.PI) / 180), y: 25 + 10 * Math.sin((15 * Math.PI) / 180) };
      expect(p.x).toBeCloseTo(expected.x);
      expect(p.y).toBeCloseTo(expected.y);
   });
});

describe('handleMatrix - skew (Ctrl + edge)', () => {
   it('shears a horizontal edge along the drag, pinning the opposite edge', () => {
      const m = drag('n', { x: 50, y: 0 }, { x: 70, y: 0 }, { skew: true });
      expect(apply({ x: 50, y: 0 }, m).x).toBeCloseTo(70); // top edge follows the drag
      expect(apply({ x: 50, y: 50 }, m)).toEqual({ x: 50, y: 50 }); // bottom edge pinned
   });

   it('is disabled for a shape selection: an edge drag falls back to a plain scale (no shear)', () => {
      const m = drag('n', { x: 50, y: 0 }, { x: 70, y: 0 }, { skew: true, hasShape: true });
      // A horizontal drag on the top edge scales y by 1 (no vertical travel) and never shears x.
      expect(apply({ x: 10, y: 10 }, m)).toEqual({ x: 10, y: 10 });
   });
});

describe('handleAnchors', () => {
   it('places the eight grips on the box and the knob down the stalk below the bottom edge', () => {
      const a = handleAnchors(BOX, 22);
      expect(a.nw).toEqual({ x: 0, y: 0 });
      expect(a.se).toEqual({ x: 100, y: 50 });
      expect(a.n).toEqual({ x: 50, y: 0 });
      expect(a.rotate).toEqual({ x: 50, y: 72 }); // maxY 50 + stalk 22, clear of the top toolbar
   });
});
