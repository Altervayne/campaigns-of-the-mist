// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// -- Utils Imports --
import { reorderList } from '@/lib/utils/drawer';

// -- Local Imports --
import { drawerDatabase } from './drawerDatabase';
import { DRAWER_ROOT_PARENT_ID } from './drawerRecords';
import type { DrawerItemRecord } from './drawerRecords';
import { DrawerInvalidOperationError, DrawerNotFoundError, DrawerTransactionError } from './drawerErrors';
import * as repository from './drawerRepository';

// -- Type Imports --
import type { DrawerItem, DrawerItemContent, Folder } from '@/lib/types/drawer';
import type { PdfDocument } from '@/lib/types/pdf';
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';

/*
 * Unit tests for the drawer repository against fake-indexeddb. They cross-check
 * the semantics the old `drawerStore` actions provided: ordered children,
 * breadcrumb walking, direct (non-recursive) counts, the self/descendant guard,
 * every mutation incl. cross-parent move reindex and subtree delete, reorder
 * parity with `reorderList`, preset-id preservation, import-flatten/export-
 * reassemble round-trips, and transaction atomicity (a forced mid-write failure
 * rolls back).
 */

// ==================
//  Test data builders
// ==================

/** Builds a minimal nested item. `content.id` lets us observe deep-re-ID behaviour. */
function makeItem(id: string, name: string): DrawerItem {
   return {
      id,
      game: 'LEGENDS',
      type: 'CHARACTER_CARD',
      name,
      content: { id: `content-${id}`, label: name } as unknown as DrawerItemContent,
   };
}

/** Builds a minimal nested folder. */
function makeFolder(id: string, name: string, items: DrawerItem[] = [], folders: Folder[] = []): Folder {
   return { id, name, items, folders };
}

const ITEM_CONTENT = { id: 'fixed-content', label: 'fixed' } as unknown as DrawerItemContent;

// ==================
//  Isolation
// ==================

beforeEach(async () => {
   await drawerDatabase.folders.clear();
   await drawerDatabase.items.clear();
   await drawerDatabase.meta.clear();
});

afterEach(() => {
   vi.restoreAllMocks();
});

// ==================
//  Read API
// ==================

