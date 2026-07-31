// -- Other Library Imports --
import { create } from 'zustand';
import { arrayMove } from '@dnd-kit/sortable';

// -- Utils Imports --
import { reIdImportedItemContent } from '@/lib/drawer/reIdImportedContent';

// -- Drawer Data Layer Imports --
import { getFolderItems, getItemCountsForFolders, queryItems } from '@/lib/drawer/drawerRepository';
import { getChildFolders, getChildFolderCount, setOptimisticFolderChildren, whenFolderTreeSettled } from '@/lib/drawer/drawerFolderTree';
import {
   createCreateFolderCommand,
   createCreateItemCommand,
   createDeleteFolderCommand,
   createDeleteItemCommand,
   createImportDrawerAsFolderCommand,
   createImportFolderCommand,
   createMoveFolderCommand,
   createMoveItemCommand,
   createRenameFolderCommand,
   createRenameItemCommand,
   createReorderFoldersCommand,
   createReorderItemsCommand,
   createUpdateItemContentCommand,
   getActiveDrawerEngine,
   subscribeActiveDrawerEngine,
} from '@/lib/drawer/drawerCommandEngine';

// -- Store and Hook Imports --
import { useAppGeneralStateStore } from './appGeneralStateStore';

// -- Type Imports --
import type { DrawerCommand } from '@/lib/drawer/drawerCommandEngine';
import type { DrawerItemQuery, DrawerItemSummary } from '@/lib/drawer/drawerRepository';
import type { DrawerItemRecord } from '@/lib/drawer/drawerRecords';
import type { Drawer, Folder, DrawerItemContent, GeneralItemType, GameSystem } from '@/lib/types/drawer';

/*
 * Drawer store - the React-facing facade over the normalized Dexie repository and
 * the command/undo engine. The store no longer holds the whole drawer tree, nor
 * zustand `persist`/`temporal`: its state is the loaded view of the *current folder*
 * plus flags, and its actions are async - each dispatches a command through the
 * engine, then explicitly re-queries the current folder. Action names are kept
 * aligned with the old store so consumers change only by adding `await`.
 */

/**
 * A sheet item queued to be dropped into the drawer (named via the modification
 * window before it becomes a real item). Kept verbatim from the old store,
 * including `presetId` (used to link a loaded character to its drawer item id).
 */
export interface PendingDrawerItem {
   game: GameSystem;
   type: GeneralItemType;
   content: DrawerItemContent;
   parentFolderId?: string;
   defaultName: string;
   presetId?: string;
}

/**
 * The loaded view of the current folder's ITEMS. `null` until the first load completes (and while
 * navigating to a new folder). The folder STRUCTURE is not here - it is served from the folder-tree
 * cache - so this nulling drives only the item skeleton, never the (always-cached) folder list.
 */
export interface DrawerCurrentFolderView {
   items: DrawerItemRecord[];
   /** Direct child counts keyed by child-folder id, for rendering folder summary rows. */
   childCounts: Map<string, { folderCount: number; itemCount: number }>;
}

/** A repository/engine error surfaced to the UI (toasts are raised by the calling hooks). */
export interface DrawerStoreError {
   code: string;
   message: string;
}

/** How long a revealed row stays highlighted before the signal auto-clears (>= the pulse animation). */
const DRAWER_HIGHLIGHT_MS = 1600;

