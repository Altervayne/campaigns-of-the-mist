// -- Library Imports --
import { Dexie, type Table, type Collection, type IndexableType, type InsertType } from 'dexie';
import cuid from 'cuid';

// -- Utils Imports --
import { reorderList } from '@/lib/utils/drawer';
import { reIdImportedFolderTree } from './reIdImportedContent';

// -- Local Imports --
import { drawerDatabase as db } from './drawerDatabase';
import { DRAWER_ROOT_PARENT_ID } from './drawerRecords';
import { DrawerInvalidOperationError, DrawerNotFoundError, DrawerTransactionError } from './drawerErrors';

// -- Tutorial Demo Imports --
import * as demoDrawerBackend from '@/lib/tutorial/demo/demoDrawerBackend';

// -- Type Imports --
import type { DrawerFolderRecord, DrawerItemRecord } from './drawerRecords';
import type { Drawer, DrawerItem, DrawerItemContent, Folder, GameSystem, GeneralItemType } from '@/lib/types/drawer';
import type { Character } from '@/lib/types/character';
import type { Note } from '@/lib/types/board';
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * Framework-agnostic data-access layer for the normalized drawer. Pure persistence:
 * no React, no zustand, no toasts, no console. Every
 * mutation runs in a single Dexie `rw` transaction so multi-row operations
 * (move, delete-subtree, reorder, import) are atomic. Reads that must be
 * internally consistent run in a single `r` transaction. Errors are thrown as the
 * typed errors in `drawerErrors.ts`; the store layer is the only place that turns
 * them into UI.
 *
 * Ordering: each sibling set (children sharing a `parentFolderId`,
 * separately for folders and items) holds a contiguous integer `order` of
 * `0..n-1`. Inserts append; moves/deletes/reorders reindex the affected sibling
 * set within the transaction.
 */

// ==================
//  Parent-id translation (sentinel <-> null)
// ==================

/**
 * Maps the application's `string | null` parent (where `null` means root) to the
 * stored form, substituting {@link DRAWER_ROOT_PARENT_ID} for `null` so root
 * rows remain visible to the parent/order indexes.
 */
function toStoredParentId(parentFolderId: string | null): string {
   return parentFolderId ?? DRAWER_ROOT_PARENT_ID;
}

// ==================
//  Transaction wrappers
// ==================

/**
 * Runs `work` in a read/write transaction over `tables`. Domain errors
 * ({@link DrawerNotFoundError}, {@link DrawerInvalidOperationError}) propagate
 * unchanged so callers can branch on them; any other failure aborts the
 * transaction (rolling back every write) and is rethrown as a
 * {@link DrawerTransactionError} that preserves the original cause.
 */
async function runWriteTransaction<T>(tables: Table[], work: () => Promise<T>): Promise<T> {
   try {
      return await db.transaction('rw', tables, work);
   } catch (error) {
      if (error instanceof DrawerNotFoundError || error instanceof DrawerInvalidOperationError) {
         throw error;
      }
      throw new DrawerTransactionError(
         `Drawer write transaction failed: ${error instanceof Error ? error.message : 'unknown error'}`,
         { cause: error },
      );
   }
}

/**
 * Runs `work` in a read-only transaction over `tables`, with the same error
 * translation as {@link runWriteTransaction}.
 */
async function runReadTransaction<T>(tables: Table[], work: () => Promise<T>): Promise<T> {
   try {
      return await db.transaction('r', tables, work);
   } catch (error) {
      if (error instanceof DrawerNotFoundError || error instanceof DrawerInvalidOperationError) {
         throw error;
      }
      throw new DrawerTransactionError(
         `Drawer read transaction failed: ${error instanceof Error ? error.message : 'unknown error'}`,
         { cause: error },
      );
   }
}

// ==================
//  Internal helpers (must run inside an active transaction)
// ==================

/** Loads a folder by id within the active transaction, throwing if absent. */
async function requireFolder(folderId: string): Promise<DrawerFolderRecord> {
   const folder = await db.folders.get(folderId);
   if (!folder) throw new DrawerNotFoundError(`Drawer folder not found: ${folderId}`);
   return folder;
}

/** Loads an item by id within the active transaction, throwing if absent. */
async function requireItem(itemId: string): Promise<DrawerItemRecord> {
   const item = await db.items.get(itemId);
   if (!item) throw new DrawerNotFoundError(`Drawer item not found: ${itemId}`);
   return item;
}

/** Ordered child folders of a stored parent id, via the `[parentFolderId+order]` index. */
function orderedChildFolders(storedParentId: string): Promise<DrawerFolderRecord[]> {
   return db.folders
      .where('[parentFolderId+order]')
      .between([storedParentId, Dexie.minKey], [storedParentId, Dexie.maxKey])
      .toArray();
}

/** Ordered child items of a stored parent id, via the `[parentFolderId+order]` index. */
function orderedChildItems(storedParentId: string): Promise<DrawerItemRecord[]> {
   return db.items
      .where('[parentFolderId+order]')
      .between([storedParentId, Dexie.minKey], [storedParentId, Dexie.maxKey])
      .toArray();
}

/** Reassigns contiguous `0..n-1` order to the folder sibling set of a stored parent. */
async function reindexFolderSiblings(storedParentId: string): Promise<void> {
   const siblings = await orderedChildFolders(storedParentId);
   if (siblings.length === 0) return;
   await db.folders.bulkPut(siblings.map((folder, index) => ({ ...folder, order: index })));
}

