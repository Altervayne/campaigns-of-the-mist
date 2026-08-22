// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import * as repository from './boardRepository';
import { BOARD_SCHEMA_VERSION } from './boardRecords';
import { DRAWER_ROOT_PARENT_ID } from '@/lib/drawer/drawerRecords';

// -- Type Imports --
import type { BoardItemRecord } from './boardRecords';
import type { Board, BoardItem } from '@/lib/types/board';

/*
 * Unit tests for the board repository against fake-indexeddb. Covers board CRUD,
 * item CRUD + bulk, z-ordered listing, cascade delete, the aggregate read, and the
 * reset-app clear. Content is opaque to the repo, so the fixtures use the minimal
 * per-kind payloads.
 */

/** Builds a flat board-item record with sane placement defaults. */
function makeItem(id: string, boardId: string, z: number, overrides: Partial<BoardItemRecord> = {}): BoardItemRecord {
   return {
      id,
      boardId,
      kind: 'post-it',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      z,
      content: { kind: 'post-it', mode: 'copy', data: { id: 'n17', text: id } },
      ...overrides,
   };
}

/** Builds an assembled board item (no `boardId`) for aggregate fixtures. */
function makeBoardItem(id: string, overrides: Partial<BoardItem> = {}): BoardItem {
   return { id, kind: 'post-it', x: 0, y: 0, width: 100, height: 100, z: 0, content: { kind: 'post-it', mode: 'copy', data: { id: 'n18', text: id } }, ...overrides };
}

beforeEach(async () => {
   await drawerDatabase.boards.clear();
   await drawerDatabase.boardItems.clear();
   await drawerDatabase.items.clear();
});

describe('board CRUD', () => {
   it('creates a board with a fresh id, default viewport, and schema version', async () => {
      const board = await repository.createBoard('My Board');

      expect(board).toMatchObject({
         name: 'My Board',
         viewport: { x: 0, y: 0, zoom: 1 },
         schemaVersion: BOARD_SCHEMA_VERSION,
      });
      expect(typeof board.id).toBe('string');
      expect(typeof board.updatedAt).toBe('number');
      expect((await repository.getBoard(board.id))?.name).toBe('My Board');
   });

   it('lists boards most-recently-updated first', async () => {
      const first = await repository.createBoard('First');
      await new Promise((resolve) => setTimeout(resolve, 2));
      const second = await repository.createBoard('Second');

      const ids = (await repository.listBoards()).map((b) => b.id);
      expect(ids).toEqual([second.id, first.id]);
   });

   it('renames a board and refreshes updatedAt', async () => {
      const board = await repository.createBoard('Old');
      await new Promise((resolve) => setTimeout(resolve, 2));

      await repository.renameBoard(board.id, 'New');

      const reloaded = await repository.getBoard(board.id);
      expect(reloaded?.name).toBe('New');
      expect(reloaded!.updatedAt).toBeGreaterThanOrEqual(board.updatedAt);
   });

   it('rejects renaming a missing board', async () => {
      await expect(repository.renameBoard('nope', 'X')).rejects.toThrow();
   });

   it('upserts a board via saveBoard, refreshing updatedAt', async () => {
      const board = await repository.createBoard('Board');
      await new Promise((resolve) => setTimeout(resolve, 2));

      const saved = await repository.saveBoard({ ...board, viewport: { x: 50, y: 60, zoom: 2 } });

      expect(saved.updatedAt).toBeGreaterThanOrEqual(board.updatedAt);
      expect((await repository.getBoard(board.id))?.viewport).toEqual({ x: 50, y: 60, zoom: 2 });
   });
});

