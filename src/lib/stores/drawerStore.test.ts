// -- Library Imports --
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

/*
 * Tests for the drawer store's OPTIMISTIC reorder/move: the loaded
 * `currentFolderView` must reflect the result the instant the action is called,
 * synchronously, before the (async) command + reload, and must revert to the real
 * order when the command fails. The command engine and repository are mocked so we
 * control the persist outcome (resolve vs reject) and the reverted view in isolation.
 */

// The store dispatches through the command engine and reloads via the repository, and
// marks itself modified on the general-state store, mock all three so the test drives
// only the optimistic view logic.
vi.mock('./appGeneralStateStore', () => ({
   useAppGeneralStateStore: { getState: () => ({ actions: { setLastModifiedStore: vi.fn() } }) },
}));

vi.mock('@/lib/drawer/drawerCommandEngine', () => {
   // The store reaches the engine through `getActiveDrawerEngine`, so the stub answers there too - the same
   // object either way, which keeps the assertions on `drawerCommandEngine.execute` reading the real calls.
   const engine = {
      execute: vi.fn().mockResolvedValue(undefined),
      undo: vi.fn().mockResolvedValue(undefined),
      redo: vi.fn().mockResolvedValue(undefined),
      canUndo: () => false,
      canRedo: () => false,
      subscribe: vi.fn(),
   };
   return {
      drawerCommandEngine: engine,
      getActiveDrawerEngine: () => engine,
      subscribeActiveDrawerEngine: vi.fn(),
      createReorderItemsCommand: vi.fn(() => ({ label: 'reorder-item' })),
      createReorderFoldersCommand: vi.fn(() => ({ label: 'reorder-folder' })),
      createMoveItemCommand: vi.fn(() => ({ label: 'move-item' })),
      createMoveFolderCommand: vi.fn(() => ({ label: 'move-folder' })),
   };
});

vi.mock('@/lib/drawer/drawerRepository', () => ({
   getFolderItems: vi.fn().mockResolvedValue([]),
   getItemCountsForFolders: vi.fn().mockResolvedValue(new Map()),
   queryItems: vi.fn().mockResolvedValue([]),
}));

// The folder structure is served from the folder-tree cache, not the store; stub its selectors so the
// store's item-loading logic is tested in isolation.
vi.mock('@/lib/drawer/drawerFolderTree', () => ({
   getChildFolders: vi.fn(() => []),
   getChildFolderCount: vi.fn(() => 0),
   whenFolderTreeSettled: vi.fn().mockResolvedValue(undefined),
}));

// -- Local Imports (after the mocks so the store binds the mocked deps) --
import { useDrawerStore, activeSearchFilters, isSearchFilterActive } from './drawerStore';
import { drawerCommandEngine } from '@/lib/drawer/drawerCommandEngine';
import { getFolderItems, queryItems } from '@/lib/drawer/drawerRepository';
import type { DrawerItemSummary } from '@/lib/drawer/drawerRepository';
import type { DrawerItemRecord } from '@/lib/drawer/drawerRecords';

const item = (id: string) => ({ id, name: id, parentFolderId: 'root', order: 0 }) as unknown as DrawerItemRecord;
const ids = (rows: { id: string }[] | undefined) => (rows ?? []).map((row) => row.id);

const seedItems = (rows: DrawerItemRecord[]) =>
   useDrawerStore.setState({ currentFolderId: null, currentFolderView: { items: rows, childCounts: new Map() }, error: null });

describe('drawerStore optimistic reorder/move', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      (drawerCommandEngine.execute as Mock).mockResolvedValue(undefined);
      (getFolderItems as Mock).mockResolvedValue([]);
      useDrawerStore.setState({ currentFolderId: null, currentFolderView: null, error: null });
   });

   // Items stay in the store and reorder/move optimistically; folders moved to the cache (re-derived on
   // the mutation), so they have no optimistic store step here.
   it('reorderItems applies the new order to currentFolderView synchronously', async () => {
      seedItems([item('a'), item('b'), item('c')]);
      const pending = useDrawerStore.getState().actions.reorderItems(null, 0, 2);
      // Asserted BEFORE awaiting: the optimistic `set` runs before the first await.
      expect(ids(useDrawerStore.getState().currentFolderView?.items)).toEqual(['b', 'c', 'a']);
      await pending;
   });

   it('moveItem removes the moved row from currentFolderView synchronously', async () => {
      seedItems([item('a'), item('b'), item('c')]);
      const pending = useDrawerStore.getState().actions.moveItem('b', 'dest');
      expect(ids(useDrawerStore.getState().currentFolderView?.items)).toEqual(['a', 'c']);
      await pending;
   });

   it('reverts the optimistic view and surfaces the error when the command fails', async () => {
      seedItems([item('a'), item('b'), item('c')]);
      (drawerCommandEngine.execute as Mock).mockRejectedValueOnce(new Error('persist failed'));
      // The revert reload returns the real, unchanged order.
      (getFolderItems as Mock).mockResolvedValue([item('a'), item('b'), item('c')]);

      await expect(useDrawerStore.getState().actions.reorderItems(null, 0, 2)).rejects.toThrow('persist failed');

      expect(ids(useDrawerStore.getState().currentFolderView?.items)).toEqual(['a', 'b', 'c']);
      expect(useDrawerStore.getState().error).not.toBeNull();
   });
});