describe('read API', () => {
   it('returns child folders and items ordered by their sibling order', async () => {
      const first = await repository.createFolder({ name: 'Alpha', parentFolderId: null });
      const second = await repository.createFolder({ name: 'Bravo', parentFolderId: null });
      await repository.createItem({ name: 'Item A', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: null });
      await repository.createItem({ name: 'Item B', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: null });

      const { folders, items } = await repository.getFolderChildren(null);

      expect(folders.map((folder) => folder.id)).toEqual([first.id, second.id]);
      expect(folders.map((folder) => folder.order)).toEqual([0, 1]);
      expect(items.map((item) => item.name)).toEqual(['Item A', 'Item B']);
      expect(items.map((item) => item.order)).toEqual([0, 1]);
   });

   it('stores top-level records under the root sentinel parent id', async () => {
      const folder = await repository.createFolder({ name: 'Root folder', parentFolderId: null });
      expect(folder.parentFolderId).toBe(DRAWER_ROOT_PARENT_ID);
   });

   it('getFolder / getItem return undefined for missing ids', async () => {
      expect(await repository.getFolder('nope')).toBeUndefined();
      expect(await repository.getItem('nope')).toBeUndefined();
   });

   it('resolves a breadcrumb path root -> target by walking parents', async () => {
      const top = await repository.createFolder({ name: 'Top', parentFolderId: null });
      const middle = await repository.createFolder({ name: 'Middle', parentFolderId: top.id });
      const leaf = await repository.createFolder({ name: 'Leaf', parentFolderId: middle.id });

      const path = await repository.getBreadcrumbPath(leaf.id);
      expect(path.map((folder) => folder.name)).toEqual(['Top', 'Middle', 'Leaf']);

      expect(await repository.getBreadcrumbPath(null)).toEqual([]);
   });

   it('counts only direct children (not recursive)', async () => {
      const parent = await repository.createFolder({ name: 'Parent', parentFolderId: null });
      const child = await repository.createFolder({ name: 'Child', parentFolderId: parent.id });
      // A grandchild folder + item must NOT be counted under `parent`.
      await repository.createFolder({ name: 'Grandchild', parentFolderId: child.id });
      await repository.createItem({ name: 'Deep item', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: child.id });
      await repository.createItem({ name: 'Direct item', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: parent.id });

      const counts = await repository.getChildCounts(parent.id);
      expect(counts).toEqual({ folderCount: 1, itemCount: 1 });

      const batched = await repository.getChildCountsForFolders([parent.id, child.id]);
      expect(batched.get(parent.id)).toEqual({ folderCount: 1, itemCount: 1 });
      expect(batched.get(child.id)).toEqual({ folderCount: 1, itemCount: 1 });
   });

   it('identifies a folder as self/descendant of an ancestor', async () => {
      const grandparent = await repository.createFolder({ name: 'GP', parentFolderId: null });
      const parent = await repository.createFolder({ name: 'P', parentFolderId: grandparent.id });
      const child = await repository.createFolder({ name: 'C', parentFolderId: parent.id });
      const unrelated = await repository.createFolder({ name: 'U', parentFolderId: null });

      expect(await repository.isFolderSelfOrDescendant(grandparent.id, grandparent.id)).toBe(true); // self
      expect(await repository.isFolderSelfOrDescendant(child.id, grandparent.id)).toBe(true); // descendant
      expect(await repository.isFolderSelfOrDescendant(unrelated.id, grandparent.id)).toBe(false);
      expect(await repository.isFolderSelfOrDescendant(grandparent.id, child.id)).toBe(false); // ancestor is not descendant
   });
});

// ==================
//  Folder mutations
// ==================

