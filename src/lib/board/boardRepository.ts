// -- Library Imports --
import { Dexie, type Table } from 'dexie';
import cuid from 'cuid';

// -- Local Imports --
import { drawerDatabase as db } from '@/lib/drawer/drawerDatabase';
import { BOARD_SCHEMA_VERSION, DEFAULT_BOARD_GRID } from './boardRecords';
import { normalizeConnectionStyle } from './boardConnections';
import { BoardNotFoundError, BoardTransactionError } from './boardErrors';
import * as demoBoardBackend from '@/lib/tutorial/demo/demoBoardBackend';

// -- Type Imports --
import type { BoardItemRecord, BoardRecord } from './boardRecords';
import type { Board, BoardItem, Viewport } from '@/lib/types/board';

/*
 * Framework-agnostic data-access layer for boards. Pure persistence: no React, no
 * zustand, no toasts, no console. The board is normalized like the drawer - a board
 * row plus flat item rows - so a large board can load lazily and (prompt 2) mutate
 * per-item under a command engine. Every multi-row op runs in one Dexie transaction;
 * errors are thrown as the typed errors in `boardErrors.ts`. Nothing outside this
 * module touches `db.boards`/`db.boardItems`.
 *
 * This is the ONE Dexie boundary the board command engine funnels through, so it is also
 * where the tutorial engine's demo board is isolated: a demo board id (or an item it owns)
 * routes to a per-id in-memory backend that touches Dexie for NOTHING, while every real id
 * is unchanged. The demo board thus does/undoes in memory and persists nowhere.
 */

/** A fresh board's camera: origin, no zoom. The viewport persists thereafter. */
const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

// ==================
//  Transaction wrappers
// ==================

/**
 * Runs `work` in a read/write transaction over `tables`. {@link BoardNotFoundError}
 * propagates unchanged so callers can branch on it; any other failure aborts the
 * transaction (rolling back every write) and is rethrown as a
 * {@link BoardTransactionError} preserving the original cause.
 */
async function runWriteTransaction<T>(tables: Table[], work: () => Promise<T>): Promise<T> {
   try {
      return await db.transaction('rw', tables, work);
   } catch (error) {
      if (error instanceof BoardNotFoundError) throw error;
      throw new BoardTransactionError(
         `Board write transaction failed: ${error instanceof Error ? error.message : 'unknown error'}`,
         { cause: error },
      );
   }
}

/** Runs `work` in a read-only transaction over `tables`, with the same error translation. */
async function runReadTransaction<T>(tables: Table[], work: () => Promise<T>): Promise<T> {
   try {
      return await db.transaction('r', tables, work);
   } catch (error) {
      if (error instanceof BoardNotFoundError) throw error;
      throw new BoardTransactionError(
         `Board read transaction failed: ${error instanceof Error ? error.message : 'unknown error'}`,
         { cause: error },
      );
   }
}

// ==================
//  Internal helpers
// ==================

/** A board item's flat record, z-ordered, via the `[boardId+z]` index. */
function orderedItems(boardId: string): Promise<BoardItemRecord[]> {
   return db.boardItems
      .where('[boardId+z]')
      .between([boardId, Dexie.minKey], [boardId, Dexie.maxKey])
      .toArray();
}

/** Projects a flat item record onto the assembled {@link BoardItem} aggregate. */
function toBoardItem(record: BoardItemRecord): BoardItem {
   return {
      id: record.id,
      kind: record.kind,
      x: record.x,
      y: record.y,
      width: record.width,
      height: record.height,
      z: record.z,
      rotation: record.rotation,
      zoneId: record.zoneId,
      label: record.label,
      content: normalizeContentOnRead(record.content),
   };
}

/**
 * Read-time content defaults for optional fields added after some data was already saved. Currently
 * backfills a connection's missing `pathType` to `straight`; persists on the next content write.
 */
