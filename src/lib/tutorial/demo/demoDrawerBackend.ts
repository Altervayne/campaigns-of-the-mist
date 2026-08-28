// -- Other Library Imports --
import cuid from 'cuid';

// -- Drawer Data Layer Imports --
import { DRAWER_ROOT_PARENT_ID } from '@/lib/drawer/drawerRecords';
import { DrawerInvalidOperationError, DrawerNotFoundError } from '@/lib/drawer/drawerErrors';

// -- Utils Imports --
import { reorderList } from '@/lib/utils/drawer';
import { drawerItemCardTypeClass } from '@/lib/theme/drawerItemCardTypeClass';

// -- Type Imports --
import type { DemoDrawerFixture } from './demoDrawer';
import type { DrawerFolderRecord, DrawerItemRecord } from '@/lib/drawer/drawerRecords';
import type { DrawerCommandEngine } from '@/lib/drawer/drawerCommandEngine';
import type { DrawerItemQuery, DrawerItemSummary } from '@/lib/drawer/drawerRepository';
import type { DrawerItemContent, GameSystem, GeneralItemType } from '@/lib/types/drawer';

/*
 * The in-memory backend the drawer repository funnels its library reads AND its whole command/undo write path
 * through while a Drawer tutorial runs. The departure from every other demo: the drawer is a GLOBAL singleton
 * tree (`db.folders` + `db.items`, plain cuid ids), not a per-id entity, so there is no sentinel id to route
 * on. A board or a note is safe structurally - a real id simply cannot reach its backend - whereas the drawer
 * can only route by MODE. That is the whole reason this file needs an argument and the others do not.
 *
 * A SESSION, NOT A FLAG - and that is the point. Every routed function keys on `session`, the object holding
 * the fixture, and teardown drops that one reference in a `finally`. The fear this design has to answer is a
 * routing guard that outlives its run: a stale READ guard is loud (you see rows that are not yours), but a
 * stale WRITE guard would be silent (a real save vanishes into a fixture nobody is looking at), which is
 * strictly worse than the hazard it removes. A boolean can be left `true` describing nothing. A session cannot:
 * dropping it and dropping the fixture are the same act, so "routing is on" and "there is a demo to route to"
 * cannot disagree. Reads and writes consult that same reference, so both halves come home together or not at
 * all, and `requireSession` turns any call that arrives without one into a throw instead of a write to the
 * wrong drawer.
 *
 * WHAT IS ROUTED, and the line is exact: every function the drawer's command/undo path can reach. That is the
 * entire surface a user can mutate the drawer through, so while a session is live no drawer edit - forward,
 * undo or redo - can touch Dexie.
 * The `content`-scanning readers are deliberately NOT routed and must not be: the asset garbage collector and
 * the board-import dedup scan the drawer for real references, and pointing them at a four-item fixture would
 * have them conclude the user's real assets are unreferenced and collect them. They read the real drawer during
 * a lesson, which is correct - they are asking about the user's library, not the one on screen.
 * `clearAllDrawerData` is the other deliberate exclusion: Delete-drawer / Reset-app is not a drawer EDIT, it is
 * the user demanding their real library go away, and routing it would swallow that into a fixture and quietly
 * leave the drawer they asked to empty exactly where it was. Export reads the same way - it is a question about
 * the real library. Neither sits on the command/undo path, so neither crosses the line above.
 * The two IMPORT writers are neither routed nor left real: they refuse while a session is live. Building a
 * second deep-re-ID subtree importer in memory to serve a path no tour invites (an import needs a real file
 * through a veiled button) is cost with no cover, and a refusal keeps the guarantee whole while failing where
 * it can be seen.
 * The undo STACKS are the other half of this and live with the engine: a demo run gets its own, so a demo
 * command can never be undone onto real data after teardown.
 *
 * A pure leaf: no store, no Dexie, no React, and no runtime import of the repository it backs (its record and
 * query TYPES are type-only, erased at build), so no runtime cycle forms.
 */