export interface DrawerState {
   currentFolderId: string | null;
   currentFolderView: DrawerCurrentFolderView | null;
   isLoading: boolean;
   error: DrawerStoreError | null;
   pendingItem: PendingDrawerItem | null;
   canUndo: boolean;
   canRedo: boolean;
   /**
    * TRANSIENT: the id of a row a Portal reveal just navigated to, so its entry can scroll into view and
    * pulse ONCE. Set by {@link DrawerState.actions.highlightItem}, auto-cleared after {@link DRAWER_HIGHLIGHT_MS};
    * never persisted.
    */
   highlightItemId: string | null;
   // Search runs parallel to the browse view (it's left untouched, so clearing search returns to the
   // same folder). `searchResults` are content-free summaries; a card lazy-loads content later.
   searchCriteria: DrawerItemQuery | null;
   searchResults: DrawerItemSummary[] | null;
   isSearching: boolean;
   actions: {
      // Drawer-level
      importDrawerAsFolder: (newDrawer: Drawer, folderName: string) => Promise<void>;
      // Folder actions
      addFolder: (name: string, parentFolderId?: string) => Promise<string>;
      addImportedFolder: (folder: Folder, parentFolderId?: string) => Promise<void>;
      renameFolder: (folderId: string, newName: string) => Promise<void>;
      deleteFolder: (folderId: string) => Promise<void>;
      moveFolder: (folderId: string, destinationFolderId?: string) => Promise<void>;
      reorderFolders: (parentFolderId: string | null, oldIndex: number, newIndex: number) => Promise<void>;
      // Item actions
      addItem: (name: string, game: GameSystem, type: GeneralItemType, content: DrawerItemContent, parentFolderId?: string, presetId?: string) => Promise<string>;
      addImportedItem: (itemContent: DrawerItemContent, itemType: GeneralItemType, game: GameSystem, parentFolderId?: string) => Promise<void>;
      renameItem: (itemId: string, newName: string) => Promise<void>;
      deleteItem: (itemId: string) => Promise<void>;
      moveItem: (itemId: string, destinationFolderId?: string) => Promise<void>;
      reorderItems: (parentFolderId: string | null, oldIndex: number, newIndex: number) => Promise<void>;
      updateItem: (itemId: string, newContent: DrawerItemContent, newName?: string) => Promise<void>;
      // Drop flow
      initiateItemDrop: (itemInfo: PendingDrawerItem) => void;
      clearPendingItemDrop: () => void;
      // Navigation + view
      setDrawerCurrentFolderId: (id: string | null) => Promise<void>;
      reloadCurrentFolder: () => Promise<void>;
      /** Flags a row as just-revealed (scroll + one-shot pulse); auto-clears after the pulse window. */
      highlightItem: (itemId: string) => void;
      // Search (parallel to browse; runs the query layer)
      applySearch: (criteria: DrawerItemQuery) => Promise<void>;
      /** Merges `partial` into the active criteria (null = empty) and re-runs the search. */
      updateSearchCriteria: (partial: Partial<DrawerItemQuery>) => Promise<void>;
      clearSearch: () => void;
      // Undo / redo (drive the command engine; mirrored into canUndo/canRedo)
      undoDrawer: () => Promise<void>;
      redoDrawer: () => Promise<void>;
   };
}

const initialState: Pick<
   DrawerState,
   'currentFolderId' | 'currentFolderView' | 'isLoading' | 'error' | 'pendingItem' | 'canUndo' | 'canRedo' | 'searchCriteria' | 'searchResults' | 'isSearching' | 'highlightItemId'
> = {
   currentFolderId: null,
   currentFolderView: null,
   isLoading: false,
   error: null,
   pendingItem: null,
   canUndo: false,
   canRedo: false,
   searchCriteria: null,
   searchResults: null,
   isSearching: false,
   highlightItemId: null,
};

/** Normalizes a thrown value into the store's `{ code, message }` error shape. */
function toStoreError(error: unknown): DrawerStoreError {
   const message = error instanceof Error ? error.message : String(error);
   if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
      return { code: (error as { code: string }).code, message };
   }
   return { code: 'UNKNOWN', message };
}

/** Marks the drawer as the most recently modified store, so Ctrl/Cmd+Z routes here. */
function markDrawerModified(): void {
   useAppGeneralStateStore.getState().actions.setLastModifiedStore('drawer');
}