function normalizeContentOnRead(content: BoardItem['content']): BoardItem['content'] {
   if (content.kind === 'connection') return { ...content, style: normalizeConnectionStyle(content.style) };
   return content;
}

// ==================
//  Boards
// ==================

/** Creates a new, empty board with a fresh id and the default viewport. Returns the stored record. */
export function createBoard(name: string): Promise<BoardRecord> {
   return runWriteTransaction([db.boards], async () => {
      const record: BoardRecord = {
         id: cuid(),
         name,
         updatedAt: Date.now(),
         viewport: { ...DEFAULT_VIEWPORT },
         drawerItemId: null,
         grid: { ...DEFAULT_BOARD_GRID },
         nextLayerSeq: 1,
         schemaVersion: BOARD_SCHEMA_VERSION,
      };
      await db.boards.add(record);
      return record;
   });
}

/** Loads a board record by id, or `undefined` if it does not exist. */
export function getBoard(id: string): Promise<BoardRecord | undefined> {
   if (demoBoardBackend.ownsBoard(id)) return demoBoardBackend.getBoard(id);
   return db.boards.get(id);
}

/** Lists all board records, most-recently-updated first (for a future recents list). */
export function listBoards(): Promise<BoardRecord[]> {
   return db.boards.orderBy('updatedAt').reverse().toArray();
}

/** Upserts a board record, refreshing `updatedAt`. Returns the stored record. */
export function saveBoard(board: BoardRecord): Promise<BoardRecord> {
   if (demoBoardBackend.ownsBoard(board.id)) return demoBoardBackend.saveBoard(board);
   return runWriteTransaction([db.boards], async () => {
      const record: BoardRecord = { ...board, updatedAt: Date.now() };
      await db.boards.put(record);
      return record;
   });
}

/**
 * Persists a board's drawing-layer name counter, refreshing `updatedAt`. A cosmetic, non-undoable
 * write (like the viewport): it only advances the monotonic ordinal source. Idempotent on an absent board.
 */
export function saveBoardLayerSeq(id: string, nextLayerSeq: number): Promise<void> {
   if (demoBoardBackend.ownsBoard(id)) return demoBoardBackend.saveBoardLayerSeq(id, nextLayerSeq);
   return runWriteTransaction([db.boards], async () => {
      await db.boards.update(id, { nextLayerSeq, updatedAt: Date.now() });
   });
}

/** Renames a board, refreshing `updatedAt`. Throws {@link BoardNotFoundError} if absent. */
export function renameBoard(id: string, name: string): Promise<void> {
   if (demoBoardBackend.ownsBoard(id)) return demoBoardBackend.renameBoard(id, name);
   return runWriteTransaction([db.boards], async () => {
      const updated = await db.boards.update(id, { name, updatedAt: Date.now() });
      if (!updated) throw new BoardNotFoundError(`Board not found: ${id}`);
   });
}

/**
 * Deletes a board and CASCADE-deletes its items in the same transaction, so no
 * orphan `boardItems` are left behind. Idempotent: deleting an absent board is a no-op.
 */
export function deleteBoard(id: string): Promise<void> {
   return runWriteTransaction([db.boards, db.boardItems], async () => {
      await db.boardItems.where('boardId').equals(id).delete();
      await db.boards.delete(id);
   });
}

// ==================
//  Items
// ==================

/** Inserts or replaces a single board item. */
export function addItem(record: BoardItemRecord): Promise<void> {
   if (demoBoardBackend.ownsBoard(record.boardId)) return demoBoardBackend.putItem(record);
   return runWriteTransaction([db.boardItems], async () => {
      await db.boardItems.put(record);
   });
}

/** Loads a single item record by id, or `undefined` if it does not exist. */
export function getItem(id: string): Promise<BoardItemRecord | undefined> {
   if (demoBoardBackend.ownsItem(id)) return demoBoardBackend.getItem(id);
   return db.boardItems.get(id);
}

