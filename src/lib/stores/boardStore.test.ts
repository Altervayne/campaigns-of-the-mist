// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import * as repository from '@/lib/board/boardRepository';
import { flattenBoardOrder } from '@/lib/board/boardTree';
import { createBoardStore } from './boardStore';
import { useAppGeneralStateStore } from './appGeneralStateStore';
import { DRAWER_ROOT_PARENT_ID } from '@/lib/drawer/drawerRecords';

// -- Type Imports --
import type { Board, BoardItem } from '@/lib/types/board';
import type { BoardItemRecord } from '@/lib/board/boardRecords';

/*
 * Tests for the in-memory board store factory against fake-indexeddb. They assert the
 * optimistic-apply + command-persist + resync loop (memory AND repo agree), that undo
 * resyncs the view, that bring-to-front / send-to-back z math is correct, that
 * canUndo/canRedo track each instance's engine reactively, that the viewport persists
 * (debounced) without entering undo, that a failed command reverts the in-memory map,
 * and that two stores share no undo history.
 */

/** Builds an assembled board item (no `boardId`; the store adds it on persist). */
function makeItem(id: string, z: number, overrides: Partial<BoardItem> = {}): BoardItem {
   return {
      id,
      kind: 'post-it',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      z,
      content: { kind: 'post-it', mode: 'copy', data: { id: 'n2', text: id } },
      ...overrides,
   };
}

/** Builds a flat record for seeding the repo directly (for hydrate fixtures). */
function makeRecord(id: string, boardId: string, z: number, overrides: Partial<BoardItemRecord> = {}): BoardItemRecord {
   return { ...makeItem(id, z), boardId, ...overrides };
}

/** Polls `check` until it returns a value, or throws after `timeoutMs` (robust to debounce timing under load). */
async function waitFor<T>(check: () => Promise<T | undefined> | T | undefined, timeoutMs = 1000): Promise<T> {
   const deadline = Date.now() + timeoutMs;
   for (;;) {
      const value = await check();
      if (value !== undefined) return value;
      if (Date.now() > deadline) throw new Error('waitFor timed out');
      await new Promise((resolve) => setTimeout(resolve, 5));
   }
}

beforeEach(async () => {
   await drawerDatabase.boards.clear();
   await drawerDatabase.boardItems.clear();
   await drawerDatabase.items.clear();
   // Start from a non-board last-modified so the assertions below prove a flip.
   useAppGeneralStateStore.getState().actions.setLastModifiedStore('drawer');
});

// ==================
//  Hydration
// ==================

describe('hydrate', () => {
   it('loads name, viewport, and items, and clears undo history', async () => {
      const board = await repository.createBoard('My Board');
      await repository.saveBoard({ ...board, viewport: { x: 10, y: 20, zoom: 1.5 } });
      await repository.bulkPutItems([makeRecord('a', board.id, 0), makeRecord('b', board.id, 1)]);

      const store = createBoardStore();
      // A leftover undo entry from a previous board must not survive a (re)hydrate.
      await store.getState().actions.addItem(makeItem('stale', 0));
      const orphanBoard = await repository.createBoard('Orphan');
      await store.getState().actions.hydrate(orphanBoard.id); // switch boards
      expect(store.getState().canUndo).toBe(false);

      await store.getState().actions.hydrate(board.id);
      expect(store.getState().name).toBe('My Board');
      expect(store.getState().viewport).toEqual({ x: 10, y: 20, zoom: 1.5 });
      expect(Object.keys(store.getState().items).sort()).toEqual(['a', 'b']);
      expect(store.getState().canUndo).toBe(false);
   });

   it('tolerates a missing board with an error state', async () => {
      const store = createBoardStore();
      await store.getState().actions.hydrate('nope');
      expect(store.getState().error).toMatch(/not found/i);
      expect(store.getState().boardId).toBeNull();
      expect(store.getState().items).toEqual({});
   });

   it('seeds nextLayerSeq when the record predates the counter, so minted drawings get 1, 2 - never NaN', async () => {
      const board = await repository.createBoard('Board');
      // An old dev board whose record was written before the layer counter existed.
      await repository.saveBoard({ ...board, nextLayerSeq: undefined as unknown as number });
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);
      expect(store.getState().nextLayerSeq).toBe(1);

      await store.getState().actions.addItem(makeItem('d1', 0, { kind: 'drawing', content: { kind: 'drawing', strokes: [] } }));
      await store.getState().actions.addItem(makeItem('d2', 1, { kind: 'drawing', content: { kind: 'drawing', strokes: [] } }));
      const seqOf = (id: string) => (store.getState().items[id].content as { seq?: number }).seq;
      expect(seqOf('d1')).toBe(1);
      expect(seqOf('d2')).toBe(2);
   });

   it('is not poisoned by a NaN seq / counter left by an earlier buggy build', async () => {
      const board = await repository.createBoard('Board');
      await repository.saveBoard({ ...board, nextLayerSeq: NaN });
      await repository.bulkPutItems([makeRecord('bad', board.id, 0, { kind: 'drawing', content: { kind: 'drawing', strokes: [], seq: NaN } })]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);
      expect(store.getState().nextLayerSeq).toBe(1); // NaN screened out, not propagated

      await store.getState().actions.addItem(makeItem('d1', 1, { kind: 'drawing', content: { kind: 'drawing', strokes: [] } }));
      expect((store.getState().items['d1'].content as { seq?: number }).seq).toBe(1);
   });
});

// ==================
//  Unsaved-changes flag + drawer save
// ==================

describe('drawer save (dirty flag + link)', () => {
   it('starts clean, dirties on a mutation, and a drawer save clears it again', async () => {
      const board = await repository.createBoard('Dirty');
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);
      expect(store.getState().hasUnsavedChanges).toBe(false);
      expect(store.getState().drawerItemId).toBeNull();

      await store.getState().actions.addItem(makeItem('i1', 0));
      expect(store.getState().hasUnsavedChanges).toBe(true);

      // "Save As": link to a (seeded) drawer item; the link marks the board clean.
      await drawerDatabase.items.put({
         id: 'drw', parentFolderId: DRAWER_ROOT_PARENT_ID, order: 0, game: 'NEUTRAL', type: 'FULL_BOARD', name: 'Dirty', createdAt: 0, updatedAt: 0,
         content: { id: board.id, name: 'Dirty', viewport: { x: 0, y: 0, zoom: 1 }, drawerItemId: 'drw', nextLayerSeq: 1, items: [] },
      });
      const aggregate = await store.getState().actions.linkToDrawerItem('drw');
      expect(aggregate?.drawerItemId).toBe('drw');
      expect(store.getState().drawerItemId).toBe('drw');
      expect(store.getState().hasUnsavedChanges).toBe(false);

      // A further edit re-dirties; "Save" to the linked item clears it and writes the content.
      await store.getState().actions.addItem(makeItem('i2', 1));
      expect(store.getState().hasUnsavedChanges).toBe(true);

      const result = await store.getState().actions.saveToDrawer();
      expect(result?.linkedItemUpdated).toBe(true);
      expect(store.getState().hasUnsavedChanges).toBe(false);

      const stored = await drawerDatabase.items.get('drw');
      const content = stored!.content as Board;
      expect(content.items.map((i) => i.id).sort()).toEqual(['i1', 'i2']);
   });
});