describe('folder mutations', () => {
   it('appends a created folder at the end of its parent', async () => {
      await repository.createFolder({ name: 'A', parentFolderId: null });
      const second = await repository.createFolder({ name: 'B', parentFolderId: null });
      expect(second.order).toBe(1);
   });

   it('renames a folder and throws when it does not exist', async () => {
      const folder = await repository.createFolder({ name: 'Old', parentFolderId: null });
      await repository.renameFolder(folder.id, 'New');
      expect((await repository.getFolder(folder.id))?.name).toBe('New');

      await expect(repository.renameFolder('missing', 'X')).rejects.toBeInstanceOf(DrawerNotFoundError);
   });

   it('moves a folder across parents and reindexes both sides', async () => {
      const source = await repository.createFolder({ name: 'Source', parentFolderId: null });
      const destination = await repository.createFolder({ name: 'Destination', parentFolderId: null });
      const moved = await repository.createFolder({ name: 'Moved', parentFolderId: source.id });
      const staysInSource = await repository.createFolder({ name: 'Stays', parentFolderId: source.id });
      await repository.createFolder({ name: 'Existing', parentFolderId: destination.id });

      await repository.moveFolder(moved.id, destination.id);

      const sourceChildren = (await repository.getFolderChildren(source.id)).folders;
      expect(sourceChildren.map((folder) => folder.id)).toEqual([staysInSource.id]);
      expect(sourceChildren.map((folder) => folder.order)).toEqual([0]); // reindexed

      const destinationChildren = (await repository.getFolderChildren(destination.id)).folders;
      expect(destinationChildren.map((folder) => folder.name)).toEqual(['Existing', 'Moved']);
      expect(destinationChildren.map((folder) => folder.order)).toEqual([0, 1]); // appended + contiguous
   });

   it('rejects moving a folder into itself or its own descendant', async () => {
      const parent = await repository.createFolder({ name: 'Parent', parentFolderId: null });
      const child = await repository.createFolder({ name: 'Child', parentFolderId: parent.id });

      await expect(repository.moveFolder(parent.id, parent.id)).rejects.toBeInstanceOf(DrawerInvalidOperationError);
      await expect(repository.moveFolder(parent.id, child.id)).rejects.toBeInstanceOf(DrawerInvalidOperationError);
   });

   it('deletes a folder with its entire subtree and reindexes siblings', async () => {
      const doomed = await repository.createFolder({ name: 'Doomed', parentFolderId: null });
      const survivor = await repository.createFolder({ name: 'Survivor', parentFolderId: null });
      const subFolder = await repository.createFolder({ name: 'Sub', parentFolderId: doomed.id });
      await repository.createItem({ name: 'Top item', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: doomed.id });
      const deepItem = await repository.createItem({ name: 'Deep item', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: subFolder.id });

      await repository.deleteFolder(doomed.id);

      expect(await repository.getFolder(doomed.id)).toBeUndefined();
      expect(await repository.getFolder(subFolder.id)).toBeUndefined();
      expect(await repository.getItem(deepItem.id)).toBeUndefined();

      const rootFolders = (await repository.getFolderChildren(null)).folders;
      expect(rootFolders.map((folder) => folder.id)).toEqual([survivor.id]);
      expect(rootFolders.map((folder) => folder.order)).toEqual([0]); // reindexed after deletion
   });

   it('reorders folders with reorderList parity and rejects out-of-range indices', async () => {
      const created = [];
      for (const name of ['A', 'B', 'C', 'D']) {
         created.push(await repository.createFolder({ name, parentFolderId: null }));
      }
      const ids = created.map((folder) => folder.id);

      await repository.reorderFolders(null, 0, 2); // move A to index 2

      const resultIds = (await repository.getFolderChildren(null)).folders.map((folder) => folder.id);
      expect(resultIds).toEqual(reorderList(ids, 0, 2));

      await expect(repository.reorderFolders(null, 0, 99)).rejects.toBeInstanceOf(DrawerInvalidOperationError);
   });
});

// ==================
//  Item mutations
// ==================