export const useDrawerStore = create<DrawerState>()((set, get) => {
   // The pending auto-clear for the transient reveal highlight; reset on each reveal so a re-reveal restarts it.
   let highlightClearTimer: ReturnType<typeof setTimeout> | null = null;

   /**
    * Loads a folder's ITEMS (`null` = root) and the child-folder summary counts. The folder structure
    * (the folders themselves, breadcrumb, parent) comes from the cache, so this queries only items - no
    * folder query on navigation. Each child folder's `folderCount` is read from the cache; its
    * `itemCount` is a cheap items-only count. Sets `isLoading`/`error`; never throws.
    */
   const loadView = async (folderId: string | null): Promise<void> => {
      set({ isLoading: true, error: null });
      try {
         // Wait for any in-flight rebuild so the cache (folder counts below, and the folder list the UI
         // reads) reflects the latest mutation; on a settled cache this resolves immediately.
         await whenFolderTreeSettled();
         const items = await getFolderItems(folderId);
         const childFolders = getChildFolders(folderId);
         const itemCounts = await getItemCountsForFolders(childFolders.map((folder) => folder.id));
         const childCounts = new Map(
            childFolders.map((folder) => [
               folder.id,
               { folderCount: getChildFolderCount(folder.id), itemCount: itemCounts.get(folder.id) ?? 0 },
            ]),
         );
         set({ currentFolderView: { items, childCounts }, isLoading: false });
      } catch (error) {
         set({ isLoading: false, error: toStoreError(error) });
      }
   };

   /**
    * Runs a mutation: marks the drawer modified, executes the command through the
    * engine, then re-queries the current folder. On engine failure it records the
    * error and rethrows (so the calling hook can branch / toast); a later view
    * reload failure is captured in `error` without throwing.
    */
   const runMutation = async (command: DrawerCommand): Promise<void> => {
      markDrawerModified();
      try {
         await getActiveDrawerEngine().execute(command);
      } catch (error) {
         set({ error: toStoreError(error) });
         throw error;
      }
      await loadView(get().currentFolderId);
      // Keep an active search in sync after a mutation (a rename/delete/move from a result row must
      // reflect in the flat list, which the browse reload above does not touch).
      await refreshSearchIfActive();
   };

   /** Re-runs the active search (if any) so the results reflect the latest data; no-op when not searching. */
   const refreshSearchIfActive = async (): Promise<void> => {
      const criteria = get().searchCriteria;
      if (!criteria) return;
      try {
         const results = await queryItems(criteria);
         // Guard against a stale resolve overwriting a newer search.
         if (get().searchCriteria === criteria) set({ searchResults: results });
      } catch (error) {
         set({ error: toStoreError(error) });
      }
   };

   return {
      ...initialState,
      actions: {
         // ==================
         //  Drawer-level
         // ==================
         importDrawerAsFolder: async (newDrawer, folderName) => {
            await runMutation(createImportDrawerAsFolderCommand(newDrawer, folderName, null));
         },

         // ==================
         //  Folder actions
         // ==================
         addFolder: async (name, parentFolderId) => {
            const command = createCreateFolderCommand({ name, parentFolderId: parentFolderId ?? null });
            await runMutation(command);
            return command.getCreatedFolderId() ?? '';
         },
         addImportedFolder: async (folder, parentFolderId) => {
            await runMutation(createImportFolderCommand(folder, parentFolderId ?? null));
         },
         renameFolder: async (folderId, newName) => {
            await runMutation(createRenameFolderCommand(folderId, newName));
         },
         deleteFolder: async (folderId) => {
            await runMutation(createDeleteFolderCommand(folderId));
         },
         moveFolder: async (folderId, destinationFolderId) => {
            // No optimistic step: the folder list is served from the folder-tree cache, which the
            // command's engine notify re-derives - the moved folder leaves this view on its own.
            await runMutation(createMoveFolderCommand(folderId, destinationFolderId ?? null));
         },
         reorderFolders: async (parentFolderId, oldIndex, newIndex) => {
            // Optimistic: snap to the predicted order instantly via the folder-tree's transient override (a
            // plain array-move, matching what the DB will produce), THEN persist. The command's rebuild
            // re-derives the truth and clears the override; a failed command's rebuild re-reads the old order
            // so it self-reverts. No source-map patching - the override is a throwaway, wiped every rebuild.
            const current = getChildFolders(parentFolderId);
            if (oldIndex >= 0 && oldIndex < current.length && newIndex >= 0 && newIndex < current.length) {
               setOptimisticFolderChildren(parentFolderId, arrayMove([...current], oldIndex, newIndex));
            }
            await runMutation(createReorderFoldersCommand(parentFolderId, oldIndex, newIndex));
         },

         // ==================
         //  Item actions
         // ==================
         addItem: async (name, game, type, content, parentFolderId, presetId) => {
            // An explicit `presetId` (a Save-As / tab-drag id a caller minted) wins; otherwise a linked
            // content's own `drawerItemId` becomes the drawer item id, so the two stay in sync.
            const resolvedPresetId = presetId ?? ('drawerItemId' in content && content.drawerItemId ? (content.drawerItemId as string) : undefined);
            // A FULL_CHARACTER_SHEET that already carries a `drawerItemId` is a LINKED SAVE: the Save-to-Drawer
            // button, the tab->drawer drag, and Save-As all decide its identity UPSTREAM (Save and the tab-drag
            // KEEP the character's id and link it; Save-As forks to a fresh id via `forkCharacterToDrawerItem`).
            // Persist it VERBATIM so the drawer copy IS that character and the working tab stays linked to it -
            // re-id'ing here would strand the tab against a stray fork (the reported orphan bug). Boards / notes /
            // journals are already kept verbatim by `reIdImportedItemContent`; this brings a linked character in
            // line. An UNLINKED character (no `drawerItemId`) is a genuine independent add and still takes the
            // import re-id (the cross-ref-safe aggregate re-id).
            const isLinkedCharacterSave = type === 'FULL_CHARACTER_SHEET' && !!(content as { drawerItemId?: string }).drawerItemId;
            const freshContent = isLinkedCharacterSave ? content : reIdImportedItemContent(type, content);
            const command = createCreateItemCommand({ id: resolvedPresetId, name, game, type, content: freshContent, parentFolderId: parentFolderId ?? null });
            await runMutation(command);
            return command.getCreatedItemId() ?? '';
         },
         addImportedItem: async (itemContent, itemType, game, parentFolderId) => {
            // Re-ID the imported content by type (cross-ref-safe; the shared rule in `reIdImportedItemContent`
            // keeps a board / journal / note verbatim, routes a character through the aggregate re-id, and
            // deep-re-IDs a cross-ref-free card / tracker / post-it so it can't collide).
            const freshContent = reIdImportedItemContent(itemType, itemContent);
            const name = 'title' in freshContent ? freshContent.title : 'name' in freshContent ? freshContent.name : '';
            await runMutation(createCreateItemCommand({ name, game, type: itemType, content: freshContent, parentFolderId: parentFolderId ?? null }));
         },
         renameItem: async (itemId, newName) => {
            await runMutation(createRenameItemCommand(itemId, newName));
         },
         deleteItem: async (itemId) => {
            await runMutation(createDeleteItemCommand(itemId));
         },
         moveItem: async (itemId, destinationFolderId) => {
            // Optimistic: the moved item leaves the current view, so drop
            // it from the loaded items immediately; the command persists the move and the
            // reload confirms it. On failure, reload to restore the real view.
            const view = get().currentFolderView;
            if (view) set({ currentFolderView: { ...view, items: view.items.filter((item) => item.id !== itemId) } });
            try {
               await runMutation(createMoveItemCommand(itemId, destinationFolderId ?? null));
            } catch (error) {
               await loadView(get().currentFolderId);
               set({ error: toStoreError(error) });
               throw error;
            }
         },
         reorderItems: async (parentFolderId, oldIndex, newIndex) => {
            // Optimistic: reflect the new order in the loaded view at once
            // so the row lands where released, no wait for the command + reload. The
            // engine reorders with the same arrayMove semantics, so the reload is a no-op
            // visually; on failure, reload to revert to the persisted truth.
            const view = get().currentFolderView;
            if (view) set({ currentFolderView: { ...view, items: arrayMove(view.items, oldIndex, newIndex) } });
            try {
               await runMutation(createReorderItemsCommand(parentFolderId, oldIndex, newIndex));
            } catch (error) {
               await loadView(get().currentFolderId);
               set({ error: toStoreError(error) });
               throw error;
            }
         },
         updateItem: async (itemId, newContent, newName) => {
            await runMutation(createUpdateItemContentCommand(itemId, newContent, newName));
         },

         // ==================
         //  Drop flow (synchronous, unchanged)
         // ==================
         initiateItemDrop: (itemInfo) => {
            set({ pendingItem: itemInfo });
         },
         clearPendingItemDrop: () => {
            set({ pendingItem: null });
         },

         // ==================
         //  Navigation + view
         // ==================
         setDrawerCurrentFolderId: async (id) => {
            // Navigation: drop the previous folder's view immediately (currentFolderView = null) so the UI
            // shows a loading skeleton, not the stale contents, while the new folder loads. A reload keeps
            // its view (below), so a mutation / optimistic reorder never flashes a skeleton.
            set({ currentFolderId: id, currentFolderView: null });
            await loadView(id);
         },
         reloadCurrentFolder: async () => {
            await loadView(get().currentFolderId);
         },
         highlightItem: (itemId) => {
            // Set the transient signal (the target row reads it to scroll + pulse once), then schedule the
            // auto-clear. A repeat reveal resets the timer so the row keeps its highlight for a full window.
            if (highlightClearTimer) clearTimeout(highlightClearTimer);
            set({ highlightItemId: itemId });
            highlightClearTimer = setTimeout(() => {
               highlightClearTimer = null;
               set({ highlightItemId: null });
            }, DRAWER_HIGHLIGHT_MS);
         },

         // ==================
         //  Search (parallel to browse)
         // ==================
         applySearch: async (criteria) => {
            set({ searchCriteria: criteria, isSearching: true });
            try {
               const results = await queryItems(criteria);
               // Only apply if these are still the active criteria (a newer search may have superseded).
               if (get().searchCriteria === criteria) set({ searchResults: results, isSearching: false });
            } catch (error) {
               if (get().searchCriteria === criteria) set({ isSearching: false, error: toStoreError(error) });
            }
         },
         updateSearchCriteria: async (partial) => {
            const merged = { ...(get().searchCriteria ?? {}), ...partial };
            await get().actions.applySearch(merged);
         },
         clearSearch: () => {
            set({ searchCriteria: null, searchResults: null, isSearching: false });
         },

         // ==================
         //  Undo / redo (engine-backed, navigation-independent)
         // ==================
         undoDrawer: async () => {
            await getActiveDrawerEngine().undo();
            await loadView(get().currentFolderId);
         },
         redoDrawer: async () => {
            await getActiveDrawerEngine().redo();
            await loadView(get().currentFolderId);
         },
      },
   };
});