/**
 * One live demo drawer: the fixture the routed reads and writes operate on, AND the engine holding the history
 * that describes it. They are one object because they are one fact - a demo's records and a demo's undo stack
 * are only ever true together. A session that owned records but pointed at the real engine would write demo
 * history onto the user's stack, which is the exact failure this file exists to rule out, so it is not a state
 * that can be constructed.
 */
interface DemoDrawerSession {
   folders: Map<string, DrawerFolderRecord>;
   items: Map<string, DrawerItemRecord>;
   engine: DrawerCommandEngine;
}

/**
 * The live session, or `null` when the real drawer is in charge. The single reference every routed function
 * keys on, and the only thing teardown has to drop.
 */
let session: DemoDrawerSession | null = null;

/** Notified whenever the session opens or closes, so the engine's mirror can follow the swap. */
const sessionListeners = new Set<() => void>();

const notifySession = (): void => {
   for (const listener of sessionListeners) listener();
};

/** Subscribes to the session opening or closing. Returns an unsubscribe function. */
export function subscribeDemoDrawerSession(listener: () => void): () => void {
   sessionListeners.add(listener);
   return () => {
      sessionListeners.delete(listener);
   };
}

/** True while a demo drawer is installed, so the repository routes here. */
export function isDemoDrawerActive(): boolean {
   return session !== null;
}

/** The live session's command engine, or `null` when the real drawer is in charge. */
export function getDemoDrawerEngine(): DrawerCommandEngine | null {
   return session?.engine ?? null;
}

/**
 * Opens the session on `fixture` and `engine` in ONE assignment. Atomic on purpose: installing the records and
 * installing their history is a single act, so there is no instant where one is live without the other. The
 * fixture is a fresh clone, owned by the backend hereafter; the engine is the run's own, never the real one.
 */
export function installDemoDrawer(fixture: DemoDrawerFixture, engine: DrawerCommandEngine): void {
   const folders = new Map<string, DrawerFolderRecord>();
   const items = new Map<string, DrawerItemRecord>();
   for (const folder of fixture.folders) folders.set(folder.id, folder);
   for (const item of fixture.items) items.set(item.id, item);
   session = { folders, items, engine };
   notifySession();
}

/** Closes the session, dropping the fixture and its history together and returning the drawer to Dexie. Idempotent. */
export function disposeDemoDrawer(): void {
   session = null;
   notifySession();
}

/**
 * The live session, or a throw. Every routed function enters through here, so a call that reaches this backend
 * without one fails loudly rather than writing somewhere nobody is watching.
 */
function requireSession(): DemoDrawerSession {
   if (!session) throw new DrawerInvalidOperationError('The demo drawer was called with no session installed.');
   return session;
}

// ==================
//  Internal helpers - the repository's projection, ordering and guards over the fixture
// ==================

/** Maps the app's `string | null` parent (null = root) to the stored sentinel form. */
function toStoredParentId(parentFolderId: string | null): string {
   return parentFolderId ?? DRAWER_ROOT_PARENT_ID;
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
      cardTypeClass: drawerItemCardTypeClass(record.type, record.game, record.content),
   };
}

/** Child folders of a stored parent id, ascending by sibling `order`. */
function orderedChildFolders(storedParentId: string): DrawerFolderRecord[] {
   return [...requireSession().folders.values()]
      .filter((folder) => folder.parentFolderId === storedParentId)
      .sort((a, b) => a.order - b.order);
}

/** Child items of a stored parent id, ascending by sibling `order`. */
function orderedChildItems(storedParentId: string): DrawerItemRecord[] {
   return [...requireSession().items.values()]
      .filter((item) => item.parentFolderId === storedParentId)
      .sort((a, b) => a.order - b.order);
}

/** Rewrites a folder sibling set's `order` to a contiguous 0..n-1 in its current sorted order. */
function reindexFolderSiblings(storedParentId: string): void {
   const live = requireSession();
   orderedChildFolders(storedParentId).forEach((folder, index) => {
      live.folders.set(folder.id, { ...folder, order: index });
   });
}