// ==================
//  Mutating actions: optimistic apply + persist + undo resync
// ==================

describe('mutating actions', () => {
   it('addItem applies optimistically, persists via the command, and undo reverts both', async () => {
      const board = await repository.createBoard('Board');
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.addItem(makeItem('item-1', 0, { x: 5 }));
      expect(store.getState().items['item-1']).toMatchObject({ x: 5 }); // optimistic in memory
      expect(await repository.getItem('item-1')).toMatchObject({ x: 5, boardId: board.id }); // persisted

      await store.getState().actions.undo();
      expect(store.getState().items['item-1']).toBeUndefined(); // resynced view
      expect(await repository.getItem('item-1')).toBeUndefined();
   });

   it('moveItem applies optimistically, persists, and undo restores the prior position', async () => {
      const board = await repository.createBoard('Board');
      await repository.addItem(makeRecord('item-1', board.id, 0, { x: 0, y: 0 }));
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.moveItem('item-1', { x: 300, y: 400 });
      expect(store.getState().items['item-1']).toMatchObject({ x: 300, y: 400 });
      expect(await repository.getItem('item-1')).toMatchObject({ x: 300, y: 400 });

      await store.getState().actions.undo();
      expect(store.getState().items['item-1']).toMatchObject({ x: 0, y: 0 });
      expect(await repository.getItem('item-1')).toMatchObject({ x: 0, y: 0 });
   });

   it('resizeItem persists dimensions (and x/y on a corner resize), undo restores', async () => {
      const board = await repository.createBoard('Board');
      await repository.addItem(makeRecord('item-1', board.id, 0, { x: 10, y: 20, width: 100, height: 100 }));
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.resizeItem('item-1', { width: 250, height: 180, x: 40, y: 60 });
      expect(store.getState().items['item-1']).toMatchObject({ width: 250, height: 180, x: 40, y: 60 });
      expect(await repository.getItem('item-1')).toMatchObject({ width: 250, height: 180, x: 40, y: 60 });

      await store.getState().actions.undo();
      expect(store.getState().items['item-1']).toMatchObject({ width: 100, height: 100, x: 10, y: 20 });
   });

   it('rotateItem persists a normalized angle, undo restores the prior rotation', async () => {
      const board = await repository.createBoard('Board');
      await repository.addItem(makeRecord('item-1', board.id, 0, { rotation: 30 }));
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // An over-360 angle normalizes into [0, 360) on write.
      await store.getState().actions.rotateItem('item-1', 380);
      expect(store.getState().items['item-1'].rotation).toBe(20);
      expect((await repository.getItem('item-1'))?.rotation).toBe(20);

      await store.getState().actions.undo();
      expect(store.getState().items['item-1'].rotation).toBe(30);
   });

   it('updateItemContent persists new content, undo restores the old content', async () => {
      const board = await repository.createBoard('Board');
      await repository.addItem(makeRecord('item-1', board.id, 0, { content: { kind: 'post-it', mode: 'copy', data: { id: 'n3', text: 'old' } } }));
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.updateItemContent('item-1', { kind: 'post-it', mode: 'copy', data: { id: 'n4', text: 'new' } });
      expect(store.getState().items['item-1'].content).toEqual({ kind: 'post-it', mode: 'copy', data: { id: 'n4', text: 'new' } });
      expect((await repository.getItem('item-1'))?.content).toEqual({ kind: 'post-it', mode: 'copy', data: { id: 'n4', text: 'new' } });

      await store.getState().actions.undo();
      expect(store.getState().items['item-1'].content).toEqual({ kind: 'post-it', mode: 'copy', data: { id: 'n3', text: 'old' } });
   });

   it('appendStroke adds one stroke as a delta, and undo peels exactly that stroke', async () => {
      const board = await repository.createBoard('Board');
      await repository.addItem(makeRecord('layer', board.id, 0, { kind: 'drawing', width: 1, height: 1, content: { kind: 'drawing', strokes: [{ id: 's1', brush: 'pen', color: null, width: 3, points: [0, 0, 1, 1] }] } }));
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // World points inside the current extent: box holds, only the strokes grow.
      await store.getState().actions.appendStroke('layer', { id: 's2', brush: 'pen', color: null, width: 3, points: [0, 0, 1, 1] });
      const afterAppend = store.getState().items['layer'].content;
      expect(afterAppend.kind === 'drawing' && afterAppend.strokes.map((s) => s.id)).toEqual(['s1', 's2']);
      const persisted = (await repository.getItem('layer'))?.content;
      expect(persisted?.kind === 'drawing' && persisted.strokes.map((s) => s.id)).toEqual(['s1', 's2']);

      await store.getState().actions.undo();
      const afterUndo = store.getState().items['layer'].content;
      // Undo removes only the appended stroke (a pure delta), leaving the layer's prior strokes intact.
      expect(afterUndo.kind === 'drawing' && afterUndo.strokes.map((s) => s.id)).toEqual(['s1']);
   });

   it('appendStroke grows the box to the ink extent, and undo/redo converge it (memory == repo)', async () => {
      const board = await repository.createBoard('Board');
      await repository.addItem(makeRecord('layer', board.id, 0, { kind: 'drawing', x: 0, y: 0, width: 10, height: 10, content: { kind: 'drawing', strokes: [{ id: 's1', brush: 'pen', color: null, width: 3, points: [0, 0, 10, 10] }] } }));
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // A world stroke reaching up/left of the origin: the box must shift its origin and grow.
      await store.getState().actions.appendStroke('layer', { id: 's2', brush: 'pen', color: null, width: 3, points: [-5, -5, 2, 2] });
      const grown = store.getState().items['layer'];
      expect({ x: grown.x, y: grown.y, width: grown.width, height: grown.height }).toEqual({ x: -5, y: -5, width: 15, height: 15 });
      // The optimistic view and the persisted record agree (the additive fast path relies on this).
      const grownRepo = await repository.getItem('layer');
      expect({ x: grownRepo?.x, y: grownRepo?.y, width: grownRepo?.width, height: grownRepo?.height }).toEqual({ x: -5, y: -5, width: 15, height: 15 });

      await store.getState().actions.undo();
      const shrunk = store.getState().items['layer'];
      expect({ x: shrunk.x, y: shrunk.y, width: shrunk.width, height: shrunk.height }).toEqual({ x: 0, y: 0, width: 10, height: 10 });
      expect(shrunk.content.kind === 'drawing' && shrunk.content.strokes.map((s) => s.id)).toEqual(['s1']);

      await store.getState().actions.redo();
      const regrown = store.getState().items['layer'];
      expect({ x: regrown.x, y: regrown.y, width: regrown.width, height: regrown.height }).toEqual({ x: -5, y: -5, width: 15, height: 15 });
      const regrownRepo = await repository.getItem('layer');
      expect({ x: regrownRepo?.x, y: regrownRepo?.y, width: regrownRepo?.width, height: regrownRepo?.height }).toEqual({ x: -5, y: -5, width: 15, height: 15 });
   });

   it('transformStrokes moves a stroke, co-writes the refit box, and undo restores the whole before-state', async () => {
      const board = await repository.createBoard('Board');
      // A layer with two strokes: s1 spanning 0..10, s2 a dot at (2,2). Box is 0,0 10x10.
      await repository.addItem(makeRecord('layer', board.id, 0, { kind: 'drawing', x: 0, y: 0, width: 10, height: 10, content: { kind: 'drawing', strokes: [
         { id: 's1', brush: 'pen', color: null, width: 3, points: [0, 0, 10, 10] },
         { id: 's2', brush: 'pen', color: null, width: 3, points: [2, 2] },
      ] } }));
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // Move s2 up/left by (-5,-5), from (2,2) to (-3,-3): the box origin shifts to (-3,-3) - s2's new min -
      // and grows to hold s1's far corner (10,10), so 13x13.
      await store.getState().actions.transformStrokes('layer', [
         { id: 's1', brush: 'pen', color: null, width: 3, points: [0, 0, 10, 10] },
         { id: 's2', brush: 'pen', color: null, width: 3, points: [-3, -3] },
      ]);
      const moved = store.getState().items['layer'];
      expect({ x: moved.x, y: moved.y, width: moved.width, height: moved.height }).toEqual({ x: -3, y: -3, width: 13, height: 13 });
      // The optimistic view and the persisted record agree (the additive fast path relies on this).
      const movedRepo = await repository.getItem('layer');
      expect({ x: movedRepo?.x, y: movedRepo?.y, width: movedRepo?.width, height: movedRepo?.height }).toEqual({ x: -3, y: -3, width: 13, height: 13 });

      // Undo restores origin, size, AND strokes together (never a content-only revert leaving a stale box).
      await store.getState().actions.undo();
      const back = store.getState().items['layer'];
      expect({ x: back.x, y: back.y, width: back.width, height: back.height }).toEqual({ x: 0, y: 0, width: 10, height: 10 });
      const backContent = back.content;
      expect(backContent.kind === 'drawing' && backContent.strokes.find((s) => s.id === 's2')?.points).toEqual([2, 2]);
   });

   it('eraseStrokes removes strokes and deletes an emptied layer as one step, undo/redo converge (box + layer)', async () => {
      const board = await repository.createBoard('Board');
      // Layer A keeps a survivor after the erase; layer B loses all its strokes (so it is deleted).
      await repository.addItem(makeRecord('layerA', board.id, 0, { kind: 'drawing', x: 0, y: 0, width: 20, height: 20, content: { kind: 'drawing', strokes: [
         { id: 'a1', brush: 'pen', color: null, width: 3, points: [0, 0, 10, 10] },
         { id: 'a2', brush: 'pen', color: null, width: 3, points: [12, 12, 20, 20] },
      ] } }));
      await repository.addItem(makeRecord('layerB', board.id, 1, { kind: 'drawing', x: 100, y: 100, width: 10, height: 10, content: { kind: 'drawing', strokes: [
         { id: 'b1', brush: 'pen', color: null, width: 3, points: [0, 0, 10, 10] },
      ] } }));
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // Erase a2 (partial, box re-fits) and all of layerB (deleted), one gesture.
      await store.getState().actions.eraseStrokes([
         { layerId: 'layerA', strokeIds: ['a2'] },
         { layerId: 'layerB', strokeIds: ['b1'] },
      ]);
      const a = store.getState().items['layerA'];
      expect({ x: a.x, y: a.y, width: a.width, height: a.height }).toEqual({ x: 0, y: 0, width: 10, height: 10 });
      expect(a.content.kind === 'drawing' && a.content.strokes.map((s) => s.id)).toEqual(['a1']);
      expect(store.getState().items['layerB']).toBeUndefined();
      // The full resync (non-additive) keeps memory == repo.
      const aRepo = await repository.getItem('layerA');
      expect({ x: aRepo?.x, y: aRepo?.y, width: aRepo?.width, height: aRepo?.height }).toEqual({ x: 0, y: 0, width: 10, height: 10 });
      expect(await repository.getItem('layerB')).toBeUndefined();

      await store.getState().actions.undo();
      const aBack = store.getState().items['layerA'];
      expect({ x: aBack.x, y: aBack.y, width: aBack.width, height: aBack.height }).toEqual({ x: 0, y: 0, width: 20, height: 20 });
      expect(aBack.content.kind === 'drawing' && aBack.content.strokes.map((s) => s.id).sort()).toEqual(['a1', 'a2']);
      expect(store.getState().items['layerB']).toMatchObject({ x: 100, y: 100 });

      await store.getState().actions.redo();
      const aRedo = store.getState().items['layerA'];
      expect({ x: aRedo.x, y: aRedo.y, width: aRedo.width, height: aRedo.height }).toEqual({ x: 0, y: 0, width: 10, height: 10 });
      expect(store.getState().items['layerB']).toBeUndefined();
   });

   it('deleteItem removes optimistically and persists, undo restores the record', async () => {
      const board = await repository.createBoard('Board');
      await repository.addItem(makeRecord('item-1', board.id, 0, { x: 7 }));
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.deleteItem('item-1');
      expect(store.getState().items['item-1']).toBeUndefined();
      expect(await repository.getItem('item-1')).toBeUndefined();

      await store.getState().actions.undo();
      expect(store.getState().items['item-1']).toMatchObject({ x: 7 });
      expect(await repository.getItem('item-1')).toMatchObject({ x: 7 });
   });
});