/**
 * The active FILTER facets in a search query (text / types / games / created / updated). `sort` is NOT
 * a filter - it only orders results a filter produced - so a sort-only query is not "active".
 */
export function activeSearchFilters(criteria: DrawerItemQuery | null): ('text' | 'types' | 'games' | 'createdBetween' | 'updatedBetween')[] {
   if (!criteria) return [];
   const active: ('text' | 'types' | 'games' | 'createdBetween' | 'updatedBetween')[] = [];
   if (criteria.text?.trim()) active.push('text');
   if (criteria.types?.length) active.push('types');
   if (criteria.games?.length) active.push('games');
   if (criteria.createdBetween) active.push('createdBetween');
   if (criteria.updatedBetween) active.push('updatedBetween');
   return active;
}

/** Whether a search is active (any filter present); drives the browse-vs-results body branch. */
export function isSearchFilterActive(criteria: DrawerItemQuery | null): boolean {
   return activeSearchFilters(criteria).length > 0;
}

/** Selector for the drawer action bag (stable reference). */
export const useDrawerActions = () => useDrawerStore((state) => state.actions);

// Mirror the command engine's undo/redo availability into the store so the UI can
// read `canUndo`/`canRedo` reactively. The engine notifies on execute/undo/redo/
// clear; commands operate by id, so this is independent of the current folder.
// It follows the ACTIVE engine, so a tutorial's run reports its own history and the
// user's returns, untouched, the moment the demo engine is dropped.
subscribeActiveDrawerEngine(() => {
   const engine = getActiveDrawerEngine();
   useDrawerStore.setState({ canUndo: engine.canUndo(), canRedo: engine.canRedo() });
});