describe('item mutations', () => {
   it('honours a preset id and otherwise generates one; stores content verbatim', async () => {
      const preset = await repository.createItem({
         id: 'preset-id',
         name: 'Preset',
         game: 'LEGENDS',
         type: 'FULL_CHARACTER_SHEET',
         content: ITEM_CONTENT,
         parentFolderId: null,
      });
      expect(preset.id).toBe('preset-id');
      // createItem does not deep-re-ID content (that is import's job): content is verbatim.
      expect((await repository.getItem('preset-id'))?.content).toStrictEqual(ITEM_CONTENT);

      const generated = await repository.createItem({ name: 'Generated', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: null });
      expect(generated.id).toBeTruthy();
      expect(generated.id).not.toBe('preset-id');
   });

   it('renames, updates content (preserving name unless given), and throws when missing', async () => {
      const item = await repository.createItem({ name: 'Name', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: null });

      await repository.renameItem(item.id, 'Renamed');
      expect((await repository.getItem(item.id))?.name).toBe('Renamed');

      const nextContent = { id: 'next', label: 'next' } as unknown as DrawerItemContent;
      await repository.updateItemContent(item.id, nextContent); // name omitted -> preserved
      let stored = await repository.getItem(item.id);
      expect(stored?.content).toStrictEqual(nextContent);
      expect(stored?.name).toBe('Renamed');

      await repository.updateItemContent(item.id, ITEM_CONTENT, 'Both'); // name provided -> updated
      stored = await repository.getItem(item.id);
      expect(stored?.name).toBe('Both');

      await expect(repository.renameItem('missing', 'X')).rejects.toBeInstanceOf(DrawerNotFoundError);
      await expect(repository.updateItemContent('missing', ITEM_CONTENT)).rejects.toBeInstanceOf(DrawerNotFoundError);
      await expect(repository.deleteItem('missing')).rejects.toBeInstanceOf(DrawerNotFoundError);
   });

   it('moves an item across parents and reindexes both sides', async () => {
      const source = await repository.createFolder({ name: 'Src', parentFolderId: null });
      const destination = await repository.createFolder({ name: 'Dst', parentFolderId: null });
      const moved = await repository.createItem({ name: 'Moved', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: source.id });
      const stays = await repository.createItem({ name: 'Stays', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: source.id });
      await repository.createItem({ name: 'Existing', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: destination.id });

      await repository.moveItem(moved.id, destination.id);

      const sourceItems = (await repository.getFolderChildren(source.id)).items;
      expect(sourceItems.map((item) => item.id)).toEqual([stays.id]);
      expect(sourceItems.map((item) => item.order)).toEqual([0]);

      const destinationItems = (await repository.getFolderChildren(destination.id)).items;
      expect(destinationItems.map((item) => item.name)).toEqual(['Existing', 'Moved']);
      expect(destinationItems.map((item) => item.order)).toEqual([0, 1]);
   });

   it('deletes an item and reindexes its siblings', async () => {
      const a = await repository.createItem({ name: 'A', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: null });
      const b = await repository.createItem({ name: 'B', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: null });
      const c = await repository.createItem({ name: 'C', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: null });

      await repository.deleteItem(b.id);

      const items = (await repository.getFolderChildren(null)).items;
      expect(items.map((item) => item.id)).toEqual([a.id, c.id]);
      expect(items.map((item) => item.order)).toEqual([0, 1]);
   });

   it('reorders items with reorderList parity', async () => {
      const created = [];
      for (const name of ['A', 'B', 'C', 'D', 'E']) {
         created.push(await repository.createItem({ name, game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: null }));
      }
      const ids = created.map((item) => item.id);

      await repository.reorderItems(null, 3, 1); // move D to index 1

      const resultIds = (await repository.getFolderChildren(null)).items.map((item) => item.id);
      expect(resultIds).toEqual(reorderList(ids, 3, 1));
   });
});

// ==================
//  Tree / bulk operations
// ==================