/** Rewrites an item sibling set's `order` to a contiguous 0..n-1 in its current sorted order. */
function reindexItemSiblings(storedParentId: string): void {
   const live = requireSession();
   orderedChildItems(storedParentId).forEach((item, index) => {
      live.items.set(item.id, { ...item, order: index });
   });
}

/** A folder and every folder beneath it (the repository's subtree scope). */
function collectSubtreeFolderIds(rootFolderId: string): Set<string> {
   const live = requireSession();
   const collected = new Set<string>();
   const queue: string[] = [rootFolderId];
   while (queue.length > 0) {
      const folderId = queue.shift()!;
      if (collected.has(folderId)) continue;
      collected.add(folderId);
      for (const folder of live.folders.values()) {
         if (folder.parentFolderId === folderId) queue.push(folder.id);
      }
   }
   return collected;
}

/** Whether `candidateFolderId` is `potentialAncestorFolderId` or sits beneath it. */
function isSelfOrDescendant(candidateFolderId: string, potentialAncestorFolderId: string): boolean {
   return collectSubtreeFolderIds(potentialAncestorFolderId).has(candidateFolderId);
}

/** The folder record, or {@link DrawerNotFoundError} - the repository's `requireFolder`. */
function requireFolder(folderId: string): DrawerFolderRecord {
   const folder = requireSession().folders.get(folderId);
   if (!folder) throw new DrawerNotFoundError(`Drawer folder not found: ${folderId}`);
   return folder;
}

/** The item record, or {@link DrawerNotFoundError} - the repository's `requireItem`. */
function requireItem(itemId: string): DrawerItemRecord {
   const item = requireSession().items.get(itemId);
   if (!item) throw new DrawerNotFoundError(`Drawer item not found: ${itemId}`);
   return item;
}

/** Throws if `index` is outside `[0, length)`, as the repository's reorder guard does. */
function assertIndexInRange(index: number, length: number, label: string): void {
   if (!Number.isInteger(index) || index < 0 || index >= length) {
      throw new DrawerInvalidOperationError(`Reorder ${label} index ${index} is out of range [0, ${length}).`);
   }
}

/** Throws unless `provided` is a permutation of `current`, as the repository's order guard does. */
function assertSamePermutation(current: string[], provided: string[], label: string): void {
   const currentSet = new Set(current);
   const sameMembers = provided.every((id) => currentSet.has(id));
   if (current.length !== provided.length || !sameMembers) {
      throw new DrawerInvalidOperationError(`Explicit ${label} order is not a permutation of the current sibling set.`);
   }
}

/** Sorts matched records by the query's key + direction (default `updatedAt` desc), mirroring the repository. */
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

// ==================
//  Routed repository reads
// ==================
//
// Each mirrors its Dexie sibling's contract but reads the fixture. Values are `structuredClone`d across the
// boundary to match Dexie's detached-copy semantics (a caller mutating a returned record must not corrupt the
// backend).

/** {@link import('@/lib/drawer/drawerRepository').getAllFolders} for the demo drawer (primes the folder-tree cache). */
export async function getAllFolders(): Promise<DrawerFolderRecord[]> {
   return [...requireSession().folders.values()].map((folder) => structuredClone(folder));
}

/** {@link import('@/lib/drawer/drawerRepository').getFolder} for the demo drawer. */
export async function getFolder(folderId: string): Promise<DrawerFolderRecord | undefined> {
   const folder = requireSession().folders.get(folderId);
   return folder ? structuredClone(folder) : undefined;
}

/** {@link import('@/lib/drawer/drawerRepository').getFolderChildren} for the demo drawer. */
export async function getFolderChildren(
   parentFolderId: string | null,
): Promise<{ folders: DrawerFolderRecord[]; items: DrawerItemRecord[] }> {
   const storedParentId = toStoredParentId(parentFolderId);
   return {
      folders: orderedChildFolders(storedParentId).map((folder) => structuredClone(folder)),
      items: orderedChildItems(storedParentId).map((item) => structuredClone(item)),
   };
}