/** Reassigns contiguous `0..n-1` order to the item sibling set of a stored parent. */
async function reindexItemSiblings(storedParentId: string): Promise<void> {
   const siblings = await orderedChildItems(storedParentId);
   if (siblings.length === 0) return;
   await db.items.bulkPut(siblings.map((item, index) => ({ ...item, order: index })));
}

/**
 * Whether `candidateFolderId` is `ancestorFolderId` itself or one of its
 * descendants, by walking the parent chain upward from the candidate. Runs inside
 * the active transaction; a `visited` guard prevents an accidental cycle from
 * looping forever.
 */
async function isSelfOrDescendantWithinTransaction(candidateFolderId: string, ancestorFolderId: string): Promise<boolean> {
   const visited = new Set<string>();
   let cursorFolderId = candidateFolderId;

   while (cursorFolderId !== DRAWER_ROOT_PARENT_ID) {
      if (cursorFolderId === ancestorFolderId) return true;
      if (visited.has(cursorFolderId)) break;
      visited.add(cursorFolderId);

      const folder: DrawerFolderRecord | undefined = await db.folders.get(cursorFolderId);
      if (!folder) break;
      cursorFolderId = folder.parentFolderId;
   }

   return false;
}

/** Collects the id of a folder and every folder beneath it (breadth-first). */
async function collectSubtreeFolderIds(rootFolderId: string): Promise<string[]> {
   const collected: string[] = [];
   const visited = new Set<string>();
   const queue: string[] = [rootFolderId];

   while (queue.length > 0) {
      const folderId = queue.shift()!;
      if (visited.has(folderId)) continue;
      visited.add(folderId);
      collected.push(folderId);

      const childIds = (await db.folders.where('parentFolderId').equals(folderId).primaryKeys()) as string[];
      queue.push(...childIds);
   }

   return collected;
}

/**
 * Writes one (already deep-re-ID'd) nested folder and its whole subtree as flat
 * records, depth-first. The folder record is written *before* its items so a
 * mid-write failure in the items leaves nothing partially committed (the
 * transaction rolls the folder back too).
 */
async function writeFolderSubtree(folder: Folder, storedParentId: string, order: number): Promise<void> {
   await db.folders.add({ id: folder.id, name: folder.name, parentFolderId: storedParentId, order });

   if (folder.items.length > 0) {
      // An imported subtree is fresh copies, so each item is created now.
      const now = Date.now();
      await db.items.bulkAdd(
         folder.items.map((item, index) => ({
            id: item.id,
            name: item.name,
            parentFolderId: folder.id,
            order: index,
            game: item.game,
            type: item.type,
            createdAt: now,
            updatedAt: now,
            content: item.content,
         })),
      );
   }

   for (let index = 0; index < folder.folders.length; index += 1) {
      await writeFolderSubtree(folder.folders[index], folder.id, index);
   }
}

/**
 * Maps a stored item record back to the nested {@link DrawerItem} export shape. A PDF is emitted as a byteless
 * STUB - its bytes-pointer and derived cover nulled - so the tree carries a placeholder (id + title + pages +
 * annotations survive, the raw file and its re-derivable cover do not); it imports as a placeholder awaiting a
 * file, keeping `cotm://pdf/<id>` links alive, and the cover re-derives on first drawer view once a file is supplied.
 */
function toNestedItem(record: DrawerItemRecord): DrawerItem {
   const content = record.type === 'PDF'
      ? { ...(record.content as PdfDocument), assetHash: null, coverAssetHash: null }
      : record.content;
   return { id: record.id, game: record.game, type: record.type, name: record.name, content };
}

/**
 * Reassembles a folder record and its subtree into the nested {@link Folder}
 * shape, ordered by `order`. Runs inside the active read transaction.
 */
async function buildNestedFolder(folderRecord: DrawerFolderRecord): Promise<Folder> {
   const items = (await orderedChildItems(folderRecord.id)).map(toNestedItem);
   const childFolderRecords = await orderedChildFolders(folderRecord.id);

   const folders: Folder[] = [];
   for (const childFolderRecord of childFolderRecords) {
      folders.push(await buildNestedFolder(childFolderRecord));
   }

   return { id: folderRecord.id, name: folderRecord.name, items, folders };
}

/** Throws if `index` is outside `[0, length)` (a reorder would otherwise corrupt order). */
function assertIndexInRange(index: number, length: number, label: string): void {
   if (!Number.isInteger(index) || index < 0 || index >= length) {
      throw new DrawerInvalidOperationError(`Reorder ${label} index ${index} is out of range [0, ${length}).`);
   }
}

/**
 * Throws unless `provided` is a permutation of `current` (same size, same members).
 * Guards the explicit-order writers so a stale/incomplete id list cannot leave a
 * sibling set with gaps or duplicates.
 */
function assertSamePermutation(current: string[], provided: string[], label: string): void {
   const currentSet = new Set(current);
   const sameSize = current.length === provided.length;
   const sameMembers = provided.every((id) => currentSet.has(id));
   if (!sameSize || !sameMembers) {
      throw new DrawerInvalidOperationError(`Explicit ${label} order is not a permutation of the current sibling set.`);
   }
}

// ==================
//  Read API
// ==================

/**
 * Ordered children of a folder. `parentFolderId === null` reads the drawer root.
 * Folders and items are each returned sorted ascending by their sibling `order`.
 */
export function getFolderChildren(
   parentFolderId: string | null,
): Promise<{ folders: DrawerFolderRecord[]; items: DrawerItemRecord[] }> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.getFolderChildren(parentFolderId);
   const storedParentId = toStoredParentId(parentFolderId);
   return runReadTransaction([db.folders, db.items], async () => ({
      folders: await orderedChildFolders(storedParentId),
      items: await orderedChildItems(storedParentId),
   }));
}