// ==================
//  z ordering
// ==================

describe('bringToFront / sendToBack', () => {
   it('computes max(z)+1 and min(z)-1 over the live items', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([
         makeRecord('a', board.id, 0),
         makeRecord('b', board.id, 1),
         makeRecord('c', board.id, 2),
      ]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.bringToFront('a');
      expect(store.getState().items['a'].z).toBe(3); // max(0,1,2) + 1
      expect((await repository.getItem('a'))?.z).toBe(3);

      await store.getState().actions.sendToBack('a');
      expect(store.getState().items['a'].z).toBe(0); // min(1,2,3) - 1
      expect((await repository.getItem('a'))?.z).toBe(0);
   });

   it('brings a zone member to the front of ITS zone, not past the whole board', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([
         makeRecord('Z', board.id, 0, { kind: 'zone', content: { kind: 'zone', collapsed: false } }),
         makeRecord('m1', board.id, 0, { zoneId: 'Z' }),
         makeRecord('m2', board.id, 1, { zoneId: 'Z' }),
         makeRecord('root', board.id, 50),
      ]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // Front of the zone = max(m1, m2 within the zone) + 1 = 2 - NOT above the high-z root item.
      await store.getState().actions.bringToFront('m1');
      expect(store.getState().items['m1'].z).toBe(2);
      expect(store.getState().items['m1'].zoneId).toBe('Z');
   });
});

