// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { DEFAULT_MARKER_DIRECTION, connectionArrowGeometry, connectionEndpoints, connectionsReferencing, normalizeConnectionStyle, setConnectionMarker } from './boardConnections';
import { createBoard } from './boardRepository';
import { createBoardStore } from '@/lib/stores/boardStore';
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';

// -- Type Imports --
import type { BoardItem } from '@/lib/types/board';

/*
 * Tests for connection geometry (box-edge intersection across orientations) and the
 * cascade lookup (which connections reference a given item).
 */

describe('connectionEndpoints', () => {
   it('clips a horizontal connection to the facing edges', () => {
      const from = { x: 0, y: 0, width: 100, height: 100 }; // centre (50,50)
      const to = { x: 200, y: 0, width: 100, height: 100 }; // centre (250,50)

      const { from: a, to: b } = connectionEndpoints(from, to);

      expect(a).toEqual({ x: 100, y: 50 }); // right edge of `from`
      expect(b).toEqual({ x: 200, y: 50 }); // left edge of `to`
   });

   it('clips a vertical connection to the facing edges', () => {
      const from = { x: 0, y: 0, width: 100, height: 100 };
      const to = { x: 0, y: 200, width: 100, height: 100 };

      const { from: a, to: b } = connectionEndpoints(from, to);

      expect(a).toEqual({ x: 50, y: 100 }); // bottom edge of `from`
      expect(b).toEqual({ x: 50, y: 200 }); // top edge of `to`
   });

   it('clips a 45-degree diagonal to the corners', () => {
      const from = { x: 0, y: 0, width: 100, height: 100 }; // centre (50,50)
      const to = { x: 200, y: 200, width: 100, height: 100 }; // centre (250,250)

      const { from: a, to: b } = connectionEndpoints(from, to);

      expect(a).toEqual({ x: 100, y: 100 }); // bottom-right corner of `from`
      expect(b).toEqual({ x: 200, y: 200 }); // top-left corner of `to`
   });

   it('treats a zero-size target as a free endpoint at its centre (drag preview)', () => {
      const from = { x: 0, y: 0, width: 100, height: 100 };
      const cursor = { x: 300, y: 50, width: 0, height: 0 };

      const { from: a, to: b } = connectionEndpoints(from, cursor);

      expect(a).toEqual({ x: 100, y: 50 }); // still clipped to `from`'s edge
      expect(b).toEqual({ x: 300, y: 50 }); // the cursor itself
   });

   it('pulls a corner exit onto the straight part of a rounded outline (no overhang in the corner gap)', () => {
      const from = { x: 0, y: 0, width: 100, height: 100, radius: 20 }; // centre (50,50)
      const to = { x: 200, y: 200, width: 100, height: 100, radius: 20 }; // centre (250,250)

      const { from: a, to: b } = connectionEndpoints(from, to);

      // A sharp box would land at the corners (100,100)/(200,200); the radius clamps each axis in by 20.
      expect(a).toEqual({ x: 80, y: 80 });
      expect(b).toEqual({ x: 220, y: 220 });
   });

   it('clamps an off-centre edge exit that strays into the corner region, but leaves a mid-edge exit alone', () => {
      const box = { x: 0, y: 0, width: 100, height: 100, radius: 20 }; // centre (50,50); straight span y in [20,80]
      // Exits the right edge at y=85 (in the corner region) -> clamped to 80.
      expect(connectionEndpoints(box, { x: 150, y: 120, width: 0, height: 0 }).from).toEqual({ x: 100, y: 80 });
      // Exits the right edge at y=65 (on the straight part) -> unchanged.
      expect(connectionEndpoints(box, { x: 150, y: 80, width: 0, height: 0 }).from).toEqual({ x: 100, y: 65 });
   });

   it('anchors on a rotated box real edge, not the axis-aligned one', () => {
      // A 100x40 box centred at the origin, rotated 90deg: its visual extent is 40 wide (x in [-20, 20]).
      // A line heading right must meet x=20 (the rotated edge), not x=50 (the un-rotated edge).
      const box = { x: -50, y: -20, width: 100, height: 40, radius: 0, rotation: 90 };
      const { from } = connectionEndpoints(box, { x: 100, y: 0, width: 0, height: 0 });
      expect(from.x).toBeCloseTo(20);
      expect(from.y).toBeCloseTo(0);
   });

   it('anchors a circular kind (pin) to its circle, not its box corner', () => {
      const pin = { x: 0, y: 0, width: 28, height: 28, circle: true }; // centre (14,14), r=14
      // Diagonal approach: the box corner (28,28) would overhang; the circle point sits on the dot.
      const { from } = connectionEndpoints(pin, { x: 114, y: 114, width: 0, height: 0 });
      expect(Math.hypot(from.x - 14, from.y - 14)).toBeCloseTo(14); // exactly on the circle
      expect(from.x).toBeCloseTo(14 + 14 / Math.SQRT2);
      expect(from.y).toBeCloseTo(14 + 14 / Math.SQRT2);
   });
});