/** Loads a single folder record by id, or `undefined` if it does not exist. */
export function getFolder(folderId: string): Promise<DrawerFolderRecord | undefined> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.getFolder(folderId);
   return db.folders.get(folderId);
}

/**
 * Every folder record, flat. Backs the in-memory folder-tree cache, which re-derives
 * the whole structure from this on each mutation rather than patching itself - folders
 * are tiny and mutations rare relative to navigation, so a full read cannot drift.
 */
export function getAllFolders(): Promise<DrawerFolderRecord[]> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.getAllFolders();
   return db.folders.toArray();
}

/**
 * Ordered child ITEMS of a folder (`null` = root), without touching the folders
 * table. The folder structure now comes from the cache, so navigation loads only
 * items - this is the read it uses.
 */
export function getFolderItems(parentFolderId: string | null): Promise<DrawerItemRecord[]> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.getFolderItems(parentFolderId);
   const storedParentId = toStoredParentId(parentFolderId);
   return runReadTransaction([db.items], () => orderedChildItems(storedParentId));
}

/**
 * Direct ITEM counts for many folders at once, keyed by folder id - the item half of
 * a folder row's summary (the folder half is read straight from the cache). Items
 * only, so navigation never queries the folders table.
 */
export function getItemCountsForFolders(folderIds: string[]): Promise<Map<string, number>> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.getItemCountsForFolders(folderIds);
   return runReadTransaction([db.items], async () => {
      const counts = new Map<string, number>();
      for (const folderId of folderIds) {
         counts.set(folderId, await db.items.where('parentFolderId').equals(folderId).count());
      }
      return counts;
   });
}

/** Loads a single item record by id, or `undefined` if it does not exist. */
export function getItem(itemId: string): Promise<DrawerItemRecord | undefined> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.getItem(itemId);
   return db.items.get(itemId);
}

/**
 * Every stored item's `content`, across all folders. Used by the asset garbage
 * collector to scan drawer-held cards and characters for asset references; returns
 * the contents only (the GC has no use for placement metadata).
 */
export async function listAllItemContents(): Promise<DrawerItemContent[]> {
   const items = await db.items.toArray();
   return items.map((item) => item.content);
}

/**
 * Maps every saved character's id to the drawer item id that holds it (FULL_CHARACTER_SHEET items
 * only). Backs the board-import dedup: a referenced character already in the drawer is linked to its
 * existing item rather than recreated. On the vanishingly unlikely id collision the last item wins.
 */
export async function getCharacterItemIdMap(): Promise<Map<string, string>> {
   const items = await db.items.where('type').equals('FULL_CHARACTER_SHEET').toArray();
   const map = new Map<string, string>();
   for (const item of items) {
      const characterId = (item.content as Character).id;
      if (characterId) map.set(characterId, item.id);
   }
   return map;
}

/**
 * Maps every saved note's id to the drawer item id that holds it (NOTE items only). Backs the board-import
 * dedup for referenced notes: a note already in the drawer is linked to its existing item rather than
 * recreated. Mirrors {@link getCharacterItemIdMap}; on the vanishingly unlikely id collision the last wins.
 */
export async function getNoteItemIdMap(): Promise<Map<string, string>> {
   const items = await db.items.where('type').equals('NOTE').toArray();
   const map = new Map<string, string>();
   for (const item of items) {
      const noteId = (item.content as Note).id;
      if (noteId) map.set(noteId, item.id);
   }
   return map;
}

/**
 * Maps every saved board's id to the drawer item id that holds it (FULL_BOARD items only). Mirrors
 * {@link getNoteItemIdMap}; backs the Portals resolver's drawer fallback for a `cotm://board/<id>` link whose
 * working row is gone (the durable copy lives as the drawer item). On an id collision the last item wins.
 */
export async function getBoardItemIdMap(): Promise<Map<string, string>> {
   const items = await db.items.where('type').equals('FULL_BOARD').toArray();
   const map = new Map<string, string>();
   for (const item of items) {
      const boardId = (item.content as { id?: string }).id;
      if (boardId) map.set(boardId, item.id);
   }
   return map;
}

/**
 * Maps every saved pdf's id to the drawer item id that holds it (PDF items only). Mirrors
 * {@link getNoteItemIdMap}; backs the Portals resolver's drawer fallback for a `cotm://pdf/<id>` link whose
 * working row is gone (the durable copy lives as the drawer item). On an id collision the last item wins.
 */
export async function getPdfItemIdMap(): Promise<Map<string, string>> {
   const items = await db.items.where('type').equals('PDF').toArray();
   const map = new Map<string, string>();
   for (const item of items) {
      const pdfId = (item.content as PdfDocument).id;
      if (pdfId) map.set(pdfId, item.id);
   }
   return map;
}

/**
 * Every saved PDF's stored aggregate (drawer `PDF` items), for the reader's repair picker. Mirrors
 * {@link getPdfItemIdMap}'s type-scoped scan; the picker filters to real files (non-null `assetHash`)
 * and drops the placeholder being repaired.
 */
export async function listSavedPdfs(): Promise<PdfDocument[]> {
   const items = await db.items.where('type').equals('PDF').toArray();
   return items.map((item) => item.content as PdfDocument);
}

/** The drawer item TYPE that holds each linkable entity, so an entity id can be resolved to its drawer save. */
const ENTITY_ITEM_TYPE = { note: 'NOTE', board: 'FULL_BOARD', character: 'FULL_CHARACTER_SHEET', pdf: 'PDF' } as const;