// ==================
//  Scope-relative z: hydrate repair + drag-out membership
// ==================

describe('scope-relative z', () => {
   it('repairs stored z into dense per-scope order on hydrate, persists it, and is idempotent', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([
         makeRecord('Z', board.id, 5, { kind: 'zone', content: { kind: 'zone', collapsed: false } }),
         makeRecord('free', board.id, 2),
         makeRecord('m1', board.id, 40, { zoneId: 'Z' }),
         makeRecord('m2', board.id, 90, { zoneId: 'Z' }),
      ]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // Root scope { free(2), Z(5) } -> free:0, Z:1 ; zone scope { m1(40), m2(90) } -> m1:0, m2:1.
      expect(store.getState().items['free'].z).toBe(0);
      expect(store.getState().items['Z'].z).toBe(1);
      expect(store.getState().items['m1'].z).toBe(0);
      expect(store.getState().items['m2'].z).toBe(1);
      // The repair persists directly (fire-and-forget) without dirtying the board.
      expect(store.getState().hasUnsavedChanges).toBe(false);
      await waitFor(async () => ((await repository.getItem('m2'))?.z === 1 ? true : undefined));

      // Idempotent: a fresh hydrate of the now-dense board reads the same z, nothing re-shuffles.
      const store2 = createBoardStore();
      await store2.getState().actions.hydrate(board.id);
      expect(store2.getState().items['m2'].z).toBe(1);
      expect(store2.getState().items['free'].z).toBe(0);
   });

   it('snaps a member dragged out of its zone to root-front', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([
         makeRecord('Z', board.id, 0, { kind: 'zone', x: 0, y: 0, width: 200, height: 200, content: { kind: 'zone', collapsed: false } }),
         makeRecord('root', board.id, 1, { x: 500, y: 500 }),
         makeRecord('m', board.id, 0, { zoneId: 'Z', x: 50, y: 50, width: 20, height: 20 }),
      ]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // Drag the member's center far outside the zone rectangle.
      await store.getState().actions.moveItems(['m'], { x: 1000, y: 1000 });
      const moved = store.getState().items['m'];
      expect(moved.zoneId).toBeUndefined();
      // Root scope after repair: Z(0), root(1); the dragged-out member lands at front = max + 1 = 2.
      expect(moved.z).toBe(2);
      expect((await repository.getItem('m'))?.z).toBe(2);
   });
});

// ==================
//  reorderItem (layers-panel drag): one compound per drop, scope-aware
// ==================

describe('reorderItem', () => {
   /** The scope-relative paint order (bottom -> top) as ids, the invariant the panel + canvas share. */
   function order(store: ReturnType<typeof createBoardStore>): string[] {
      return flattenBoardOrder(store.getState().items).map((item) => item.id);
   }

   /** A zone record for seeding (bounds don't matter here - membership is set explicitly via zoneId). */
   function zoneRec(id: string, boardId: string, z: number): BoardItemRecord {
      return makeRecord(id, boardId, z, { kind: 'zone', content: { kind: 'zone', collapsed: false } });
   }

   it('reorders within the root stack as ONE undo step', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([makeRecord('a', board.id, 0), makeRecord('b', board.id, 1), makeRecord('c', board.id, 2)]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // Send c to the back of the root scope.
      await store.getState().actions.reorderItem('c', null, 0);
      expect(order(store)).toEqual(['c', 'a', 'b']);
      expect(store.getState().canUndo).toBe(true);

      // A single undo reverts the whole reorder (no per-op spam).
      await store.getState().actions.undo();
      expect(order(store)).toEqual(['a', 'b', 'c']);
      expect(store.getState().canUndo).toBe(false);
   });

   it('reorders within a zone as ONE undo step, keeping the band contiguous', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([
         zoneRec('Z', board.id, 0),
         makeRecord('m1', board.id, 0, { zoneId: 'Z' }),
         makeRecord('m2', board.id, 1, { zoneId: 'Z' }),
         makeRecord('root', board.id, 1),
      ]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // Move m1 to the front of its zone (above m2).
      await store.getState().actions.reorderItem('m1', 'Z', 2);
      expect(order(store)).toEqual(['Z', 'm2', 'm1', 'root']);
      expect(store.getState().items['m1'].zoneId).toBe('Z');

      await store.getState().actions.undo();
      expect(order(store)).toEqual(['Z', 'm1', 'm2', 'root']);
      expect(store.getState().canUndo).toBe(false);
   });

   it('drags a member OUT of its zone: clears membership + reinserts at root as ONE undo step', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([
         zoneRec('Z', board.id, 0),
         makeRecord('m', board.id, 0, { zoneId: 'Z' }),
         makeRecord('r', board.id, 1),
      ]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // Drop the member at root, behind r (index of r among root siblings [Z, r] = 1).
      await store.getState().actions.reorderItem('m', null, 1);
      expect(store.getState().items['m'].zoneId).toBeUndefined();
      expect(order(store)).toEqual(['Z', 'm', 'r']);
      expect((await repository.getItem('m'))?.zoneId).toBeUndefined();

      // One undo restores BOTH the membership and the z.
      await store.getState().actions.undo();
      expect(store.getState().items['m'].zoneId).toBe('Z');
      expect(order(store)).toEqual(['Z', 'm', 'r']);
      expect(store.getState().canUndo).toBe(false);
   });

   it('drags an item INTO a zone: sets membership + lands at the target index as ONE undo step', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([
         zoneRec('Z', board.id, 0),
         makeRecord('m', board.id, 0, { zoneId: 'Z' }),
         makeRecord('x', board.id, 5),
      ]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // Join Z at its front (above the one member): index = sibling count (1).
      await store.getState().actions.reorderItem('x', 'Z', 1);
      expect(store.getState().items['x'].zoneId).toBe('Z');
      expect(order(store)).toEqual(['Z', 'm', 'x']);

      await store.getState().actions.undo();
      expect(store.getState().items['x'].zoneId).toBeUndefined();
      expect(store.getState().canUndo).toBe(false);
   });

   it('is a no-op (no undo entry) when the drop changes nothing', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([makeRecord('a', board.id, 0), makeRecord('b', board.id, 1)]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // a is already at the back of root; dropping it there writes nothing.
      await store.getState().actions.reorderItem('a', null, 0);
      expect(store.getState().canUndo).toBe(false);
      expect(store.getState().hasUnsavedChanges).toBe(false);
   });
});