describe('tree / bulk operations', () => {
   it('import-flatten then export-reassemble round-trips structure with fresh ids', async () => {
      const nested = makeFolder('orig-folder', 'Campaign', [makeItem('orig-item', 'Hero')], [
         makeFolder('orig-sub', 'NPCs', [makeItem('orig-deep', 'Villain')], []),
      ]);

      await repository.importNestedFolderAsRecords(nested, null);

      const rootFolders = (await repository.getFolderChildren(null)).folders;
      expect(rootFolders).toHaveLength(1);
      const importedFolderId = rootFolders[0].id;
      expect(importedFolderId).not.toBe('orig-folder'); // deep-re-ID'd

      const reassembled = await repository.exportFolderAsNestedTree(importedFolderId);
      expect(reassembled.name).toBe('Campaign');
      expect(reassembled.items.map((item) => item.name)).toEqual(['Hero']);
      expect(reassembled.folders.map((folder) => folder.name)).toEqual(['NPCs']);
      expect(reassembled.folders[0].items.map((item) => item.name)).toEqual(['Villain']);

      // Every id (folders, items, and content) is freshly generated by deepReId.
      expect(reassembled.items[0].id).not.toBe('orig-item');
      expect((reassembled.items[0].content as unknown as { id: string }).id).not.toBe('content-orig-item');
      expect(reassembled.folders[0].id).not.toBe('orig-sub');
      expect(reassembled.folders[0].items[0].id).not.toBe('orig-deep');
   });

   it('imports a whole drawer as a single named folder', async () => {
      const drawer = {
         folders: [makeFolder('d-sub', 'Sub', [], [])],
         rootItems: [makeItem('d-item', 'Loose')],
      };

      await repository.importDrawerAsFolder(drawer, 'Imported Drawer', null);

      const rootFolders = (await repository.getFolderChildren(null)).folders;
      expect(rootFolders.map((folder) => folder.name)).toEqual(['Imported Drawer']);

      const wrapper = await repository.exportFolderAsNestedTree(rootFolders[0].id);
      expect(wrapper.items.map((item) => item.name)).toEqual(['Loose']);
      expect(wrapper.folders.map((folder) => folder.name)).toEqual(['Sub']);
   });

   it('exports the entire drawer as a nested tree', async () => {
      const folder = await repository.createFolder({ name: 'Top', parentFolderId: null });
      await repository.createItem({ name: 'Nested', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: folder.id });
      await repository.createItem({ name: 'Root item', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: null });

      const drawer = await repository.exportEntireDrawerAsNestedTree();
      expect(drawer.rootItems.map((item) => item.name)).toEqual(['Root item']);
      expect(drawer.folders.map((f) => f.name)).toEqual(['Top']);
      expect(drawer.folders[0].items.map((item) => item.name)).toEqual(['Nested']);
   });

   it('exportFolderAsNestedTree throws when the folder is missing', async () => {
      await expect(repository.exportFolderAsNestedTree('missing')).rejects.toBeInstanceOf(DrawerNotFoundError);
   });

   it('exports a PDF item as a byteless stub, keeping its id + title + pages + annotations', async () => {
      const ink: PdfAnnotation = { id: 'a1', kind: 'ink', page: 1, color: '#e11d48', createdAt: 1, points: [0.1, 0.1], width: 0.01 };
      const pdf: PdfDocument = { id: 'pdf-1', title: 'Rulebook', assetHash: 'hash-real', coverAssetHash: 'cover-real', pageCount: 42, annotations: { a1: ink } };
      const folder = await repository.createFolder({ name: 'Books', parentFolderId: null });
      await repository.createItem({ name: 'Rulebook', game: 'NEUTRAL', type: 'PDF', content: pdf, parentFolderId: folder.id });

      const tree = await repository.exportFolderAsNestedTree(folder.id);
      const exported = tree.items[0].content as PdfDocument;
      expect(exported.assetHash).toBeNull();
      // The derived cover is re-derivable and dropped from the export, so import re-derives it lazily.
      expect(exported.coverAssetHash).toBeNull();
      expect(exported.id).toBe('pdf-1');
      expect(exported.title).toBe('Rulebook');
      expect(exported.pageCount).toBe(42);
      expect(exported.annotations).toEqual({ a1: ink });
   });

   it('re-imports a stubbed PDF as a placeholder: same id + annotations, null hash, no pdfAssets row', async () => {
      const ink: PdfAnnotation = { id: 'a1', kind: 'ink', page: 1, color: '#e11d48', createdAt: 1, points: [0.1, 0.1], width: 0.01 };
      const stub: PdfDocument = { id: 'pdf-1', title: 'Rulebook', assetHash: null, coverAssetHash: null, pageCount: 42, annotations: { a1: ink } };
      const nested = makeFolder('orig-folder', 'Books', [
         { id: 'wrap-1', game: 'NEUTRAL', type: 'PDF', name: 'Rulebook', content: stub as unknown as DrawerItemContent },
      ]);

      await repository.importNestedFolderAsRecords(nested, null);

      const importedFolderId = (await repository.getFolderChildren(null)).folders[0].id;
      const items = await repository.getFolderItems(importedFolderId);
      expect(items).toHaveLength(1);
      const content = items[0].content as PdfDocument;
      expect(items[0].type).toBe('PDF');
      expect(content.id).toBe('pdf-1'); // PDF content kept verbatim, so the portal id survives
      expect(content.assetHash).toBeNull();
      expect(content.annotations).toEqual({ a1: ink });
      // A placeholder materializes no bytes: the import touches only folders + items.
      expect(await drawerDatabase.pdfAssets.count()).toBe(0);
   });

   it('clearAllDrawerData removes folders and items but preserves meta', async () => {
      await repository.createFolder({ name: 'A', parentFolderId: null });
      await repository.createItem({ name: 'I', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId: null });
      await drawerDatabase.meta.put({ key: 'migrationStatus', value: 'completed' });

      await repository.clearAllDrawerData();

      const { folders, items } = await repository.getFolderChildren(null);
      expect(folders).toHaveLength(0);
      expect(items).toHaveLength(0);
      // Migration flag must survive so a retained legacy blob is not re-imported.
      expect((await drawerDatabase.meta.get('migrationStatus'))?.value).toBe('completed');
   });
});