/**
 * Finds the drawer item that holds entity `id` of kind `entity` (a saved note/board/character/pdf), or
 * `undefined` when none does. Backs the Portals link-metadata resolver's naming of an ENTITY link (whose href
 * carries the entity id, not a drawer item id). Scans the entity's type table and matches on `content.id`,
 * mirroring the `get*ItemIdMap` helpers; on the vanishingly unlikely id collision the first match wins.
 */
export async function findEntityDrawerItem(entity: 'note' | 'board' | 'character' | 'pdf', id: string): Promise<DrawerItemRecord | undefined> {
   const items = await db.items.where('type').equals(ENTITY_ITEM_TYPE[entity]).toArray();
   return items.find((item) => (item.content as { id?: string }).id === id);
}

/** A saved note the palette can embed on a board: the drawer item id, the note id it references, and its title. */
export interface SavedNoteRef {
   /** The drawer `NOTE` item id - the reference's `sourceDrawerItemId`. */
   drawerItemId: string;
   /** The note's own id - the reference's `noteId` (the open-tab lookup key). */
   noteId: string;
   /** The note's title, for the picker label (may be empty for an untitled note). */
   title: string;
}

/**
 * Every saved note (drawer `NOTE` items), as the picker refs the palette's "Embed note" command lists. Mirrors
 * {@link getCharacterItemIdMap}'s type-scoped scan. The board builds the reference from `drawerItemId` at embed.
 */
export async function listSavedNotes(): Promise<SavedNoteRef[]> {
   const items = await db.items.where('type').equals('NOTE').toArray();
   return items.map((item) => {
      const note = item.content as Note;
      return { drawerItemId: item.id, noteId: note.id, title: note.title };
   });
}

/**
 * The breadcrumb trail from the drawer root down to `folderId`, by walking the
 * parent chain. Returns `[]` for the root (`null`). If the chain references a
 * missing folder the walk stops and returns what it has resolved; a `visited`
 * guard prevents an accidental cycle from looping forever.
 */
export function getBreadcrumbPath(folderId: string | null): Promise<DrawerFolderRecord[]> {
   if (folderId === null) return Promise.resolve([]);

   return runReadTransaction([db.folders], async () => {
      const path: DrawerFolderRecord[] = [];
      const visited = new Set<string>();
      let cursorFolderId: string | null = folderId;

      while (cursorFolderId !== null) {
         if (visited.has(cursorFolderId)) break;
         visited.add(cursorFolderId);

         const folder: DrawerFolderRecord | undefined = await db.folders.get(cursorFolderId);
         if (!folder) break;
         path.unshift(folder);
         cursorFolderId = folder.parentFolderId === DRAWER_ROOT_PARENT_ID ? null : folder.parentFolderId;
      }

      return path;
   });
}

/**
 * Direct child counts for a folder (`null` = root). Counts immediate children
 * only - it is deliberately not recursive, matching today's
 * `folder.folders.length` / `folder.items.length`.
 */
export function getChildCounts(parentFolderId: string | null): Promise<{ folderCount: number; itemCount: number }> {
   const storedParentId = toStoredParentId(parentFolderId);
   return runReadTransaction([db.folders, db.items], async () => ({
      folderCount: await db.folders.where('parentFolderId').equals(storedParentId).count(),
      itemCount: await db.items.where('parentFolderId').equals(storedParentId).count(),
   }));
}

/**
 * Direct child counts for many folders at once, keyed by folder id - the batched
 * form used when rendering a list of folder rows (avoids an N+1 of single-count
 * calls). Counts are direct children only, not recursive.
 */
export function getChildCountsForFolders(
   folderIds: string[],
): Promise<Map<string, { folderCount: number; itemCount: number }>> {
   return runReadTransaction([db.folders, db.items], async () => {
      const counts = new Map<string, { folderCount: number; itemCount: number }>();
      for (const folderId of folderIds) {
         counts.set(folderId, {
            folderCount: await db.folders.where('parentFolderId').equals(folderId).count(),
            itemCount: await db.items.where('parentFolderId').equals(folderId).count(),
         });
      }
      return counts;
   });
}

/**
 * Whether `candidateFolderId` is the same as, or a descendant of,
 * `potentialAncestorFolderId`. Backs the "move into self/own-subtree" guard in
 * the move pickers.
 */
export function isFolderSelfOrDescendant(candidateFolderId: string, potentialAncestorFolderId: string): Promise<boolean> {
   if (demoDrawerBackend.isDemoDrawerActive()) {
      return demoDrawerBackend.isFolderSelfOrDescendant(candidateFolderId, potentialAncestorFolderId);
   }
   return runReadTransaction([db.folders], () =>
      isSelfOrDescendantWithinTransaction(candidateFolderId, potentialAncestorFolderId),
   );
}

// ==================
//  Folder mutations
// ==================

/** Creates an empty folder appended to the end of its parent (`null` = root). */
export function createFolder(input: { name: string; parentFolderId: string | null }): Promise<DrawerFolderRecord> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.createFolder(input);
   const storedParentId = toStoredParentId(input.parentFolderId);
   return runWriteTransaction([db.folders], async () => {
      const order = await db.folders.where('parentFolderId').equals(storedParentId).count();
      const record: DrawerFolderRecord = { id: cuid(), name: input.name, parentFolderId: storedParentId, order };
      await db.folders.add(record);
      return record;
   });
}