/** Lists a board's items in z-order, via the `[boardId+z]` index. */
export function listItems(boardId: string): Promise<BoardItemRecord[]> {
   if (demoBoardBackend.ownsBoard(boardId)) return demoBoardBackend.listItems(boardId);
   return orderedItems(boardId);
}

/** Inserts or replaces a single board item (alias of {@link addItem} for symmetry). */
export function putItem(record: BoardItemRecord): Promise<void> {
   return addItem(record);
}

/**
 * Patches an item's placement / content / z / rotation. Throws
 * {@link BoardNotFoundError} if the item does not exist. `id`/`boardId` are immutable.
 */
export function updateItem(id: string, patch: Partial<Omit<BoardItemRecord, 'id' | 'boardId'>>): Promise<void> {
   if (demoBoardBackend.ownsItem(id)) return demoBoardBackend.updateItem(id, patch);
   return runWriteTransaction([db.boardItems], async () => {
      const updated = await db.boardItems.update(id, patch);
      if (!updated) throw new BoardNotFoundError(`Board item not found: ${id}`);
   });
}

/** Deletes a single item. Idempotent: deleting an absent id is a no-op. */
export function deleteItem(id: string): Promise<void> {
   if (demoBoardBackend.ownsItem(id)) return demoBoardBackend.deleteItem(id);
   return runWriteTransaction([db.boardItems], async () => {
      await db.boardItems.delete(id);
   });
}

/**
 * Lists EVERY board item across all boards, for the asset GC's reference scan (which
 * must see board images, or board art is reclaimed once past the grace window). Reads
 * the whole `boardItems` table; the sweep runs rarely, so the full read is fine.
 */
export function listAllBoardItems(): Promise<BoardItemRecord[]> {
   return db.boardItems.toArray();
}

/** Inserts/replaces many items atomically (for the command engine's multi-item mutations). */
export function bulkPutItems(records: BoardItemRecord[]): Promise<void> {
   return runWriteTransaction([db.boardItems], async () => {
      await db.boardItems.bulkPut(records);
   });
}

/** Deletes many items atomically. Absent ids are no-ops. */
export function bulkDeleteItems(ids: string[]): Promise<void> {
   return runWriteTransaction([db.boardItems], async () => {
      await db.boardItems.bulkDelete(ids);
   });
}

// ==================
//  Aggregate read
// ==================

/**
 * Reads a board and its z-ordered items in one read transaction and assembles the
 * {@link Board} aggregate. Returns `undefined` when the board does not exist. The
 * inverse (aggregate -> records, for drawer-save/export) is a later prompt.
 */
export function loadBoard(id: string): Promise<Board | undefined> {
   if (demoBoardBackend.ownsBoard(id)) return demoBoardBackend.loadBoard(id);
   return runReadTransaction([db.boards, db.boardItems], async () => {
      const record = await db.boards.get(id);
      if (!record) return undefined;
      const items = await orderedItems(id);
      return {
         id: record.id,
         name: record.name,
         viewport: record.viewport,
         drawerItemId: record.drawerItemId ?? null,
         grid: record.grid ?? { ...DEFAULT_BOARD_GRID },
         nextLayerSeq: record.nextLayerSeq,
         items: items.map(toBoardItem),
      };
   });
}

/** Assembles the aggregate for `record` + its `items` (the shared body of `loadBoard` and the save helpers). */
function assembleBoard(record: BoardRecord, items: BoardItemRecord[]): Board {
   return {
      id: record.id,
      name: record.name,
      viewport: record.viewport,
      drawerItemId: record.drawerItemId ?? null,
      grid: record.grid ?? { ...DEFAULT_BOARD_GRID },
      nextLayerSeq: record.nextLayerSeq,
      items: items.map(toBoardItem),
   };
}

/**
 * Materializes an aggregate into the normalized tables - the inverse of {@link loadBoard}.
 * Used when opening a board from its drawer copy: the drawer aggregate is the source of
 * truth on open, so any existing rows for this board id are replaced. Keeps the same
 * board id (and item ids) so a reopen focuses-or-restores the same board losslessly.
 */
