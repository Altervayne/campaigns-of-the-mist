// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';

// -- Local Imports --
import { boardDropPlacement } from './boardDropPlacement';

// -- Type Imports --
import type { BoardItem } from '@/lib/types/board';
import type { BoardStore } from '@/lib/stores/boardStore';

/*
 * Placement math for a board drop. The clip rect is queried at drop time, so each case stubs the
 * element (or omits it) rather than passing geometry in.
 */

const SIZE = { width: 100, height: 50 };

/** A board store stub exposing only what the placement reads. */
function makeStore(items: Record<string, BoardItem>, viewport = { x: 0, y: 0, zoom: 1 }): BoardStore {
   return { getState: () => ({ viewport, items }) } as unknown as BoardStore;
}

/** A zone item covering `x/y/width/height`; only geometry, kind, z and collapsed state are read. */
function makeZone(id: string, x: number, y: number, width: number, height: number, z = 0): BoardItem {
   return { id, kind: 'zone', x, y, width, height, z, content: { kind: 'zone', collapsed: false } } as unknown as BoardItem;
}

/** Stubs `[data-board-clip]` with the given rect; pass null for a board that is not mounted. */
function stubClip(rect: { left: number; top: number; width: number; height: number } | null) {
   vi.spyOn(document, 'querySelector').mockImplementation(() => {
      if (!rect) return null;
      return { getBoundingClientRect: () => rect } as unknown as Element;
   });
}

afterEach(() => {
   vi.restoreAllMocks();
});

describe('boardDropPlacement', () => {
   it('centres the new item on the cursor, in world coordinates', () => {
      stubClip({ left: 20, top: 10, width: 800, height: 600 });
      const placement = boardDropPlacement(makeStore({}, { x: 100, y: 50, zoom: 2 }), { x: 420, y: 310 }, SIZE);
      // world = ((420 - 20 - 100) / 2, (310 - 10 - 50) / 2) = (150, 125), less half the size
      expect(placement.x).toBe(100);
      expect(placement.y).toBe(100);
      expect(placement.width).toBe(SIZE.width);
      expect(placement.height).toBe(SIZE.height);
      expect(placement.id).toEqual(expect.any(String));
   });

   it('falls back to the clip centre when the drop carries no cursor', () => {
      stubClip({ left: 0, top: 0, width: 800, height: 600 });
      const placement = boardDropPlacement(makeStore({}), null, SIZE);
      expect(placement.x).toBe(400 - SIZE.width / 2);
      expect(placement.y).toBe(300 - SIZE.height / 2);
   });

   it('falls back to the world origin when the board clip is not mounted', () => {
      stubClip(null);
      const placement = boardDropPlacement(makeStore({}), { x: 420, y: 310 }, SIZE);
      expect(placement.x).toBe(-SIZE.width / 2);
      expect(placement.y).toBe(-SIZE.height / 2);
      expect(placement.zoneId).toBeUndefined();
   });

   it('joins the zone containing the drop and stacks above that zone scope', () => {
      stubClip({ left: 0, top: 0, width: 800, height: 600 });
      const zone = makeZone('zone-1', 0, 0, 400, 400);
      const member = { id: 'member-1', kind: 'card', x: 10, y: 10, width: 10, height: 10, z: 7, zoneId: 'zone-1' } as unknown as BoardItem;
      const placement = boardDropPlacement(makeStore({ 'zone-1': zone, 'member-1': member }), { x: 200, y: 200 }, SIZE);
      expect(placement.zoneId).toBe('zone-1');
      expect(placement.z).toBe(8);
   });

   it('joins no zone when the drop centre falls outside every zone, and stacks in the root scope', () => {
      stubClip({ left: 0, top: 0, width: 800, height: 600 });
      const zone = makeZone('zone-1', 0, 0, 100, 100);
      const rootItem = { id: 'root-1', kind: 'card', x: 0, y: 0, width: 10, height: 10, z: 3 } as unknown as BoardItem;
      const placement = boardDropPlacement(makeStore({ 'zone-1': zone, 'root-1': rootItem }), { x: 600, y: 500 }, SIZE);
      expect(placement.zoneId).toBeUndefined();
      expect(placement.z).toBe(4);
   });
});