// ==================
//  mergeDrawings (layers-panel merge): fold + cascade + one undo step
// ==================

describe('mergeDrawings', () => {
   /** A drawing record with the given local strokes at an origin. */
   function drawingRecord(id: string, boardId: string, z: number, x: number, y: number, strokes: { id: string; points: number[] }[]): BoardItemRecord {
      return makeRecord(id, boardId, z, {
         kind: 'drawing',
         x,
         y,
         width: 10,
         height: 10,
         content: { kind: 'drawing', strokes: strokes.map((s) => ({ id: s.id, brush: 'pen', color: null, width: 3, points: s.points })) },
      });
   }

   /** A connection record referencing two items. */
   function connectionRecord(id: string, boardId: string, z: number, from: string, to: string): BoardItemRecord {
      return { id, boardId, kind: 'connection', x: 0, y: 0, width: 0, height: 0, z, content: { kind: 'connection', from, to, style: { width: 2, color: '#000' } } };
   }

   /** The strokes of a drawing item, as ids (or undefined when the item is gone / not a drawing). */
   function strokeIds(store: ReturnType<typeof createBoardStore>, id: string): string[] | undefined {
      const content = store.getState().items[id]?.content;
      return content?.kind === 'drawing' ? content.strokes.map((s) => s.id) : undefined;
   }

   it('merges two drawings into the bottom-most target: strokes in z-order, box unioned, sources gone', async () => {
      const board = await repository.createBoard('Board');
      // d1 (bottom, z0) at origin; d2 (top, z1) far to the SE so the union box grows.
      await repository.bulkPutItems([
         drawingRecord('d1', board.id, 0, 0, 0, [{ id: 'a', points: [0, 0, 10, 10] }]),
         drawingRecord('d2', board.id, 1, 100, 100, [{ id: 'b', points: [0, 0, 10, 10] }]),
      ]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // Pass ids top-first to prove the target is chosen by paint order (bottom-most), not argument order.
      await store.getState().actions.mergeDrawings(['d2', 'd1']);

      // One layer survives at the bottom-most target's id; the source is gone.
      expect(store.getState().items['d2']).toBeUndefined();
      expect(strokeIds(store, 'd1')).toEqual(['a', 'b']); // target strokes first, then the source's
      const merged = store.getState().items['d1'];
      expect({ x: merged.x, y: merged.y, width: merged.width, height: merged.height }).toEqual({ x: 0, y: 0, width: 110, height: 110 });
      // Memory == repo (the non-additive resync).
      const repoMerged = await repository.getItem('d1');
      expect({ x: repoMerged?.x, y: repoMerged?.y, width: repoMerged?.width, height: repoMerged?.height }).toEqual({ x: 0, y: 0, width: 110, height: 110 });
      // The merged layer is left selected.
      expect([...store.getState().selectedIds]).toEqual(['d1']);

      // One undo restores every merged-away layer exactly (id, z, strokes, box).
      await store.getState().actions.undo();
      expect(strokeIds(store, 'd1')).toEqual(['a']);
      expect({ x: store.getState().items['d1'].x, y: store.getState().items['d1'].y, width: store.getState().items['d1'].width, height: store.getState().items['d1'].height }).toEqual({ x: 0, y: 0, width: 10, height: 10 });
      const d2 = store.getState().items['d2'];
      expect(d2).toMatchObject({ x: 100, y: 100, z: 1 });
      expect(strokeIds(store, 'd2')).toEqual(['b']);
   });

   it('merges three drawings, folding bottom -> top (stroke stacking preserved) as ONE undo step', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([
         drawingRecord('d1', board.id, 0, 0, 0, [{ id: 'a', points: [0, 0, 5, 5] }]),
         drawingRecord('d2', board.id, 1, 0, 0, [{ id: 'b', points: [0, 0, 5, 5] }]),
         drawingRecord('d3', board.id, 2, 0, 0, [{ id: 'c', points: [0, 0, 5, 5] }]),
      ]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.mergeDrawings(['d1', 'd2', 'd3']);
      expect(strokeIds(store, 'd1')).toEqual(['a', 'b', 'c']); // bottom -> top
      expect(store.getState().items['d2']).toBeUndefined();
      expect(store.getState().items['d3']).toBeUndefined();

      await store.getState().actions.undo(); // ONE step brings both merged-away layers back
      expect(strokeIds(store, 'd1')).toEqual(['a']);
      expect(store.getState().items['d2']).toBeDefined();
      expect(store.getState().items['d3']).toBeDefined();
      expect(store.getState().canUndo).toBe(false);
   });

   it('cascade-deletes a connection to a merged-away layer, and undo restores it', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([
         drawingRecord('d1', board.id, 0, 0, 0, [{ id: 'a', points: [0, 0, 5, 5] }]),
         drawingRecord('d2', board.id, 1, 0, 0, [{ id: 'b', points: [0, 0, 5, 5] }]),
         connectionRecord('conn', board.id, 2, 'd1', 'd2'), // references the source d2
      ]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.mergeDrawings(['d1', 'd2']);
      expect(store.getState().items['d2']).toBeUndefined();
      expect(store.getState().items['conn']).toBeUndefined(); // no dangling endpoint
      expect(await repository.getItem('conn')).toBeUndefined();

      await store.getState().actions.undo(); // ONE step restores the layer AND its connection
      expect(store.getState().items['d2']).toBeDefined();
      expect(store.getState().items['conn']).toBeDefined();
      expect(await repository.getItem('conn')).toBeDefined();
   });

   it('is a defensive no-op for a non-drawing in the selection or fewer than two drawings', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([
         drawingRecord('d1', board.id, 0, 0, 0, [{ id: 'a', points: [0, 0, 5, 5] }]),
         makeRecord('note', board.id, 1), // a post-it, not a drawing
      ]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // A non-drawing in the set: nothing merges, nothing dirties, no undo entry.
      await store.getState().actions.mergeDrawings(['d1', 'note']);
      expect(store.getState().items['d1']).toBeDefined();
      expect(store.getState().items['note']).toBeDefined();
      expect(store.getState().canUndo).toBe(false);
      expect(store.getState().hasUnsavedChanges).toBe(false);

      // A single drawing: below the count floor, also a no-op.
      await store.getState().actions.mergeDrawings(['d1']);
      expect(store.getState().canUndo).toBe(false);
   });
});

// ==================
//  Reactive canUndo / canRedo
// ==================

describe('canUndo / canRedo', () => {
   it('track the engine across execute / undo / redo', async () => {
      const board = await repository.createBoard('Board');
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);
      expect(store.getState().canUndo).toBe(false);
      expect(store.getState().canRedo).toBe(false);

      await store.getState().actions.addItem(makeItem('item-1', 0));
      expect(store.getState().canUndo).toBe(true);
      expect(store.getState().canRedo).toBe(false);

      await store.getState().actions.undo();
      expect(store.getState().canUndo).toBe(false);
      expect(store.getState().canRedo).toBe(true);

      await store.getState().actions.redo();
      expect(store.getState().canUndo).toBe(true);
      expect(store.getState().canRedo).toBe(false);
   });
});