describe('normalizeConnectionStyle', () => {
   it('migrates a legacy center `arrow` to `markers.middle` and drops `arrow`', () => {
      const legacy = { width: 3, color: '#fff', pathType: 'straight', arrow: { type: 'full', direction: 'forward' } } as const;
      const next = normalizeConnectionStyle(legacy) as typeof legacy & { markers?: { middle?: unknown } };
      expect(next.markers).toEqual({ middle: { type: 'full', direction: 'forward' } });
      expect('arrow' in next).toBe(false);
   });

   it('backfills a missing `pathType` while migrating the arrow', () => {
      const legacy = { width: 3, color: '#fff', arrow: { type: 'chevron', direction: 'backward' } } as const;
      const next = normalizeConnectionStyle(legacy);
      expect(next.pathType).toBe('straight');
      expect(next.markers).toEqual({ middle: { type: 'chevron', direction: 'backward' } });
      expect('arrow' in next).toBe(false);
   });

   it('leaves an already-migrated style unchanged (idempotent)', () => {
      const migrated = { width: 3, color: '#fff', pathType: 'straight', markers: { middle: { type: 'full', direction: 'forward' } } } as const;
      const next = normalizeConnectionStyle(migrated);
      expect(next).toBe(migrated); // same reference: nothing to do
      expect(normalizeConnectionStyle(next)).toEqual(migrated);
   });

   it('leaves a style with neither `arrow` nor `pathType` gap clean', () => {
      const clean = { width: 2, color: '#000', pathType: 'bezier' } as const;
      expect(normalizeConnectionStyle(clean)).toBe(clean);
   });
});

describe('setConnectionMarker', () => {
   const full = { type: 'full', direction: 'forward' } as const;
   const chevron = { type: 'chevron', direction: 'backward' } as const;

   it('sets a marker at a position on an empty set', () => {
      expect(setConnectionMarker(undefined, 'end', full)).toEqual({ end: full });
   });

   it('preserves the other positions when editing one', () => {
      const next = setConnectionMarker({ start: chevron, end: full }, 'middle', full);
      expect(next).toEqual({ start: chevron, middle: full, end: full });
   });

   it('clears one position and keeps the rest', () => {
      const next = setConnectionMarker({ start: chevron, end: full }, 'end', undefined);
      expect(next).toEqual({ start: chevron });
   });

   it('drops the whole set once the last marker is cleared', () => {
      expect(setConnectionMarker({ middle: full }, 'middle', undefined)).toBeUndefined();
   });

   it('does not mutate the input', () => {
      const markers = { start: chevron } as const;
      setConnectionMarker(markers, 'end', full);
      expect(markers).toEqual({ start: chevron });
   });

   it('carries a sensible default direction per position', () => {
      expect(DEFAULT_MARKER_DIRECTION).toEqual({ start: 'backward', middle: 'forward', end: 'forward' });
   });
});