// ==================
//  Item dates (createdAt / updatedAt)
// ==================

describe('item dates', () => {
   // A monotonic fake clock so each write lands a distinct, ordered timestamp (no wall-clock flake).
   let clock = 1000;
   beforeEach(() => {
      clock = 1000;
      vi.spyOn(Date, 'now').mockImplementation(() => clock);
   });
   const tick = (): number => (clock += 1000);

   const newItem = (parentFolderId: string | null = null) =>
      repository.createItem({ name: 'N', game: 'LEGENDS', type: 'CHARACTER_CARD', content: ITEM_CONTENT, parentFolderId });

   it('createItem stamps both dates to the creation time', async () => {
      const item = await newItem();
      const stored = await repository.getItem(item.id);
      expect(stored?.createdAt).toBe(1000);
      expect(stored?.updatedAt).toBe(1000);
   });

   it('renameItem and updateItemContent bump updatedAt but leave createdAt', async () => {
      const item = await newItem(); // created at 1000

      tick(); // 2000
      await repository.renameItem(item.id, 'Renamed');
      let stored = await repository.getItem(item.id);
      expect(stored?.createdAt).toBe(1000);
      expect(stored?.updatedAt).toBe(2000);

      tick(); // 3000
      await repository.updateItemContent(item.id, ITEM_CONTENT);
      stored = await repository.getItem(item.id);
      expect(stored?.createdAt).toBe(1000);
      expect(stored?.updatedAt).toBe(3000);
   });

   it('moveItem and reorderItems change neither date (position-only)', async () => {
      const folder = await repository.createFolder({ name: 'F', parentFolderId: null });
      const a = await newItem(); // 1000
      const b = await newItem(); // 1000

      tick(); // 2000
      await repository.reorderItems(null, 0, 1);
      tick(); // 3000
      await repository.moveItem(a.id, folder.id);

      const storedA = await repository.getItem(a.id);
      const storedB = await repository.getItem(b.id);
      expect(storedA?.createdAt).toBe(1000);
      expect(storedA?.updatedAt).toBe(1000); // a move never bumps "last edited"
      expect(storedB?.createdAt).toBe(1000);
      expect(storedB?.updatedAt).toBe(1000); // a reorder never bumps "last edited"
   });

   it('restoreRecords preserves the captured dates verbatim (undo fidelity)', async () => {
      const captured: DrawerItemRecord = {
         id: 'restored', name: 'R', parentFolderId: DRAWER_ROOT_PARENT_ID, order: 0,
         game: 'LEGENDS', type: 'CHARACTER_CARD', createdAt: 111, updatedAt: 222, content: ITEM_CONTENT,
      };
      tick(); // advance the clock; restore must NOT use it
      await repository.restoreRecords([], [captured]);
      const stored = await repository.getItem('restored');
      expect(stored?.createdAt).toBe(111);
      expect(stored?.updatedAt).toBe(222);
   });
});

// ==================
//  Transaction atomicity
// ==================

