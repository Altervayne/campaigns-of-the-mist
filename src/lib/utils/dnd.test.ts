// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { customCollisionDetection, mapItemToStorableInfo, sheetSectionForItemType } from './dnd';
import type { Card } from '@/lib/types/character';
import type { Journal, PostItNote } from '@/lib/types/board';

/*
 * Tests for the drawer-item branch of customCollisionDetection. The in-drawer MOVE
 * targets (folder rows, Back, the items-area drop zone) are resolved
 * by the live-geometry resolver at drop, NOT by this collision, so the branch's only
 * remaining in-drawer job is same-folder REORDER over the nearest item row (closestCenter).
 * These tests pin that: the items-area zone is never returned, the nearest item row is,
 * and an empty folder body yields no collision (the resolver lands the drop). The dnd-kit
 * collision primitives read rects from `droppableRects` + `pointerCoordinates`/
 * `collisionRect`, so we build minimal but realistic args.
 */

type Rect = { top: number; left: number; right: number; bottom: number; width: number; height: number };
const rect = (left: number, top: number, width: number, height: number): Rect => ({
   left,
   top,
   right: left + width,
   bottom: top + height,
   width,
   height,
});

interface Container {
   id: string;
   data: { current: Record<string, unknown> | undefined };
}
const container = (id: string, data?: Record<string, unknown>): Container => ({ id, data: { current: data } });

// This suite runs without a DOM, so the live-geometry reorder resolver (which reads `[data-drawer-items-area]`)
// reports no reorder: a pointer drag that isn't over a surface/primary zone is treated as a drag-out and
// yields no collision, while a keyboard drag (no pointer) still falls back to the nearest sibling row.

/**
 * Builds a collision-detection args object for a drawer-item drag. `keyboard: true` omits
 * `pointerCoordinates` to model a keyboard drag (which has no pointer).
 */
function buildArgs(params: {
   originParent: string | null;
   containers: Container[];
   rects: Array<[string, Rect]>;
   pointer: { x: number; y: number };
   keyboard?: boolean;
}) {
   const args = {
      active: { id: 'dragged-item', data: { current: { type: 'drawer-item', parentFolderId: params.originParent } } },
      collisionRect: rect(params.pointer.x - 10, params.pointer.y - 10, 20, 20),
      droppableRects: new Map<string, Rect>(params.rects),
      droppableContainers: params.containers,
      ...(params.keyboard ? {} : { pointerCoordinates: params.pointer }),
   };
   return args as unknown as Parameters<typeof customCollisionDetection>[0];
}

const ZONE = 'drawer-drop-zone-dest';
const zoneRect = rect(0, 0, 200, 400);
const itemRect = rect(0, 50, 200, 40);

describe('customCollisionDetection, drawer item (reorder only; in-drawer moves are resolver-driven)', () => {
   it('falls back to the nearest item ROW for a keyboard reorder, never the items-area zone', () => {
      const result = customCollisionDetection(
         buildArgs({
            originParent: 'dest', // origin === destination folder
            containers: [container(ZONE), container('item-1', { type: 'drawer-item', parentFolderId: 'dest' })],
            rects: [[ZONE, zoneRect], ['item-1', itemRect]],
            pointer: { x: 100, y: 60 }, // seeds the collisionRect; keyboard drag carries no pointer
            keyboard: true,
         }),
      );
      expect(result[0]?.id).toBe('item-1');
      expect(result.some((c) => c.id === ZONE)).toBe(false);
   });

   it('yields no collision when a pointer drag is not over the items body (drag-out, no reorder/scroll)', () => {
      const result = customCollisionDetection(
         buildArgs({
            originParent: 'dest',
            containers: [container(ZONE), container('item-1', { type: 'drawer-item', parentFolderId: 'dest' })],
            rects: [[ZONE, zoneRect], ['item-1', itemRect]],
            pointer: { x: 600, y: 60 }, // out over the workspace, away from the items body
         }),
      );
      expect(result).toHaveLength(0);
   });

   it('returns no collision over an EMPTY folder body (no rows), the resolver lands the drop', () => {
      const result = customCollisionDetection(
         buildArgs({
            originParent: 'origin',
            containers: [container(ZONE)],
            rects: [[ZONE, zoneRect]],
            pointer: { x: 100, y: 200 },
         }),
      );
      expect(result).toHaveLength(0);
   });
});

/*
 * Tests for the FULL_CHARACTER_SHEET (saved-character) branch. A saved character is a
 * `drawer-item` whose `item.type` is FULL_CHARACTER_SHEET, so it must reorder among its
 * siblings (closestCenter, excluding self) while the sheet/tab targets still win.
 * (Move-into-folder is resolved by the geometry resolver, not this collision, so folders
 * are not in this branch.)
 */
function buildSavedCharArgs(params: {
   containers: Container[];
   rects: Array<[string, Rect]>;
   pointer: { x: number; y: number };
   keyboard?: boolean;
}) {
   const args = {
      active: { id: 'dragged-item', data: { current: { type: 'drawer-item', item: { type: 'FULL_CHARACTER_SHEET' }, parentFolderId: 'dest' } } },
      collisionRect: rect(params.pointer.x - 10, params.pointer.y - 10, 20, 20),
      droppableRects: new Map<string, Rect>(params.rects),
      droppableContainers: params.containers,
      ...(params.keyboard ? {} : { pointerCoordinates: params.pointer }),
   };
   return args as unknown as Parameters<typeof customCollisionDetection>[0];
}