/** Renames a folder. Throws {@link DrawerNotFoundError} if it does not exist. */
export function renameFolder(folderId: string, newName: string): Promise<void> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.renameFolder(folderId, newName);
   return runWriteTransaction([db.folders], async () => {
      const updated = await db.folders.update(folderId, { name: newName });
      if (updated === 0) throw new DrawerNotFoundError(`Drawer folder not found: ${folderId}`);
   });
}

/**
 * Moves a folder under a new parent (`null` = root), appending it to the
 * destination and reindexing both the source and destination sibling sets.
 * Rejects with {@link DrawerInvalidOperationError} if the destination is the
 * folder itself or one of its descendants (which would create a cycle).
 */
export function moveFolder(folderId: string, destinationParentFolderId: string | null): Promise<void> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.moveFolder(folderId, destinationParentFolderId);
   const destinationStored = toStoredParentId(destinationParentFolderId);
   return runWriteTransaction([db.folders], async () => {
      const folder = await requireFolder(folderId);
      const sourceStored = folder.parentFolderId;

      if (destinationStored !== DRAWER_ROOT_PARENT_ID && await isSelfOrDescendantWithinTransaction(destinationStored, folderId)) {
         throw new DrawerInvalidOperationError(`Cannot move folder ${folderId} into itself or its own descendant.`);
      }

      // Park the moved folder at the end of the destination (MAX order sorts last),
      // then reindex so it lands contiguously after its new siblings.
      await db.folders.update(folderId, { parentFolderId: destinationStored, order: Number.MAX_SAFE_INTEGER });
      await reindexFolderSiblings(sourceStored);
      if (destinationStored !== sourceStored) await reindexFolderSiblings(destinationStored);
   });
}

/**
 * Deletes a folder and its entire subtree (all descendant folders and every item
 * within any of them) atomically, then reindexes the source sibling set. Throws
 * {@link DrawerNotFoundError} if the folder does not exist.
 */
export function deleteFolder(folderId: string): Promise<void> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.deleteFolder(folderId);
   return runWriteTransaction([db.folders, db.items], async () => {
      const folder = await requireFolder(folderId);
      const subtreeFolderIds = await collectSubtreeFolderIds(folderId);

      await db.items.where('parentFolderId').anyOf(subtreeFolderIds).delete();
      await db.folders.where('id').anyOf(subtreeFolderIds).delete();
      await reindexFolderSiblings(folder.parentFolderId);
   });
}

/**
 * Reorders child folders within a parent (`null` = root), moving the folder at
 * `oldIndex` to `newIndex` with the exact array-move semantics of `reorderList`,
 * then writing back contiguous order. Throws {@link DrawerInvalidOperationError}
 * if either index is out of range.
 */
export function reorderFolders(parentFolderId: string | null, oldIndex: number, newIndex: number): Promise<void> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.reorderFolders(parentFolderId, oldIndex, newIndex);
   const storedParentId = toStoredParentId(parentFolderId);
   return runWriteTransaction([db.folders], async () => {
      const siblings = await orderedChildFolders(storedParentId);
      assertIndexInRange(oldIndex, siblings.length, 'folder (oldIndex)');
      assertIndexInRange(newIndex, siblings.length, 'folder (newIndex)');

      const reordered = reorderList(siblings, oldIndex, newIndex);
      await db.folders.bulkPut(reordered.map((folder, index) => ({ ...folder, order: index })));
   });
}

// ==================
//  Item mutations
// ==================

/**
 * Creates an item appended to the end of its parent (`null` = root). The
 * caller-supplied `id` is honoured when present (preset-id support, e.g. linking
 * a loaded character to its drawer item); otherwise a fresh id is generated. The
 * `content` is persisted verbatim - id-regeneration for duplication is the
 * import operations' concern, not create's.
 */
export function createItem(input: {
   id?: string;
   name: string;
   game: GameSystem;
   type: GeneralItemType;
   content: DrawerItemContent;
   parentFolderId: string | null;
}): Promise<DrawerItemRecord> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.createItem(input);
   const storedParentId = toStoredParentId(input.parentFolderId);
   return runWriteTransaction([db.items], async () => {
      const order = await db.items.where('parentFolderId').equals(storedParentId).count();
      const now = Date.now();
      const record: DrawerItemRecord = {
         id: input.id ?? cuid(),
         name: input.name,
         parentFolderId: storedParentId,
         order,
         game: input.game,
         type: input.type,
         createdAt: now,
         updatedAt: now,
         content: input.content,
      };
      await db.items.add(record);
      return record;
   });
}

/** Renames an item. Throws {@link DrawerNotFoundError} if it does not exist. */
export function renameItem(itemId: string, newName: string): Promise<void> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.renameItem(itemId, newName);
   return runWriteTransaction([db.items], async () => {
      // A rename is a content/name edit, so it bumps `updatedAt` ("last edited").
      const updated = await db.items.update(itemId, { name: newName, updatedAt: Date.now() });
      if (updated === 0) throw new DrawerNotFoundError(`Drawer item not found: ${itemId}`);
   });
}

/**
 * Moves an item under a new parent (`null` = root), appending it to the
 * destination and reindexing both the source and destination sibling sets. Throws
 * {@link DrawerNotFoundError} if the item does not exist.
 */
export function moveItem(itemId: string, destinationParentFolderId: string | null): Promise<void> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.moveItem(itemId, destinationParentFolderId);
   const destinationStored = toStoredParentId(destinationParentFolderId);
   return runWriteTransaction([db.items], async () => {
      const item = await requireItem(itemId);
      const sourceStored = item.parentFolderId;

      await db.items.update(itemId, { parentFolderId: destinationStored, order: Number.MAX_SAFE_INTEGER });
      await reindexItemSiblings(sourceStored);
      if (destinationStored !== sourceStored) await reindexItemSiblings(destinationStored);
   });
}