/** {@link import('@/lib/drawer/drawerRepository').getFolderItems} for the demo drawer, ordered by sibling `order`. */
export async function getFolderItems(parentFolderId: string | null): Promise<DrawerItemRecord[]> {
   return orderedChildItems(toStoredParentId(parentFolderId)).map((item) => structuredClone(item));
}

/** {@link import('@/lib/drawer/drawerRepository').getItemCountsForFolders} for the demo drawer. */
export async function getItemCountsForFolders(folderIds: string[]): Promise<Map<string, number>> {
   const live = requireSession();
   const counts = new Map<string, number>();
   for (const folderId of folderIds) {
      let count = 0;
      for (const item of live.items.values()) if (item.parentFolderId === folderId) count += 1;
      counts.set(folderId, count);
   }
   return counts;
}

/** {@link import('@/lib/drawer/drawerRepository').getItem} for a demo drawer item. */
export async function getItem(itemId: string): Promise<DrawerItemRecord | undefined> {
   const record = requireSession().items.get(itemId);
   return record ? structuredClone(record) : undefined;
}

/** {@link import('@/lib/drawer/drawerRepository').isFolderSelfOrDescendant} for the demo drawer. */
export async function isFolderSelfOrDescendant(
   candidateFolderId: string,
   potentialAncestorFolderId: string,
): Promise<boolean> {
   return isSelfOrDescendant(candidateFolderId, potentialAncestorFolderId);
}

/** {@link import('@/lib/drawer/drawerRepository').getFolderSubtreeRecords} for the demo drawer (backs delete undo). */
export async function getFolderSubtreeRecords(
   folderId: string,
): Promise<{ folderRecords: DrawerFolderRecord[]; itemRecords: DrawerItemRecord[] }> {
   const rootFolder = requireFolder(folderId);
   const folderRecords: DrawerFolderRecord[] = [];
   const itemRecords: DrawerItemRecord[] = [];

   const collect = (folder: DrawerFolderRecord): void => {
      folderRecords.push(structuredClone(folder));
      for (const item of orderedChildItems(folder.id)) itemRecords.push(structuredClone(item));
      for (const child of orderedChildFolders(folder.id)) collect(child);
   };

   collect(rootFolder);
   return { folderRecords, itemRecords };
}

/**
 * {@link import('@/lib/drawer/drawerRepository').queryItems} for the demo drawer. Every provided criterion ANDs;
 * absent ones are ignored. Runs a plain in-memory filter (the Dexie sibling's index-picking is a storage
 * optimization with no in-memory analogue), then the same sort + content-free projection.
 */
export async function queryItems(query: DrawerItemQuery): Promise<DrawerItemSummary[]> {
   const { text, types, games, createdBetween, updatedBetween, scope, sort } = query;
   const needle = text ? text.toLowerCase() : null;
   const typeSet = types && types.length > 0 ? new Set(types) : null;
   const gameSet = games && games.length > 0 ? new Set(games) : null;
   const subtreeIds = scope ? collectSubtreeFolderIds(scope.folderId) : null;

   const matched = [...requireSession().items.values()].filter((record) => {
      if (subtreeIds && !subtreeIds.has(record.parentFolderId)) return false;
      if (needle && !record.name.toLowerCase().includes(needle)) return false;
      if (typeSet && !typeSet.has(record.type)) return false;
      if (gameSet && !gameSet.has(record.game)) return false;
      if (createdBetween && (record.createdAt < createdBetween[0] || record.createdAt > createdBetween[1])) return false;
      if (updatedBetween && (record.updatedAt < updatedBetween[0] || record.updatedAt > updatedBetween[1])) return false;
      return true;
   });

   return sortItemRecords(matched, sort).map(toItemSummary);
}

// ==================
//  Routed repository writes - the drawer's whole command/undo surface
// ==================
//
// Each mirrors its Dexie sibling's contract, guards and ordering semantics against the fixture. Content is
// `structuredClone`d in as well as out, so a caller never retains a handle into the backend's own state.