// ==================
//  Viewport (not undoable)
// ==================

describe('setViewport', () => {
   it('updates in memory immediately, debounce-persists, and never enters undo', async () => {
      const board = await repository.createBoard('Board');
      const store = createBoardStore({ viewportSaveDebounceMs: 5 });
      await store.getState().actions.hydrate(board.id);

      store.getState().actions.setViewport({ x: 50, y: 60, zoom: 2 });
      expect(store.getState().viewport).toEqual({ x: 50, y: 60, zoom: 2 }); // immediate
      expect(store.getState().canUndo).toBe(false); // not a command

      // Poll for the debounced save rather than a fixed sleep (robust under suite load).
      const persisted = await waitFor(async () => {
         const vp = (await repository.getBoard(board.id))?.viewport;
         return vp && vp.zoom === 2 ? vp : undefined;
      });
      expect(persisted).toEqual({ x: 50, y: 60, zoom: 2 });
      expect(store.getState().canUndo).toBe(false); // still nothing to undo
   });

   it('does not mark the board as last-modified (the viewport is not undoable)', async () => {
      const board = await repository.createBoard('Board');
      const store = createBoardStore({ viewportSaveDebounceMs: 5 });
      await store.getState().actions.hydrate(board.id);

      store.getState().actions.setViewport({ x: 10, y: 10, zoom: 1.5 });
      expect(useAppGeneralStateStore.getState().lastModifiedStore).toBe('drawer'); // unchanged
   });
});

// ==================
//  lastModifiedStore (so Ctrl+Z routes to the board after a board edit)
// ==================

describe('lastModifiedStore', () => {
   it('every mutating action marks the board as the last-modified store', async () => {
      const board = await repository.createBoard('Board');
      await repository.addItem(makeRecord('seed', board.id, 0));
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);
      const { actions } = store.getState();
      const general = useAppGeneralStateStore.getState().actions;

      const reset = () => general.setLastModifiedStore('drawer');

      reset();
      await actions.addItem(makeItem('a', 1));
      expect(useAppGeneralStateStore.getState().lastModifiedStore).toBe('board');

      reset();
      await actions.moveItem('a', { x: 5, y: 5 });
      expect(useAppGeneralStateStore.getState().lastModifiedStore).toBe('board');

      reset();
      await actions.resizeItem('a', { width: 60, height: 60 });
      expect(useAppGeneralStateStore.getState().lastModifiedStore).toBe('board');

      reset();
      await actions.setItemZ('a', 9);
      expect(useAppGeneralStateStore.getState().lastModifiedStore).toBe('board');

      reset();
      await actions.bringToFront('a');
      expect(useAppGeneralStateStore.getState().lastModifiedStore).toBe('board');

      reset();
      await actions.sendToBack('a');
      expect(useAppGeneralStateStore.getState().lastModifiedStore).toBe('board');

      reset();
      await actions.updateItemContent('a', { kind: 'post-it', mode: 'copy', data: { id: 'n8', text: 'edited' } });
      expect(useAppGeneralStateStore.getState().lastModifiedStore).toBe('board');

      reset();
      await actions.deleteItem('a');
      expect(useAppGeneralStateStore.getState().lastModifiedStore).toBe('board');
   });

   it('undo and redo do not change the last-modified store', async () => {
      const board = await repository.createBoard('Board');
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);
      await store.getState().actions.addItem(makeItem('a', 0));

      useAppGeneralStateStore.getState().actions.setLastModifiedStore('drawer');
      await store.getState().actions.undo();
      expect(useAppGeneralStateStore.getState().lastModifiedStore).toBe('drawer');
      await store.getState().actions.redo();
      expect(useAppGeneralStateStore.getState().lastModifiedStore).toBe('drawer');
   });
});

// ==================
//  Failure revert
// ==================

describe('failed command', () => {
   it('reverts the optimistic in-memory change to persisted truth and records the error', async () => {
      const board = await repository.createBoard('Board');
      await repository.addItem(makeRecord('item-1', board.id, 0, { x: 0, y: 0 }));
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // Delete the row out from under the next command so its do() throws.
      await repository.deleteItem('item-1');

      await expect(store.getState().actions.moveItem('item-1', { x: 999, y: 999 })).rejects.toThrow(/not found/i);

      // The optimistic x:999 is gone; the map matches persisted truth (item absent).
      expect(store.getState().items['item-1']).toBeUndefined();
      expect(store.getState().error).toMatch(/not found/i);
      expect(store.getState().canUndo).toBe(false); // failed do() pushed nothing
   });
});

// ==================
//  Per-instance isolation
// ==================