describe('connectionArrowGeometry', () => {
   // A horizontal line left->right; the midpoint is (100,0).
   const from = { x: 0, y: 0 };
   const to = { x: 200, y: 0 };

   it('centres the marker on the endpoints midpoint', () => {
      const { mid } = connectionArrowGeometry(from, to, { type: 'full', direction: 'forward' }, 3);
      expect(mid).toEqual({ x: 100, y: 0 });
   });

   it('points a forward marker toward `to` (tip past the midpoint, wings behind, splayed symmetrically)', () => {
      const { points } = connectionArrowGeometry(from, to, { type: 'full', direction: 'forward' }, 3);
      const [wingA, tip, wingB] = points;
      // Tip lies ahead of the midpoint on the +x side; wings trail behind on the -x side.
      expect(tip.x).toBeGreaterThan(100);
      expect(tip.y).toBeCloseTo(0);
      expect(wingA.x).toBeLessThan(100);
      expect(wingB.x).toBeLessThan(100);
      // Wings splay symmetrically across the line (equal and opposite y).
      expect(wingA.y).toBeCloseTo(-wingB.y);
      expect(Math.abs(wingA.y)).toBeGreaterThan(0);
   });

   it('flips a backward marker 180° - the tip crosses to the `from` side', () => {
      const fwd = connectionArrowGeometry(from, to, { type: 'full', direction: 'forward' }, 3);
      const bwd = connectionArrowGeometry(from, to, { type: 'full', direction: 'backward' }, 3);
      // Same midpoint; the tip mirrors across it.
      expect(bwd.mid).toEqual(fwd.mid);
      expect(bwd.points[1].x).toBeCloseTo(2 * fwd.mid.x - fwd.points[1].x);
      expect(bwd.points[1].x).toBeLessThan(100); // now pointing toward `from`
   });

   it('scales with the connection width', () => {
      const thin = connectionArrowGeometry(from, to, { type: 'full', direction: 'forward' }, 1);
      const thick = connectionArrowGeometry(from, to, { type: 'full', direction: 'forward' }, 8);
      // A thicker line yields a longer reach (tip further from the midpoint) and a wider splay.
      expect(thick.points[1].x - thick.mid.x).toBeGreaterThan(thin.points[1].x - thin.mid.x);
      expect(Math.abs(thick.points[0].y)).toBeGreaterThan(Math.abs(thin.points[0].y));
   });

   it('returns the same three points for full and chevron (fill vs stroke is the render choice)', () => {
      const full = connectionArrowGeometry(from, to, { type: 'full', direction: 'forward' }, 3);
      const chevron = connectionArrowGeometry(from, to, { type: 'chevron', direction: 'forward' }, 3);
      expect(chevron.points).toEqual(full.points);
   });
});

/** Minimal board-item factory for the cascade lookup. */
function item(id: string, content: BoardItem['content']): BoardItem {
   return { id, kind: content.kind, x: 0, y: 0, width: 0, height: 0, z: 0, content };
}

describe('connectionsReferencing', () => {
   it('finds connections referencing an item as `from` or `to`, ignoring unrelated ones', () => {
      const items: Record<string, BoardItem> = {
         a: item('a', { kind: 'post-it', mode: 'copy', data: { id: 'n26', text: '' } }),
         b: item('b', { kind: 'post-it', mode: 'copy', data: { id: 'n27', text: '' } }),
         c: item('c', { kind: 'post-it', mode: 'copy', data: { id: 'n28', text: '' } }),
         'conn-ab': item('conn-ab', { kind: 'connection', from: 'a', to: 'b', style: { width: 2, color: '#fff' } }),
         'conn-ca': item('conn-ca', { kind: 'connection', from: 'c', to: 'a', style: { width: 2, color: '#fff' } }),
         'conn-bc': item('conn-bc', { kind: 'connection', from: 'b', to: 'c', style: { width: 2, color: '#fff' } }),
      };

      expect(connectionsReferencing(items, 'a').sort()).toEqual(['conn-ab', 'conn-ca']);
      expect(connectionsReferencing(items, 'c').sort()).toEqual(['conn-bc', 'conn-ca'].sort());
      expect(connectionsReferencing(items, 'missing')).toEqual([]);
   });
});

describe('cascade delete (no orphan connections)', () => {
   beforeEach(async () => {
      await drawerDatabase.boards.clear();
      await drawerDatabase.boardItems.clear();
   });

   it('removing an endpoint item also removes its connections, leaving the other item', async () => {
      const board = await createBoard('Test');
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);
      const add = store.getState().actions.addItem;
      await add({ id: 'a', kind: 'post-it', x: 0, y: 0, width: 100, height: 100, z: 0, content: { kind: 'post-it', mode: 'copy', data: { id: 'n29', text: '' } } });
      await add({ id: 'b', kind: 'post-it', x: 200, y: 0, width: 100, height: 100, z: 1, content: { kind: 'post-it', mode: 'copy', data: { id: 'n30', text: '' } } });
      await add({ id: 'conn', kind: 'connection', x: 0, y: 0, width: 0, height: 0, z: 2, content: { kind: 'connection', from: 'a', to: 'b', style: { width: 3, color: '#3b82f6' } } });

      // The cascade BoardView performs: delete connections referencing 'a', then 'a'.
      const toDelete = connectionsReferencing(store.getState().items, 'a');
      expect(toDelete).toEqual(['conn']);
      for (const id of toDelete) await store.getState().actions.deleteItem(id);
      await store.getState().actions.deleteItem('a');

      expect(Object.keys(store.getState().items).sort()).toEqual(['b']); // no orphan connection
   });
});