/** {@link import('@/lib/drawer/drawerRepository').createFolder} for the demo drawer. */
export async function createFolder(input: { name: string; parentFolderId: string | null }): Promise<DrawerFolderRecord> {
   const storedParentId = toStoredParentId(input.parentFolderId);
   const record: DrawerFolderRecord = {
      id: cuid(),
      name: input.name,
      parentFolderId: storedParentId,
      order: orderedChildFolders(storedParentId).length,
   };
   requireSession().folders.set(record.id, record);
   return structuredClone(record);
}

/** {@link import('@/lib/drawer/drawerRepository').renameFolder} for the demo drawer. */
export async function renameFolder(folderId: string, newName: string): Promise<void> {
   const folder = requireFolder(folderId);
   requireSession().folders.set(folderId, { ...folder, name: newName });
}

/** {@link import('@/lib/drawer/drawerRepository').moveFolder} for the demo drawer. */
export async function moveFolder(folderId: string, destinationParentFolderId: string | null): Promise<void> {
   const destinationStored = toStoredParentId(destinationParentFolderId);
   const folder = requireFolder(folderId);
   const sourceStored = folder.parentFolderId;

   if (destinationStored !== DRAWER_ROOT_PARENT_ID && isSelfOrDescendant(destinationStored, folderId)) {
      throw new DrawerInvalidOperationError(`Cannot move folder ${folderId} into itself or its own descendant.`);
   }

   // Park at the end of the destination, then reindex both sides so orders stay contiguous.
   requireSession().folders.set(folderId, { ...folder, parentFolderId: destinationStored, order: Number.MAX_SAFE_INTEGER });
   reindexFolderSiblings(sourceStored);
   if (destinationStored !== sourceStored) reindexFolderSiblings(destinationStored);
}

/** {@link import('@/lib/drawer/drawerRepository').deleteFolder} for the demo drawer (cascades the subtree). */
export async function deleteFolder(folderId: string): Promise<void> {
   const folder = requireFolder(folderId);
   const subtreeFolderIds = collectSubtreeFolderIds(folderId);
   const live = requireSession();

   for (const [itemId, item] of [...live.items]) {
      if (subtreeFolderIds.has(item.parentFolderId)) live.items.delete(itemId);
   }
   for (const subtreeFolderId of subtreeFolderIds) live.folders.delete(subtreeFolderId);
   reindexFolderSiblings(folder.parentFolderId);
}

/** {@link import('@/lib/drawer/drawerRepository').reorderFolders} for the demo drawer. */
export async function reorderFolders(parentFolderId: string | null, oldIndex: number, newIndex: number): Promise<void> {
   const siblings = orderedChildFolders(toStoredParentId(parentFolderId));
   assertIndexInRange(oldIndex, siblings.length, 'folder (oldIndex)');
   assertIndexInRange(newIndex, siblings.length, 'folder (newIndex)');
   const live = requireSession();
   reorderList(siblings, oldIndex, newIndex).forEach((folder, index) => {
      live.folders.set(folder.id, { ...folder, order: index });
   });
}

/** {@link import('@/lib/drawer/drawerRepository').reorderItems} for the demo drawer. */
export async function reorderItems(parentFolderId: string | null, oldIndex: number, newIndex: number): Promise<void> {
   const siblings = orderedChildItems(toStoredParentId(parentFolderId));
   assertIndexInRange(oldIndex, siblings.length, 'item (oldIndex)');
   assertIndexInRange(newIndex, siblings.length, 'item (newIndex)');
   const live = requireSession();
   reorderList(siblings, oldIndex, newIndex).forEach((item, index) => {
      live.items.set(item.id, { ...item, order: index });
   });
}

/** {@link import('@/lib/drawer/drawerRepository').createItem} for the demo drawer. */
export async function createItem(input: {
   id?: string;
   name: string;
   game: GameSystem;
   type: GeneralItemType;
   content: DrawerItemContent;
   parentFolderId: string | null;
}): Promise<DrawerItemRecord> {
   const storedParentId = toStoredParentId(input.parentFolderId);
   const now = Date.now();
   const record: DrawerItemRecord = {
      id: input.id ?? cuid(),
      name: input.name,
      parentFolderId: storedParentId,
      order: orderedChildItems(storedParentId).length,
      game: input.game,
      type: input.type,
      createdAt: now,
      updatedAt: now,
      content: structuredClone(input.content),
   };
   requireSession().items.set(record.id, record);
   return structuredClone(record);
}