/** Deletes an item, then reindexes its source sibling set. Throws {@link DrawerNotFoundError} if absent. */
export function deleteItem(itemId: string): Promise<void> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.deleteItem(itemId);
   return runWriteTransaction([db.items], async () => {
      const item = await requireItem(itemId);
      await db.items.delete(itemId);
      await reindexItemSiblings(item.parentFolderId);
   });
}

/**
 * Replaces an item's `content`, optionally also its `name` (omitting `name`
 * leaves the existing name untouched, matching today's `updateItem`). Throws
 * {@link DrawerNotFoundError} if the item does not exist.
 */
export function updateItemContent(itemId: string, content: DrawerItemContent, name?: string): Promise<void> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.updateItemContent(itemId, content, name);
   return runWriteTransaction([db.items], async () => {
      // A content (and optional name) edit bumps `updatedAt` ("last edited").
      const updatedAt = Date.now();
      const changes = name === undefined ? { content, updatedAt } : { content, name, updatedAt };
      const updated = await db.items.update(itemId, changes);
      if (updated === 0) throw new DrawerNotFoundError(`Drawer item not found: ${itemId}`);
   });
}

/**
 * Reorders child items within a parent (`null` = root), moving the item at
 * `oldIndex` to `newIndex` with the exact array-move semantics of `reorderList`,
 * then writing back contiguous order. Throws {@link DrawerInvalidOperationError}
 * if either index is out of range.
 */
export function reorderItems(parentFolderId: string | null, oldIndex: number, newIndex: number): Promise<void> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.reorderItems(parentFolderId, oldIndex, newIndex);
   const storedParentId = toStoredParentId(parentFolderId);
   return runWriteTransaction([db.items], async () => {
      const siblings = await orderedChildItems(storedParentId);
      assertIndexInRange(oldIndex, siblings.length, 'item (oldIndex)');
      assertIndexInRange(newIndex, siblings.length, 'item (newIndex)');

      const reordered = reorderList(siblings, oldIndex, newIndex);
      await db.items.bulkPut(reordered.map((item, index) => ({ ...item, order: index })));
   });
}

// ==================
//  Tree / bulk operations
// ==================

/**
 * Flattens a nested {@link Folder} into records beneath `parentFolderId`
 * (`null` = root), appended after the destination's existing folders. The folder
 * is deep-re-ID'd first (fresh ids throughout) so importing a copy never collides
 * with existing rows - matching today's `addImportedFolder`.
 *
 * @returns The created top-level folder record (with its fresh id), so callers
 *   such as the undo command layer can later target the created subtree.
 */
export function importNestedFolderAsRecords(folder: Folder, parentFolderId: string | null): Promise<DrawerFolderRecord> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.refuseImport();
   const storedParentId = toStoredParentId(parentFolderId);
   return runWriteTransaction([db.folders, db.items], async () => {
      const freshFolder = reIdImportedFolderTree(folder);
      const appendOrder = await db.folders.where('parentFolderId').equals(storedParentId).count();
      await writeFolderSubtree(freshFolder, storedParentId, appendOrder);
      return { id: freshFolder.id, name: freshFolder.name, parentFolderId: storedParentId, order: appendOrder };
   });
}

/**
 * Imports a whole {@link Drawer} as a single new folder named `folderName`
 * beneath `parentFolderId` (`null` = root), with the drawer's root items and
 * folders nested inside it. Everything is deep-re-ID'd - matching today's
 * `importDrawerAsFolder`.
 *
 * @returns The created wrapper folder record (with its fresh id), so the undo
 *   command layer can later target the created subtree.
 */
export function importDrawerAsFolder(
   drawer: Drawer,
   folderName: string,
   parentFolderId: string | null = null,
): Promise<DrawerFolderRecord> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.refuseImport();
   const storedParentId = toStoredParentId(parentFolderId);
   return runWriteTransaction([db.folders, db.items], async () => {
      const syntheticFolder: Folder = {
         id: cuid(),
         name: folderName,
         items: drawer.rootItems,
         folders: drawer.folders,
      };
      const freshFolder = reIdImportedFolderTree(syntheticFolder);
      const appendOrder = await db.folders.where('parentFolderId').equals(storedParentId).count();
      await writeFolderSubtree(freshFolder, storedParentId, appendOrder);
      return { id: freshFolder.id, name: freshFolder.name, parentFolderId: storedParentId, order: appendOrder };
   });
}

/**
 * Reassembles a folder and its entire subtree back into the nested {@link Folder}
 * shape (for export). Throws {@link DrawerNotFoundError} if the folder does not
 * exist.
 */
export function exportFolderAsNestedTree(folderId: string): Promise<Folder> {
   return runReadTransaction([db.folders, db.items], async () => {
      const folder = await requireFolder(folderId);
      return buildNestedFolder(folder);
   });
}

/** Reassembles the entire drawer back into the nested {@link Drawer} shape (for full export). */
export function exportEntireDrawerAsNestedTree(): Promise<Drawer> {
   return runReadTransaction([db.folders, db.items], async () => {
      const rootItems = (await orderedChildItems(DRAWER_ROOT_PARENT_ID)).map(toNestedItem);
      const rootFolderRecords = await orderedChildFolders(DRAWER_ROOT_PARENT_ID);

      const folders: Folder[] = [];
      for (const rootFolderRecord of rootFolderRecords) {
         folders.push(await buildNestedFolder(rootFolderRecord));
      }

      return { folders, rootItems };
   });
}