describe('transaction atomicity', () => {
   it('rolls back every write when a mutation fails mid-transaction', async () => {
      // importNestedFolderAsRecords writes the folder record, then the items.
      // Force the items write to fail and assert the folder write rolled back too.
      const bulkAddSpy = vi
         .spyOn(drawerDatabase.items, 'bulkAdd')
         .mockRejectedValueOnce(new Error('forced mid-transaction failure'));

      const nested = makeFolder('atomic-folder', 'Atomic', [makeItem('atomic-item', 'Item')], []);

      await expect(repository.importNestedFolderAsRecords(nested, null)).rejects.toBeInstanceOf(DrawerTransactionError);

      // Nothing committed: the folder added before the failing items write is gone.
      const { folders, items } = await repository.getFolderChildren(null);
      expect(folders).toHaveLength(0);
      expect(items).toHaveLength(0);

      bulkAddSpy.mockRestore();
   });
});

// ==================
//  Query API (filter / search / sort)
// ==================

describe('query API', () => {
   /** Seeds an item record directly, so dates / type / game / parent are set precisely per test. */
   const seed = (over: Partial<DrawerItemRecord> & Pick<DrawerItemRecord, 'id'>): Promise<unknown> =>
      drawerDatabase.items.add({
         id: over.id,
         name: over.name ?? over.id,
         parentFolderId: over.parentFolderId ?? DRAWER_ROOT_PARENT_ID,
         order: over.order ?? 0,
         game: over.game ?? 'LEGENDS',
         type: over.type ?? 'CHARACTER_CARD',
         createdAt: over.createdAt ?? 1000,
         updatedAt: over.updatedAt ?? 1000,
         content: ITEM_CONTENT,
      });

   const ids = (summaries: { id: string }[]): string[] => summaries.map((s) => s.id);

   it('matches text by case-insensitive name-contains', async () => {
      await seed({ id: 'a', name: 'Wizard' });
      await seed({ id: 'b', name: 'wizardry' });
      await seed({ id: 'c', name: 'Knight' });
      expect(ids(await repository.queryItems({ text: 'WIZ' })).sort()).toEqual(['a', 'b']);
   });

   it('matches types and games any-of', async () => {
      await seed({ id: 'card', type: 'CHARACTER_CARD' });
      await seed({ id: 'status', type: 'STATUS_TRACKER' });
      await seed({ id: 'board', type: 'FULL_BOARD' });
      expect(ids(await repository.queryItems({ types: ['STATUS_TRACKER', 'FULL_BOARD'] })).sort()).toEqual(['board', 'status']);

      await drawerDatabase.items.clear();
      await seed({ id: 'leg', game: 'LEGENDS' });
      await seed({ id: 'com', game: 'CITY_OF_MIST' });
      await seed({ id: 'os', game: 'OTHERSCAPE' });
      expect(ids(await repository.queryItems({ games: ['CITY_OF_MIST', 'OTHERSCAPE'] })).sort()).toEqual(['com', 'os']);
   });

   it('matches createdBetween and updatedBetween inclusively', async () => {
      await seed({ id: 'early', createdAt: 100, updatedAt: 100 });
      await seed({ id: 'mid', createdAt: 200, updatedAt: 200 });
      await seed({ id: 'late', createdAt: 300, updatedAt: 300 });
      expect(ids(await repository.queryItems({ createdBetween: [150, 250] }))).toEqual(['mid']);
      expect(ids(await repository.queryItems({ createdBetween: [100, 200] })).sort()).toEqual(['early', 'mid']); // inclusive ends
      expect(ids(await repository.queryItems({ updatedBetween: [250, 999] }))).toEqual(['late']);
   });

   it('ANDs multiple criteria together', async () => {
      await seed({ id: 'hit', name: 'Detective', game: 'CITY_OF_MIST', type: 'STATUS_TRACKER' });
      await seed({ id: 'wrongGame', name: 'Detective', game: 'LEGENDS', type: 'STATUS_TRACKER' });
      await seed({ id: 'wrongType', name: 'Detective', game: 'CITY_OF_MIST', type: 'CHARACTER_CARD' });
      await seed({ id: 'wrongText', name: 'Soldier', game: 'CITY_OF_MIST', type: 'STATUS_TRACKER' });
      const result = await repository.queryItems({ text: 'detective', games: ['CITY_OF_MIST'], types: ['STATUS_TRACKER'] });
      expect(ids(result)).toEqual(['hit']);
   });

   it('scopes to a folder SUBTREE (descendants included, outsiders excluded)', async () => {
      const parent = await repository.createFolder({ name: 'P', parentFolderId: null });
      const child = await repository.createFolder({ name: 'C', parentFolderId: parent.id });
      await seed({ id: 'inParent', parentFolderId: parent.id });
      await seed({ id: 'inChild', parentFolderId: child.id }); // nested deep
      await seed({ id: 'outside', parentFolderId: DRAWER_ROOT_PARENT_ID });
      expect(ids(await repository.queryItems({ scope: { folderId: parent.id } })).sort()).toEqual(['inChild', 'inParent']);
   });

   it('sorts by each key in both directions, defaulting to updatedAt desc', async () => {
      await seed({ id: 'a', name: 'Bravo', type: 'STATUS_TRACKER', createdAt: 200, updatedAt: 300 });
      await seed({ id: 'b', name: 'Alpha', type: 'CHARACTER_CARD', createdAt: 300, updatedAt: 100 });
      await seed({ id: 'c', name: 'Charlie', type: 'FULL_BOARD', createdAt: 100, updatedAt: 200 });

      expect(ids(await repository.queryItems({}))).toEqual(['a', 'c', 'b']); // default: updatedAt desc (300,200,100)
      expect(ids(await repository.queryItems({ sort: { by: 'updatedAt', direction: 'asc' } }))).toEqual(['b', 'c', 'a']);
      expect(ids(await repository.queryItems({ sort: { by: 'name', direction: 'asc' } }))).toEqual(['b', 'a', 'c']); // Alpha,Bravo,Charlie
      expect(ids(await repository.queryItems({ sort: { by: 'name', direction: 'desc' } }))).toEqual(['c', 'a', 'b']);
      expect(ids(await repository.queryItems({ sort: { by: 'createdAt', direction: 'asc' } }))).toEqual(['c', 'a', 'b']); // 100,200,300
   });

   it('returns an empty list for no matches, and the whole drawer when unscoped', async () => {
      await seed({ id: 'a' });
      await seed({ id: 'b' });
      expect(await repository.queryItems({ text: 'nothing-matches' })).toEqual([]);
      expect(ids(await repository.queryItems({})).sort()).toEqual(['a', 'b']);
   });

   it('projects parentFolderId as null for a root item, the folder id otherwise (no content leaked)', async () => {
      const folder = await repository.createFolder({ name: 'F', parentFolderId: null });
      await seed({ id: 'root', parentFolderId: DRAWER_ROOT_PARENT_ID });
      await seed({ id: 'nested', parentFolderId: folder.id });
      const byId = new Map((await repository.queryItems({})).map((s) => [s.id, s]));
      expect(byId.get('root')?.parentFolderId).toBeNull();
      expect(byId.get('nested')?.parentFolderId).toBe(folder.id);
      expect(byId.get('root')).not.toHaveProperty('content');
   });

   it('countItems returns the match count under the same rules', async () => {
      await seed({ id: 'a', game: 'CITY_OF_MIST' });
      await seed({ id: 'b', game: 'CITY_OF_MIST' });
      await seed({ id: 'c', game: 'LEGENDS' });
      expect(await repository.countItems({ games: ['CITY_OF_MIST'] })).toBe(2);
      expect(await repository.countItems({})).toBe(3);
      expect(await repository.countItems({ text: 'none' })).toBe(0);
   });
});