/** {@link import('@/lib/drawer/drawerRepository').renameItem} for the demo drawer. */
export async function renameItem(itemId: string, newName: string): Promise<void> {
   const item = requireItem(itemId);
   requireSession().items.set(itemId, { ...item, name: newName, updatedAt: Date.now() });
}

/** {@link import('@/lib/drawer/drawerRepository').moveItem} for the demo drawer. */
export async function moveItem(itemId: string, destinationParentFolderId: string | null): Promise<void> {
   const destinationStored = toStoredParentId(destinationParentFolderId);
   const item = requireItem(itemId);
   const sourceStored = item.parentFolderId;

   requireSession().items.set(itemId, { ...item, parentFolderId: destinationStored, order: Number.MAX_SAFE_INTEGER });
   reindexItemSiblings(sourceStored);
   if (destinationStored !== sourceStored) reindexItemSiblings(destinationStored);
}

/** {@link import('@/lib/drawer/drawerRepository').deleteItem} for the demo drawer. */
export async function deleteItem(itemId: string): Promise<void> {
   const item = requireItem(itemId);
   requireSession().items.delete(itemId);
   reindexItemSiblings(item.parentFolderId);
}

/** {@link import('@/lib/drawer/drawerRepository').updateItemContent} for the demo drawer. */
export async function updateItemContent(itemId: string, content: DrawerItemContent, name?: string): Promise<void> {
   const item = requireItem(itemId);
   requireSession().items.set(itemId, {
      ...item,
      content: structuredClone(content),
      ...(name === undefined ? {} : { name }),
      updatedAt: Date.now(),
   });
}

/** {@link import('@/lib/drawer/drawerRepository').restoreRecords} for the demo drawer (backs delete undo). */
export async function restoreRecords(folderRecords: DrawerFolderRecord[], itemRecords: DrawerItemRecord[]): Promise<void> {
   const live = requireSession();
   for (const folder of folderRecords) live.folders.set(folder.id, structuredClone(folder));
   for (const item of itemRecords) live.items.set(item.id, structuredClone(item));
}

/** {@link import('@/lib/drawer/drawerRepository').applyFolderOrder} for the demo drawer. */
export async function applyFolderOrder(parentFolderId: string | null, orderedFolderIds: string[]): Promise<void> {
   const siblings = orderedChildFolders(toStoredParentId(parentFolderId));
   assertSamePermutation(siblings.map((folder) => folder.id), orderedFolderIds, 'folder');
   const orderById = new Map(orderedFolderIds.map((id, index) => [id, index]));
   const live = requireSession();
   for (const folder of siblings) live.folders.set(folder.id, { ...folder, order: orderById.get(folder.id)! });
}

/** {@link import('@/lib/drawer/drawerRepository').applyItemOrder} for the demo drawer. */
export async function applyItemOrder(parentFolderId: string | null, orderedItemIds: string[]): Promise<void> {
   const siblings = orderedChildItems(toStoredParentId(parentFolderId));
   assertSamePermutation(siblings.map((item) => item.id), orderedItemIds, 'item');
   const orderById = new Map(orderedItemIds.map((id, index) => [id, index]));
   const live = requireSession();
   for (const item of siblings) live.items.set(item.id, { ...item, order: orderById.get(item.id)! });
}

/**
 * The import writers, refused rather than served. An import needs a real file through a button no tour ever
 * unveils, so a second deep-re-ID subtree importer in memory would be cost with no cover. Refusing keeps the
 * guarantee whole - the real drawer stays untouched - and fails where it can be seen.
 */
export async function refuseImport(): Promise<never> {
   throw new DrawerInvalidOperationError('The demo drawer does not import while a lesson is running.');
}