describe('per-instance isolation', () => {
   it('two stores share no undo history or mutable state', async () => {
      const boardA = await repository.createBoard('A');
      const boardB = await repository.createBoard('B');
      await repository.addItem(makeRecord('a-item', boardA.id, 0, { x: 0 }));
      await repository.addItem(makeRecord('b-item', boardB.id, 0, { x: 0 }));

      const storeA = createBoardStore();
      const storeB = createBoardStore();
      await storeA.getState().actions.hydrate(boardA.id);
      await storeB.getState().actions.hydrate(boardB.id);

      await storeA.getState().actions.moveItem('a-item', { x: 100, y: 0 });
      expect(storeA.getState().canUndo).toBe(true);
      expect(storeB.getState().canUndo).toBe(false); // B's stack is untouched

      // B's view does not see A's items, and undoing A leaves B alone.
      expect(storeB.getState().items['a-item']).toBeUndefined();
      await storeA.getState().actions.undo();
      expect(storeA.getState().items['a-item']).toMatchObject({ x: 0 });
      expect(await repository.getItem('b-item')).toMatchObject({ x: 0 });
      expect(storeB.getState().canUndo).toBe(false);
   });
});

describe('grid + rename (immediate persist, dirty, not undoable)', () => {
   it('setGrid updates state, persists to the record, dirties the board, and stays off the undo stack', async () => {
      const board = await repository.createBoard('Board');
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);
      expect(store.getState().grid).toEqual({ type: 'dots' }); // the default
      expect(store.getState().hasUnsavedChanges).toBe(false);

      await store.getState().actions.setGrid({ type: 'lines' });

      expect(store.getState().grid).toEqual({ type: 'lines' });
      expect(store.getState().hasUnsavedChanges).toBe(true);
      expect((await repository.getBoard(board.id))?.grid).toEqual({ type: 'lines' });
      expect(store.getState().canUndo).toBe(false); // a discrete choice, never undoable
   });

   it('setBackground updates state, persists to the record, dirties the board, and stays off the undo stack', async () => {
      const board = await repository.createBoard('Board');
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);
      expect(store.getState().background).toBeUndefined(); // absent by default

      await store.getState().actions.setBackground({ color: '#402010', texture: 'paper' });

      expect(store.getState().background).toEqual({ color: '#402010', texture: 'paper' });
      expect(store.getState().hasUnsavedChanges).toBe(true);
      expect((await repository.getBoard(board.id))?.background).toEqual({ color: '#402010', texture: 'paper' });
      expect(store.getState().canUndo).toBe(false);
   });

   it('setBackground(undefined) clears the backdrop back to the theme canvas', async () => {
      const board = await repository.createBoard('Board');
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);
      await store.getState().actions.setBackground({ texture: 'linen' });

      await store.getState().actions.setBackground(undefined);

      expect(store.getState().background).toBeUndefined();
      expect((await repository.getBoard(board.id))?.background).toBeUndefined();
   });

   it('renameBoard updates state + record, dirties the board, and is not undoable', async () => {
      const board = await repository.createBoard('Old name');
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.renameBoard('New name');

      expect(store.getState().name).toBe('New name');
      expect(store.getState().hasUnsavedChanges).toBe(true);
      expect((await repository.getBoard(board.id))?.name).toBe('New name');
      expect(store.getState().canUndo).toBe(false);
   });

   it('an old board with no stored grid hydrates to the dots default', async () => {
      const board = await repository.createBoard('Legacy');
      // Simulate a pre-grid record by stripping the field on disk.
      await drawerDatabase.boards.update(board.id, { grid: undefined });
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);
      expect(store.getState().grid).toEqual({ type: 'dots' });
   });
});