/**
 * Deletes all folders and items (powers "Delete drawer" / "Reset app"). The
 * `meta` store is deliberately preserved: clearing the migration flag would let a
 * retained legacy localStorage blob be re-imported on the next load, silently
 * resurrecting the drawer the user just deleted.
 */
export function clearAllDrawerData(): Promise<void> {
   return runWriteTransaction([db.folders, db.items], async () => {
      await db.folders.clear();
      await db.items.clear();
   });
}

// ==================
//  Undo-support operations
// ==================
// These back the command/undo engine: restoring deleted records verbatim and
// re-applying an explicit sibling order. They are additive - the forward
// mutations above are unchanged - and exist because reverting a delete, a move,
// or a (coalesced) reorder requires restoring exact prior ids/ordering, which the
// index-based forward mutations cannot express.

/**
 * Re-inserts previously-captured records verbatim (preserving their ids, parents,
 * and order), in one transaction. Used to undo a delete and to redo a create/
 * import without regenerating ids. Adds (not puts) - the records are expected to
 * be absent (just deleted/undone); a collision is a programming error and throws.
 */
export function restoreRecords(
   folderRecords: DrawerFolderRecord[],
   itemRecords: DrawerItemRecord[],
): Promise<void> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.restoreRecords(folderRecords, itemRecords);
   return runWriteTransaction([db.folders, db.items], async () => {
      if (folderRecords.length > 0) await db.folders.bulkAdd(folderRecords);
      if (itemRecords.length > 0) await db.items.bulkAdd(itemRecords);
   });
}

/**
 * Sets the order of a folder's children to the given id sequence (`order` =
 * index), in one transaction. `orderedFolderIds` must be a permutation of the
 * current child set. Backs reorder/move/delete undo, where an exact prior order
 * must be restored.
 */
export function applyFolderOrder(parentFolderId: string | null, orderedFolderIds: string[]): Promise<void> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.applyFolderOrder(parentFolderId, orderedFolderIds);
   const storedParentId = toStoredParentId(parentFolderId);
   return runWriteTransaction([db.folders], async () => {
      const siblings = await orderedChildFolders(storedParentId);
      assertSamePermutation(siblings.map((folder) => folder.id), orderedFolderIds, 'folder');
      const orderById = new Map(orderedFolderIds.map((id, index) => [id, index]));
      await db.folders.bulkPut(siblings.map((folder) => ({ ...folder, order: orderById.get(folder.id)! })));
   });
}

/**
 * Sets the order of a folder's child items to the given id sequence (`order` =
 * index), in one transaction. `orderedItemIds` must be a permutation of the
 * current child set. Backs reorder/move/delete undo for items.
 */
export function applyItemOrder(parentFolderId: string | null, orderedItemIds: string[]): Promise<void> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.applyItemOrder(parentFolderId, orderedItemIds);
   const storedParentId = toStoredParentId(parentFolderId);
   return runWriteTransaction([db.items], async () => {
      const siblings = await orderedChildItems(storedParentId);
      assertSamePermutation(siblings.map((item) => item.id), orderedItemIds, 'item');
      const orderById = new Map(orderedItemIds.map((id, index) => [id, index]));
      await db.items.bulkPut(siblings.map((item) => ({ ...item, order: orderById.get(item.id)! })));
   });
}

/**
 * Reads a folder and its entire subtree as flat records (folders + items),
 * verbatim, in one read transaction. Captured before a delete so the exact
 * records can be restored on undo, and after an import so the created subtree can
 * be restored on redo. Throws {@link DrawerNotFoundError} if the folder is absent.
 */
export function getFolderSubtreeRecords(
   folderId: string,
): Promise<{ folderRecords: DrawerFolderRecord[]; itemRecords: DrawerItemRecord[] }> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.getFolderSubtreeRecords(folderId);
   return runReadTransaction([db.folders, db.items], async () => {
      const rootFolder = await requireFolder(folderId);
      const folderRecords: DrawerFolderRecord[] = [];
      const itemRecords: DrawerItemRecord[] = [];

      const collect = async (folder: DrawerFolderRecord): Promise<void> => {
         folderRecords.push(folder);
         itemRecords.push(...(await db.items.where('parentFolderId').equals(folder.id).toArray()));
         const childFolders = await db.folders.where('parentFolderId').equals(folder.id).toArray();
         for (const childFolder of childFolders) {
            await collect(childFolder);
         }
      };

      await collect(rootFolder);
      return { folderRecords, itemRecords };
   });
}

// ==================
//  Query API (multi-criteria filter / search / sort)
// ==================
// The engine behind the search/filter UI: every provided criterion ANDs together,
// scoped to a folder's SUBTREE or the whole drawer, returning content-FREE summaries
// (the result list shows name/type/game/dates; a card lazy-loads its own content via
// `getItem` when it scrolls into view). Dexie can only narrow by ONE index, so we pick
// the most selective indexable criterion as the primary `where()` and predicate the rest
// in JS. Building a summary loads the row (content read and discarded) - the accepted
// cost for realistic drawers; the content-free API leaves room for a denormalized
// summary store to back the same contract later, without changing callers.

/** Multi-criteria item query: all provided fields AND together. */
export interface DrawerItemQuery {
   /** Name contains, case-insensitive. */
   text?: string;
   /** Any-of these item types. */
   types?: GeneralItemType[];
   /** Any-of these game systems. */
   games?: GameSystem[];
   /** Inclusive `createdAt` range `[from, to]` (epoch ms). */
   createdBetween?: [number, number];
   /** Inclusive `updatedAt` range `[from, to]` (epoch ms). */
   updatedBetween?: [number, number];
   /** Limit to this folder's SUBTREE (the folder + every descendant); absent = whole drawer. */
   scope?: { folderId: string };
   /** Sort key + direction; defaults to `updatedAt` descending ("last edited"). */
   sort?: { by: 'name' | 'createdAt' | 'updatedAt' | 'type'; direction: 'asc' | 'desc' };
}