const SHEET_ZONE = 'main-character-drop-zone';
const TAB_ZONE = 'tab-strip-drop-zone';
const sheetRect = rect(500, 0, 300, 600); // the sheet, far right
const tabRect = rect(0, 0, 400, 40); // the tab strip, across the top
const sib1Rect = rect(0, 100, 200, 40);
const activeRect = rect(0, 140, 200, 40);
const savedCharContainers = (): Container[] => [
   container(SHEET_ZONE),
   container(TAB_ZONE),
   container('item-1', { type: 'drawer-item', parentFolderId: 'dest' }),
   container('dragged-item', { type: 'drawer-item', parentFolderId: 'dest' }),
];
const savedCharRects: Array<[string, Rect]> = [
   [SHEET_ZONE, sheetRect], [TAB_ZONE, tabRect], ['item-1', sib1Rect], ['dragged-item', activeRect],
];

describe('customCollisionDetection, saved character (FULL_CHARACTER_SHEET) reorder', () => {
   it('falls back to the nearest sibling drawer-item on a keyboard reorder, excluding itself', () => {
      const result = customCollisionDetection(
         buildSavedCharArgs({ containers: savedCharContainers(), rects: savedCharRects, pointer: { x: 100, y: 120 }, keyboard: true }),
      );
      expect(result[0]?.id).toBe('item-1');
      expect(result.some((c) => c.id === 'dragged-item')).toBe(false);
   });

   it('yields no collision when a pointer drag is not over a zone or the items body (drag-out)', () => {
      const result = customCollisionDetection(
         buildSavedCharArgs({ containers: savedCharContainers(), rects: savedCharRects, pointer: { x: 900, y: 300 } }),
      );
      expect(result).toHaveLength(0);
   });

   it('still prefers the play-area (sheet load) over a reorder', () => {
      const result = customCollisionDetection(
         buildSavedCharArgs({ containers: savedCharContainers(), rects: savedCharRects, pointer: { x: 650, y: 300 } }),
      );
      expect(result[0]?.id).toBe(SHEET_ZONE);
   });

   it('still prefers the tab strip (open as tab) over a reorder', () => {
      const result = customCollisionDetection(
         buildSavedCharArgs({ containers: savedCharContainers(), rects: savedCharRects, pointer: { x: 200, y: 20 } }),
      );
      expect(result[0]?.id).toBe(TAB_ZONE);
   });

   it('resolves no reorder target when the saved character is the only item (no siblings)', () => {
      const result = customCollisionDetection(
         buildSavedCharArgs({
            containers: [container(SHEET_ZONE), container(TAB_ZONE), container('dragged-item', { type: 'drawer-item', parentFolderId: 'dest' })],
            rects: [[SHEET_ZONE, sheetRect], [TAB_ZONE, tabRect], ['dragged-item', activeRect]],
            pointer: { x: 100, y: 160 },
         }),
      );
      expect(result).toHaveLength(0);
   });
});

describe('mapItemToStorableInfo / sheetSectionForItemType - Challenge Card', () => {
   it('maps a challenge card to CHALLENGE_CARD, carrying its own (LEGENDS) game', () => {
      const challenge = { cardType: 'CHALLENGE_CARD', details: { game: 'LEGENDS' } } as unknown as Card;
      expect(mapItemToStorableInfo(challenge)).toEqual(['CHALLENGE_CARD', 'LEGENDS']);
   });

   it('sections a challenge card under cards, alongside the other card types', () => {
      expect(sheetSectionForItemType('CHALLENGE_CARD')).toBe('cards');
   });
});

describe('mapItemToStorableInfo - post-it & journal notes (game-agnostic)', () => {
   it('maps a post-it note to POST_IT, NEUTRAL', () => {
      const note: PostItNote = { id: 'p1', text: 'Scene framing questions', color: '#fde68a' };
      expect(mapItemToStorableInfo(note)).toEqual(['POST_IT', 'NEUTRAL']);
   });

   it('maps a color-less post-it note to POST_IT, NEUTRAL', () => {
      const note: PostItNote = { id: 'p2', text: 'No color set' };
      expect(mapItemToStorableInfo(note)).toEqual(['POST_IT', 'NEUTRAL']);
   });

   it('maps a journal to JOURNAL, NEUTRAL', () => {
      const journal: Journal = {
         id: 'j1',
         title: '',
         pages: [{ id: 'pg1', text: 'Session one' }],
         bookmarks: [{ id: 'bm1', pageId: 'pg1', label: 'Start' }],
      };
      expect(mapItemToStorableInfo(journal)).toEqual(['JOURNAL', 'NEUTRAL']);
   });

   it('sections a JOURNAL drawer item under cards (a journal is a card-footprint element)', () => {
      expect(sheetSectionForItemType('JOURNAL')).toBe('cards');
   });
});