describe('board item CRUD', () => {
   it('adds, gets, updates, and deletes an item', async () => {
      const board = await repository.createBoard('Board');
      await repository.addItem(makeItem('item-1', board.id, 0));

      expect((await repository.getItem('item-1'))?.content).toEqual({ kind: 'post-it', mode: 'copy', data: { id: 'n17', text: 'item-1' } });

      await repository.updateItem('item-1', { x: 200, content: { kind: 'post-it', mode: 'copy', data: { id: 'n20', text: 'edited' } } });
      const updated = await repository.getItem('item-1');
      expect(updated?.x).toBe(200);
      expect(updated?.content).toEqual({ kind: 'post-it', mode: 'copy', data: { id: 'n20', text: 'edited' } });

      await repository.deleteItem('item-1');
      expect(await repository.getItem('item-1')).toBeUndefined();
   });

   it('rejects updating a missing item', async () => {
      await expect(repository.updateItem('nope', { x: 1 })).rejects.toThrow();
   });

   it('lists a board\'s items in z-order, scoped to that board', async () => {
      const a = await repository.createBoard('A');
      const b = await repository.createBoard('B');
      await repository.addItem(makeItem('a-2', a.id, 2));
      await repository.addItem(makeItem('a-0', a.id, 0));
      await repository.addItem(makeItem('a-1', a.id, 1));
      await repository.addItem(makeItem('b-0', b.id, 0));

      const ids = (await repository.listItems(a.id)).map((i) => i.id);
      expect(ids).toEqual(['a-0', 'a-1', 'a-2']); // z-ordered, board B excluded
   });

   it('bulk-puts and bulk-deletes items atomically', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([
         makeItem('i1', board.id, 0),
         makeItem('i2', board.id, 1),
         makeItem('i3', board.id, 2),
      ]);
      expect(await repository.listItems(board.id)).toHaveLength(3);

      await repository.bulkDeleteItems(['i1', 'i3', 'missing']);
      expect((await repository.listItems(board.id)).map((i) => i.id)).toEqual(['i2']);
   });

   it('persists a connection item with non-spatial zeros and opaque content', async () => {
      const board = await repository.createBoard('Board');
      await repository.addItem(
         makeItem('conn', board.id, 5, {
            kind: 'connection',
            content: { kind: 'connection', from: 'a', to: 'b', style: { width: 2, color: '#fff' } },
         }),
      );

      const item = await repository.getItem('conn');
      expect(item?.kind).toBe('connection');
      expect(item?.content).toEqual({ kind: 'connection', from: 'a', to: 'b', style: { width: 2, color: '#fff' } });
   });

   it('listAllBoardItems returns every item across all boards (for asset GC)', async () => {
      const a = await repository.createBoard('A');
      const b = await repository.createBoard('B');
      await repository.bulkPutItems([makeItem('a1', a.id, 0), makeItem('a2', a.id, 1)]);
      await repository.addItem(makeItem('b1', b.id, 0));

      const all = (await repository.listAllBoardItems()).map((i) => i.id).sort();
      expect(all).toEqual(['a1', 'a2', 'b1']);
   });
});

describe('deleteBoard (cascade)', () => {
   it('deletes the board and all its items, leaving other boards untouched', async () => {
      const target = await repository.createBoard('Target');
      const other = await repository.createBoard('Other');
      await repository.bulkPutItems([makeItem('t1', target.id, 0), makeItem('t2', target.id, 1)]);
      await repository.addItem(makeItem('o1', other.id, 0));

      await repository.deleteBoard(target.id);

      expect(await repository.getBoard(target.id)).toBeUndefined();
      expect(await repository.listItems(target.id)).toEqual([]); // no orphan items
      // The other board and its items survive.
      expect(await repository.getBoard(other.id)).toBeDefined();
      expect((await repository.listItems(other.id)).map((i) => i.id)).toEqual(['o1']);
   });

   it('is a no-op for a missing board', async () => {
      await expect(repository.deleteBoard('nope')).resolves.toBeUndefined();
   });
});

describe('loadBoard (aggregate read)', () => {
   it('assembles the board with z-ordered items', async () => {
      const board = await repository.createBoard('Board');
      await repository.saveBoard({ ...board, viewport: { x: 10, y: 20, zoom: 1.5 } });
      await repository.addItem(makeItem('i1', board.id, 1));
      await repository.addItem(makeItem('i0', board.id, 0, { kind: 'image', content: { kind: 'image', assetId: 'hash', fit: 'cover' } }));

      const aggregate = await repository.loadBoard(board.id);

      expect(aggregate).toBeDefined();
      expect(aggregate!.name).toBe('Board');
      expect(aggregate!.viewport).toEqual({ x: 10, y: 20, zoom: 1.5 });
      expect(aggregate!.items.map((i) => i.id)).toEqual(['i0', 'i1']); // z-ordered
      expect(aggregate!.items[0]).toMatchObject({ kind: 'image', content: { kind: 'image', assetId: 'hash', fit: 'cover' } });
   });

   it('returns undefined for a missing board', async () => {
      expect(await repository.loadBoard('nope')).toBeUndefined();
   });
});