describe('group operations (one undo step each)', () => {
   /** A connection record between two items, for cascade / remap fixtures. */
   function connectionRecord(id: string, boardId: string, z: number, from: string, to: string): BoardItemRecord {
      return { id, boardId, kind: 'connection', x: 0, y: 0, width: 0, height: 0, z, content: { kind: 'connection', from, to, style: { width: 2, color: '#000' } } };
   }

   it('moveItems shifts every id by a shared delta and undoes as one step', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([makeRecord('a', board.id, 0, { x: 0, y: 0 }), makeRecord('b', board.id, 1, { x: 50, y: 50 })]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.moveItems(['a', 'b'], { x: 10, y: 20 });
      expect(await repository.getItem('a')).toMatchObject({ x: 10, y: 20 });
      expect(await repository.getItem('b')).toMatchObject({ x: 60, y: 70 });

      await store.getState().actions.undo(); // ONE undo reverts the whole group
      expect(await repository.getItem('a')).toMatchObject({ x: 0, y: 0 });
      expect(await repository.getItem('b')).toMatchObject({ x: 50, y: 50 });
   });

   it('deleteItems cascades referencing connections, dedupes a shared one, and undoes as one step', async () => {
      const board = await repository.createBoard('Board');
      // Two items joined by a single connection that BOTH reference (the dedupe case).
      await repository.bulkPutItems([makeRecord('a', board.id, 0), makeRecord('b', board.id, 1), connectionRecord('conn', board.id, 2, 'a', 'b')]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.deleteItems(['a', 'b']); // must not double-delete 'conn'
      expect(await repository.getItem('a')).toBeUndefined();
      expect(await repository.getItem('b')).toBeUndefined();
      expect(await repository.getItem('conn')).toBeUndefined();

      await store.getState().actions.undo(); // ONE undo restores items + the cascaded connection
      expect(await repository.getItem('a')).toBeDefined();
      expect(await repository.getItem('b')).toBeDefined();
      expect(await repository.getItem('conn')).toBeDefined();
   });

   it('duplicateItems offsets copies, remaps in-selection connections, and undoes as one step', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([makeRecord('a', board.id, 0, { x: 0, y: 0 }), makeRecord('b', board.id, 1, { x: 100, y: 0 }), connectionRecord('conn', board.id, 2, 'a', 'b')]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      const newIds = await store.getState().actions.duplicateItems(['a', 'b']);
      expect(newIds).toHaveLength(2);

      // Copies are offset by +16,+16 from their originals (a was at 0,0).
      const copyA = await repository.getItem(newIds[0]);
      expect(copyA).toMatchObject({ x: 16, y: 16 });

      // The connection is duplicated, pointing at the NEW ids, never the originals.
      const connections = (await repository.listItems(board.id)).filter((item) => item.kind === 'connection');
      expect(connections).toHaveLength(2);
      const copyConn = connections.find((item) => item.id !== 'conn');
      expect(copyConn!.content).toMatchObject({ kind: 'connection', from: newIds[0], to: newIds[1] });

      await store.getState().actions.undo(); // ONE undo removes every copy
      expect(await repository.getItem(newIds[0])).toBeUndefined();
      expect((await repository.listItems(board.id)).filter((item) => item.kind === 'connection')).toHaveLength(1);
   });

   it('duplicateItems drops a connection with one endpoint outside the selection', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([makeRecord('a', board.id, 0), makeRecord('b', board.id, 1), connectionRecord('conn', board.id, 2, 'a', 'b')]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // Only 'a' is duplicated; the a<->b connection must NOT be copied (b has no copy).
      await store.getState().actions.duplicateItems(['a']);
      expect((await repository.listItems(board.id)).filter((item) => item.kind === 'connection')).toHaveLength(1);
   });
});

describe('zone membership (move/delete capture)', () => {
   /** A zone record covering [x, x+w] x [y, y+h]. */
   function zoneRecord(id: string, boardId: string, z: number, x: number, y: number, w: number, h: number): BoardItemRecord {
      return { id, boardId, kind: 'zone', x, y, width: w, height: h, z, content: { kind: 'zone', collapsed: false } };
   }

   it('a move whose center enters a zone sets zoneId, and one undo reverts move + membership together', async () => {
      const board = await repository.createBoard('Board');
      // Zone covers 0..400; 'a' (100x100) starts far outside (center 1050,1050).
      await repository.bulkPutItems([zoneRecord('Z', board.id, 0, 0, 0, 400, 400), makeRecord('a', board.id, 1, { x: 1000, y: 1000 })]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.moveItems(['a'], { x: -900, y: -900 }); // center -> 150,150 (inside Z)
      expect(await repository.getItem('a')).toMatchObject({ x: 100, y: 100, zoneId: 'Z' });

      await store.getState().actions.undo(); // ONE step
      const reverted = await repository.getItem('a');
      expect(reverted).toMatchObject({ x: 1000, y: 1000 });
      expect(reverted!.zoneId).toBeUndefined();
   });

   it('dragging a member fully out of its zone clears zoneId', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([zoneRecord('Z', board.id, 0, 0, 0, 400, 400), makeRecord('a', board.id, 1, { x: 100, y: 100, zoneId: 'Z' })]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.moveItems(['a'], { x: 1000, y: 1000 }); // center -> 1150 (outside)
      expect((await repository.getItem('a'))!.zoneId).toBeUndefined();
   });

   it('moving a zone carries its members without re-homing them (one undo step)', async () => {
      const board = await repository.createBoard('Board');
      // Two adjacent zones; member 'm' belongs to Z1. Moving Z1 right slides m's center into Z2's
      // rectangle, but because m is carried (not re-evaluated) it must STAY in Z1.
      await repository.bulkPutItems([
         zoneRecord('Z1', board.id, 0, 0, 0, 200, 200),
         zoneRecord('Z2', board.id, 1, 200, 0, 200, 200),
         makeRecord('m', board.id, 2, { x: 50, y: 50, zoneId: 'Z1' }), // center 100,100 in Z1
      ]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // Move Z1 + its member by +150x; reevaluate is empty (members aren't directly moved).
      await store.getState().actions.moveItems(['Z1', 'm'], { x: 150, y: 0 }, []);
      expect(await repository.getItem('Z1')).toMatchObject({ x: 150, y: 0 });
      const member = await repository.getItem('m');
      expect(member).toMatchObject({ x: 200, y: 50, zoneId: 'Z1' }); // moved along, still in Z1 (not re-homed to Z2)

      await store.getState().actions.undo(); // ONE step
      expect(await repository.getItem('Z1')).toMatchObject({ x: 0, y: 0 });
      expect(await repository.getItem('m')).toMatchObject({ x: 50, y: 50, zoneId: 'Z1' });
   });

   it('a collapsed zone moved with a directly-reevaluated member keeps the member in the zone', async () => {
      const board = await repository.createBoard('Board');
      // A marquee grabs a COLLAPSED zone AND its member, so the member is reevaluated directly (not
      // merely carried). zoneContaining ignores a collapsed frame, so without the "moving with its own
      // zone" guard the recompute would orphan the member. It must stay in Z.
      await repository.bulkPutItems([
         makeRecord('Z', board.id, 0, { kind: 'zone', x: 0, y: 0, width: 400, height: 400, content: { kind: 'zone', collapsed: true } }),
         makeRecord('m', board.id, 1, { x: 100, y: 100, zoneId: 'Z' }),
      ]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      // Move the zone + its member together; 'm' is in reevaluateIds (a marquee selected it directly).
      await store.getState().actions.moveItems(['Z', 'm'], { x: 50, y: 50 }, ['m']);
      expect(await repository.getItem('m')).toMatchObject({ x: 150, y: 150, zoneId: 'Z' });
   });

   it('deleting a zone frees its members (they remain, zoneId cleared) as one undo step', async () => {
      const board = await repository.createBoard('Board');
      await repository.bulkPutItems([zoneRecord('Z', board.id, 0, 0, 0, 400, 400), makeRecord('m', board.id, 1, { x: 100, y: 100, zoneId: 'Z' })]);
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.deleteItems(['Z']);
      expect(await repository.getItem('Z')).toBeUndefined();
      const member = await repository.getItem('m');
      expect(member).toBeDefined(); // freed, NOT deleted
      expect(member!.zoneId).toBeUndefined();

      await store.getState().actions.undo(); // ONE step: zone restored AND membership restored
      expect(await repository.getItem('Z')).toBeDefined();
      expect((await repository.getItem('m'))!.zoneId).toBe('Z');
   });
});

describe('syncItemSize (non-undoable size follow)', () => {
   it('writes the size to memory + repo without a command, leaving the undo stack alone', async () => {
      const board = await repository.createBoard('Board');
      await repository.addItem(makeRecord('a', board.id, 0, { height: 100 }));
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);
      expect(store.getState().canUndo).toBe(false);

      await store.getState().actions.syncItemSize('a', { height: 240 });

      expect(store.getState().items['a'].height).toBe(240); // in-memory updated
      expect((await repository.getItem('a'))?.height).toBe(240); // persisted
      expect(store.getState().canUndo).toBe(false); // NOT on the command stack
   });

   it('is a no-op when the size is unchanged', async () => {
      const board = await repository.createBoard('Board');
      await repository.addItem(makeRecord('a', board.id, 0, { width: 200, height: 100 }));
      const store = createBoardStore();
      await store.getState().actions.hydrate(board.id);

      await store.getState().actions.syncItemSize('a', { height: 100, width: 200 });
      expect(store.getState().canUndo).toBe(false);
      expect(store.getState().items['a']).toMatchObject({ width: 200, height: 100 });
   });
});