/** A content-free item projection for the result list (the card loads content lazily). */
export interface DrawerItemSummary {
   id: string;
   name: string;
   type: GeneralItemType;
   game: GameSystem;
   /** `null` for a root item (the storage sentinel is translated away); powers "Jump to". */
   parentFolderId: string | null;
   createdAt: number;
   updatedAt: number;
}

/** Drops the storage fields (`content`/`order`) and translates the root sentinel back to `null`. */
function toItemSummary(record: DrawerItemRecord): DrawerItemSummary {
   return {
      id: record.id,
      name: record.name,
      type: record.type,
      game: record.game,
      parentFolderId: record.parentFolderId === DRAWER_ROOT_PARENT_ID ? null : record.parentFolderId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
   };
}

/**
 * Returns the records matching every criterion (unsorted). Narrows by ONE primary index
 * - scope ids, else games, else types, else a date range, else the whole table - and runs
 * the remaining criteria as a JS predicate over that narrowed collection. Must run inside
 * an active read transaction (it reads `folders` for the scope subtree + `items`).
 */
async function collectMatchingItemRecords(query: DrawerItemQuery): Promise<DrawerItemRecord[]> {
   const { text, types, games, createdBetween, updatedBetween, scope } = query;

   // Empty arrays read as "no constraint", not "match nothing" (the UI omits a cleared facet).
   const typeSet = types && types.length > 0 ? new Set(types) : null;
   const gameSet = games && games.length > 0 ? new Set(games) : null;
   const needle = text ? text.toLowerCase() : null;
   const subtreeIds = scope ? await collectSubtreeFolderIds(scope.folderId) : null;

   // Choose the primary index; mark which criterion it consumed so it isn't predicated twice. The key
   // type widens to IndexableType because a date-range primary keys on a number, the others on strings.
   let collection: Collection<DrawerItemRecord, IndexableType, InsertType<DrawerItemRecord, 'id'>>;
   let primaryGame = false;
   let primaryType = false;
   let primaryCreated = false;
   let primaryUpdated = false;

   if (subtreeIds) {
      collection = db.items.where('parentFolderId').anyOf(subtreeIds);
   } else if (gameSet) {
      collection = db.items.where('game').anyOf([...gameSet]);
      primaryGame = true;
   } else if (typeSet) {
      collection = db.items.where('type').anyOf([...typeSet]);
      primaryType = true;
   } else if (createdBetween) {
      collection = db.items.where('createdAt').between(createdBetween[0], createdBetween[1], true, true);
      primaryCreated = true;
   } else if (updatedBetween) {
      collection = db.items.where('updatedAt').between(updatedBetween[0], updatedBetween[1], true, true);
      primaryUpdated = true;
   } else {
      collection = db.items.toCollection();
   }

   const predicates: ((record: DrawerItemRecord) => boolean)[] = [];
   if (needle) predicates.push((record) => record.name.toLowerCase().includes(needle));
   if (typeSet && !primaryType) predicates.push((record) => typeSet.has(record.type));
   if (gameSet && !primaryGame) predicates.push((record) => gameSet.has(record.game));
   if (createdBetween && !primaryCreated) predicates.push((record) => record.createdAt >= createdBetween[0] && record.createdAt <= createdBetween[1]);
   if (updatedBetween && !primaryUpdated) predicates.push((record) => record.updatedAt >= updatedBetween[0] && record.updatedAt <= updatedBetween[1]);

   if (predicates.length > 0) {
      collection = collection.filter((record) => predicates.every((matches) => matches(record)));
   }
   return collection.toArray();
}

/** Sorts matched records in memory by the query's key + direction (default `updatedAt` desc). */
function sortItemRecords(records: DrawerItemRecord[], sort: DrawerItemQuery['sort']): DrawerItemRecord[] {
   const by = sort?.by ?? 'updatedAt';
   const factor = (sort?.direction ?? 'desc') === 'asc' ? 1 : -1;
   const compare = (a: DrawerItemRecord, b: DrawerItemRecord): number => {
      switch (by) {
         case 'name': return a.name.localeCompare(b.name);
         case 'type': return a.type.localeCompare(b.type);
         case 'createdAt': return a.createdAt - b.createdAt;
         case 'updatedAt': return a.updatedAt - b.updatedAt;
      }
   };
   return [...records].sort((a, b) => compare(a, b) * factor);
}

/**
 * Filters, searches, and sorts items by multiple criteria at once, returning content-free
 * {@link DrawerItemSummary} rows. All provided criteria AND together; absent ones are ignored.
 */
export function queryItems(query: DrawerItemQuery): Promise<DrawerItemSummary[]> {
   if (demoDrawerBackend.isDemoDrawerActive()) return demoDrawerBackend.queryItems(query);
   return runReadTransaction([db.folders, db.items], async () => {
      const matched = await collectMatchingItemRecords(query);
      return sortItemRecords(matched, query.sort).map(toItemSummary);
   });
}

/** Counts the items matching `query` (same rules as {@link queryItems}), without materializing summaries. */
export function countItems(query: DrawerItemQuery): Promise<number> {
   return runReadTransaction([db.folders, db.items], async () => {
      const matched = await collectMatchingItemRecords(query);
      return matched.length;
   });
}