describe('importBoard / loadBoard round-trip', () => {
   it('materializes an aggregate losslessly (z-order, items, connections, viewport, link)', async () => {
      const aggregate: Board = {
         id: 'board-rt',
         name: 'Round Trip',
         viewport: { x: 12, y: 34, zoom: 2 },
         drawerItemId: 'drawer-1',
         grid: { type: 'lines' },
         background: { color: '#402010', texture: 'paper' },
         nextLayerSeq: 1,
         items: [
            { id: 'a', kind: 'post-it', x: 0, y: 0, width: 100, height: 100, z: 0, content: { kind: 'post-it', mode: 'copy', data: { id: 'n22', text: 'a' } } },
            { id: 'b', kind: 'post-it', x: 10, y: 10, width: 100, height: 100, z: 1, content: { kind: 'post-it', mode: 'copy', data: { id: 'n23', text: 'b' } } },
            { id: 'conn', kind: 'connection', x: 0, y: 0, width: 0, height: 0, z: 2, content: { kind: 'connection', from: 'a', to: 'b', style: { width: 2, color: '#f00', pathType: 'straight' } } },
         ],
      };

      await repository.importBoard(aggregate);
      const reloaded = await repository.loadBoard('board-rt');

      expect(reloaded).toEqual(aggregate);
      // The connection still points at the same item ids (no re-id occurred).
      const connection = reloaded!.items.find((i) => i.kind === 'connection');
      expect(connection!.content).toMatchObject({ kind: 'connection', from: 'a', to: 'b' });
   });

   it('backfills a legacy connection with no pathType to straight on read', async () => {
      await repository.importBoard({
         id: 'board-legacy',
         name: 'Legacy',
         viewport: { x: 0, y: 0, zoom: 1 },
         drawerItemId: null,
         nextLayerSeq: 1,
         items: [
            { id: 'a', kind: 'post-it', x: 0, y: 0, width: 100, height: 100, z: 0, content: { kind: 'post-it', mode: 'copy', data: { id: 'n24', text: 'a' } } },
            { id: 'b', kind: 'post-it', x: 10, y: 10, width: 100, height: 100, z: 1, content: { kind: 'post-it', mode: 'copy', data: { id: 'n25', text: 'b' } } },
            // Pre-2.3.0 connection: no pathType stored.
            { id: 'conn', kind: 'connection', x: 0, y: 0, width: 0, height: 0, z: 2, content: { kind: 'connection', from: 'a', to: 'b', style: { width: 2, color: '#f00' } } },
         ],
      });

      const reloaded = await repository.loadBoard('board-legacy');
      const connection = reloaded!.items.find((i) => i.kind === 'connection')!;
      expect(connection.content).toMatchObject({ kind: 'connection', style: { pathType: 'straight' } });
      // A board saved before surface backgrounds existed loads with no backdrop (the plain theme canvas).
      expect(reloaded!.background).toBeUndefined();
   });

   it('replaces any existing rows for the same board id on import', async () => {
      await repository.importBoard({ id: 'b1', name: 'v1', viewport: { x: 0, y: 0, zoom: 1 }, drawerItemId: null, nextLayerSeq: 1, items: [makeBoardItem('old')] });
      await repository.importBoard({ id: 'b1', name: 'v2', viewport: { x: 0, y: 0, zoom: 1 }, drawerItemId: null, nextLayerSeq: 1, items: [makeBoardItem('new')] });

      const reloaded = await repository.loadBoard('b1');
      expect(reloaded!.name).toBe('v2');
      expect(reloaded!.items.map((i) => i.id)).toEqual(['new']);
   });
});

describe('save board to the drawer', () => {
   it('linkBoardToDrawerItem links the record and returns the aggregate', async () => {
      const board = await repository.createBoard('Linkable');
      await repository.addItem(makeItem('i1', board.id, 0));

      const aggregate = await repository.linkBoardToDrawerItem(board.id, 'drawer-xyz', { x: 5, y: 5, zoom: 1 });

      expect(aggregate.drawerItemId).toBe('drawer-xyz');
      expect(aggregate.viewport).toEqual({ x: 5, y: 5, zoom: 1 });
      expect((await repository.getBoard(board.id))?.drawerItemId).toBe('drawer-xyz');
   });

   it('saveBoardToLinkedDrawerItem writes the FULL_BOARD content and reports the update', async () => {
      const board = await repository.createBoard('Saveable');
      await repository.addItem(makeItem('i1', board.id, 0));
      // Seed the linked drawer item, then link the board to it.
      await drawerDatabase.items.put({ id: 'drw', parentFolderId: DRAWER_ROOT_PARENT_ID, order: 0, game: 'NEUTRAL', type: 'FULL_BOARD', name: 'Saveable', createdAt: 0, updatedAt: 0, content: { id: board.id, name: 'stale', viewport: { x: 0, y: 0, zoom: 1 }, drawerItemId: 'drw', nextLayerSeq: 1, items: [] } });
      await repository.linkBoardToDrawerItem(board.id, 'drw', { x: 0, y: 0, zoom: 1 });

      const result = await repository.saveBoardToLinkedDrawerItem(board.id, { x: 99, y: 99, zoom: 3 });

      expect(result.linkedItemUpdated).toBe(true);
      const stored = await drawerDatabase.items.get('drw');
      const content = stored!.content as Board;
      expect(content.viewport).toEqual({ x: 99, y: 99, zoom: 3 });
      expect(content.items.map((i) => i.id)).toEqual(['i1']);
   });

   it('reports no update when the linked drawer item is gone (caller falls back to Save As)', async () => {
      const board = await repository.createBoard('Dangling');
      await repository.linkBoardToDrawerItem(board.id, 'missing-item', { x: 0, y: 0, zoom: 1 });

      const result = await repository.saveBoardToLinkedDrawerItem(board.id, { x: 1, y: 1, zoom: 1 });

      expect(result.linkedItemUpdated).toBe(false);
   });
});

describe('clearAllBoards', () => {
   it('clears every board and item row', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([makeItem('i1', board.id, 0), makeItem('i2', board.id, 1)]);

      await repository.clearAllBoards();

      expect(await drawerDatabase.boards.count()).toBe(0);
      expect(await drawerDatabase.boardItems.count()).toBe(0);
   });
});