describe('drawerStore navigation clears the items view (item skeleton)', () => {
   beforeEach(() => {
      vi.clearAllMocks();
      (getFolderItems as Mock).mockResolvedValue([]);
   });

   it('setDrawerCurrentFolderId drops the stale view immediately, then loads the new folder', async () => {
      seedItems([item('a'), item('b')]);
      const pending = useDrawerStore.getState().actions.setDrawerCurrentFolderId('sub');
      // Synchronous: the previous folder's content is gone before the new query resolves, so the
      // UI shows a skeleton (currentFolderView === null) instead of stale rows.
      expect(useDrawerStore.getState().currentFolderView).toBeNull();
      await pending;
      // Once loaded, the view is populated again - no longer the skeleton state.
      expect(useDrawerStore.getState().currentFolderView).not.toBeNull();
   });

   it('reloadCurrentFolder keeps the existing view (no skeleton on a reload / optimistic mutation)', async () => {
      seedItems([item('a'), item('b')]);
      const before = useDrawerStore.getState().currentFolderView;
      const pending = useDrawerStore.getState().actions.reloadCurrentFolder();
      // The view is NOT nulled mid-reload, so an in-place reload or optimistic mutation never flashes a skeleton.
      expect(useDrawerStore.getState().currentFolderView).toBe(before);
      await pending;
   });
});

describe('drawerStore search', () => {
   const summary = (id: string): DrawerItemSummary => ({
      id, name: id, type: 'CHARACTER_CARD', game: 'LEGENDS', parentFolderId: null, createdAt: 0, updatedAt: 0, cardTypeClass: 'card-type-hero',
   });

   beforeEach(() => {
      vi.clearAllMocks();
      (queryItems as Mock).mockResolvedValue([]);
      useDrawerStore.setState({ searchCriteria: null, searchResults: null, isSearching: false });
   });

   it('applySearch runs the query, stores results, and clears the loading flag', async () => {
      (queryItems as Mock).mockResolvedValueOnce([summary('a'), summary('b')]);
      await useDrawerStore.getState().actions.applySearch({ text: 'a' });

      expect(queryItems).toHaveBeenCalledWith({ text: 'a' });
      expect(useDrawerStore.getState().searchCriteria).toEqual({ text: 'a' });
      expect(ids(useDrawerStore.getState().searchResults ?? undefined)).toEqual(['a', 'b']);
      expect(useDrawerStore.getState().isSearching).toBe(false);
   });

   it('applySearch leaves the browse view untouched (clearing search returns to the same folder)', async () => {
      seedItems([item('x'), item('y')]);
      const before = useDrawerStore.getState().currentFolderView;
      (queryItems as Mock).mockResolvedValueOnce([summary('a')]);
      await useDrawerStore.getState().actions.applySearch({ text: 'a' });

      expect(useDrawerStore.getState().currentFolderView).toBe(before); // same reference: browse untouched
   });

   it('clearSearch nulls the criteria and results', async () => {
      (queryItems as Mock).mockResolvedValueOnce([summary('a')]);
      await useDrawerStore.getState().actions.applySearch({ text: 'a' });
      useDrawerStore.getState().actions.clearSearch();

      expect(useDrawerStore.getState().searchCriteria).toBeNull();
      expect(useDrawerStore.getState().searchResults).toBeNull();
   });

   it('updateSearchCriteria merges a partial into the active criteria and re-applies', async () => {
      await useDrawerStore.getState().actions.applySearch({ text: 'detective' });
      (queryItems as Mock).mockClear();

      await useDrawerStore.getState().actions.updateSearchCriteria({ games: ['CITY_OF_MIST'] });

      // The text is preserved and the games filter is added (merge, not replace).
      expect(queryItems).toHaveBeenCalledWith({ text: 'detective', games: ['CITY_OF_MIST'] });
      expect(useDrawerStore.getState().searchCriteria).toEqual({ text: 'detective', games: ['CITY_OF_MIST'] });
   });

   it('updateSearchCriteria merges into an empty (null) criteria', async () => {
      useDrawerStore.setState({ searchCriteria: null });
      await useDrawerStore.getState().actions.updateSearchCriteria({ types: ['STATUS_TRACKER'] });
      expect(useDrawerStore.getState().searchCriteria).toEqual({ types: ['STATUS_TRACKER'] });
   });
});

describe('active-filter helpers', () => {
   it('isSearchFilterActive is true for any filter, false for null / empty / sort-only', () => {
      expect(isSearchFilterActive(null)).toBe(false);
      expect(isSearchFilterActive({})).toBe(false);
      expect(isSearchFilterActive({ text: '   ' })).toBe(false); // whitespace-only is not active
      expect(isSearchFilterActive({ types: [] })).toBe(false); // empty array = no constraint
      expect(isSearchFilterActive({ sort: { by: 'name', direction: 'asc' } })).toBe(false); // sort alone

      expect(isSearchFilterActive({ text: 'a' })).toBe(true);
      expect(isSearchFilterActive({ types: ['FULL_BOARD'] })).toBe(true);
      expect(isSearchFilterActive({ games: ['LEGENDS'] })).toBe(true);
      expect(isSearchFilterActive({ createdBetween: [0, 1] })).toBe(true);
      expect(isSearchFilterActive({ updatedBetween: [0, 1] })).toBe(true);
   });

   it('activeSearchFilters lists the active facets (for the count badge), excluding sort', () => {
      expect(activeSearchFilters({ text: 'a', games: ['LEGENDS'], sort: { by: 'name', direction: 'asc' } })).toEqual(['text', 'games']);
      expect(activeSearchFilters(null)).toEqual([]);
   });
});