export function importBoard(board: Board): Promise<void> {
   return runWriteTransaction([db.boards, db.boardItems], async () => {
      await db.boardItems.where('boardId').equals(board.id).delete();
      const record: BoardRecord = {
         id: board.id,
         name: board.name,
         updatedAt: Date.now(),
         viewport: board.viewport,
         drawerItemId: board.drawerItemId ?? null,
         grid: board.grid ?? { ...DEFAULT_BOARD_GRID },
         nextLayerSeq: board.nextLayerSeq,
         schemaVersion: BOARD_SCHEMA_VERSION,
      };
      await db.boards.put(record);
      const records: BoardItemRecord[] = board.items.map((item) => ({
         id: item.id,
         boardId: board.id,
         kind: item.kind,
         x: item.x,
         y: item.y,
         width: item.width,
         height: item.height,
         z: item.z,
         rotation: item.rotation,
         zoneId: item.zoneId,
         label: item.label,
         content: item.content,
      }));
      await db.boardItems.bulkPut(records);
   });
}

/** Outcome of {@link saveBoardToLinkedDrawerItem} (mirrors {@link SaveCharacterToDrawerResult}). */
export interface SaveBoardToDrawerResult {
   /** `true` when the linked drawer item still existed and was updated; `false` -> caller should "Save As". */
   linkedItemUpdated: boolean;
}

/**
 * Explicit "Save Board": in ONE transaction over `boards`/`boardItems`/`items`, flush
 * the live `viewport` onto the board record, then - when the board is linked to a drawer
 * `FULL_BOARD` item that still exists - replace that item's content with the freshly
 * assembled aggregate. Atomic, mirroring `saveCharacterToLinkedDrawerItem`. A dangling
 * link returns `false` so the caller routes to "Save As".
 */
export function saveBoardToLinkedDrawerItem(boardId: string, viewport: Viewport): Promise<SaveBoardToDrawerResult> {
   if (demoBoardBackend.ownsBoard(boardId)) return demoBoardBackend.saveBoardToLinkedDrawerItem(boardId, viewport);
   return runWriteTransaction([db.boards, db.boardItems, db.items], async () => {
      const record = await db.boards.get(boardId);
      if (!record) return { linkedItemUpdated: false };
      const merged: BoardRecord = { ...record, viewport, updatedAt: Date.now() };
      await db.boards.put(merged);

      const drawerItemId = merged.drawerItemId ?? null;
      if (drawerItemId) {
         const existingItem = await db.items.get(drawerItemId);
         if (existingItem) {
            const aggregate = assembleBoard(merged, await orderedItems(boardId));
            await db.items.update(drawerItemId, { content: aggregate });
            return { linkedItemUpdated: true };
         }
      }
      return { linkedItemUpdated: false };
   });
}

/**
 * Links the working board to a (new) drawer item id, flushing the live `viewport`, and
 * returns the aggregate to seed that drawer item's content. Used by "Save Board As".
 */
export function linkBoardToDrawerItem(boardId: string, drawerItemId: string, viewport: Viewport): Promise<Board> {
   if (demoBoardBackend.ownsBoard(boardId)) return demoBoardBackend.linkBoardToDrawerItem(boardId, drawerItemId, viewport);
   return runWriteTransaction([db.boards, db.boardItems], async () => {
      const record = await db.boards.get(boardId);
      if (!record) throw new BoardNotFoundError(`Board not found: ${boardId}`);
      const merged: BoardRecord = { ...record, drawerItemId, viewport, updatedAt: Date.now() };
      await db.boards.put(merged);
      return assembleBoard(merged, await orderedItems(boardId));
   });
}

/** Deletes all board + board-item rows (powers "Reset app"), mirroring `clearAllAssets`. */
export function clearAllBoards(): Promise<void> {
   return runWriteTransaction([db.boards, db.boardItems], async () => {
      await db.boards.clear();
      await db.boardItems.clear();
   });
}
