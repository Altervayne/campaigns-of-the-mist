// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Store Imports --
import { useDrawerStore } from '@/lib/stores/drawerStore';
import { getChildFolders, whenFolderTreeSettled } from '@/lib/drawer/drawerFolderTree';
import { useTabManagerStore } from '@/lib/character/tabManagerStore';
import { getActiveBoardStore } from '@/lib/board/boardStoreRegistry';

// -- Board Imports --
import { boardDropPlacement } from '@/lib/board/boardDropPlacement';
import { embeddedSpecForDrawerItem } from '@/lib/board/embedDrawerItem';
import { importBoard } from '@/lib/board/boardRepository';
import { importNote } from '@/lib/notes/noteRepository';

// -- Type Imports --
import type { DragEndEvent } from '@dnd-kit/core';
import type { DragEndDeps, DragEndSnapshot, DragEndTarget } from '@/hooks/character-sheet/dnd/dragEndDeps';
import type { Board, Journal, Note } from '@/lib/types/board';
import type { Character, Card as CardData, Tracker } from '@/lib/types/character';
import type { DrawerItem } from '@/lib/types/drawer';

/*
 * The two drawer-sourced routes: the geometry-resolved in-drawer move, which runs BEFORE the `!over`
 * guard, and BRANCH 1 once dnd-kit has resolved a target.
 */

// ##################################################
// ###   Manual in-drawer drop targeting          ###
// ##################################################
// For a drawer-sourced drag, the in-drawer DROP target is resolved by live cursor
// geometry, NOT dnd-kit's `over`, its collision rects desync in
// the scrollable/animated drawer (folder drops were center-only). This runs BEFORE
// the `over` null-guard so an off-center drop the collision missed still lands.
// A folder-row target moves into that folder; a current-folder target (Back, the
// items body, anywhere else in the drawer) moves into the folder currently being
// VIEWED, read live from the store, so a dwell-Back-then-release lands in the
// folder you navigated to (not its parent). Same-folder current-folder drops fall
// through to the dnd-kit reorder path below.
export function routeManualDrawerDrop(
   event: DragEndEvent,
   { dragKind, manualDrawerTarget }: DragEndSnapshot,
   { moveFolder, reorderFolders, moveItem }: DragEndDeps,
): boolean {
   const { active, over } = event;
   const activeIsDrawerMove =
      dragKind === 'drawer-character' || dragKind === 'drawer-component' || dragKind === 'drawer-folder';
   if (!activeIsDrawerMove) return false;

   const draggedId = active.id.toString();
   const isFolderDrag = dragKind === 'drawer-folder';

   // Folder onto a reorder SLOT -> place at that exact position, ahead of the generic
   // folder-row / current-folder handling so the user lands where the highlighted slot
   // shows. When the dragged folder is already in this view it is a pure reorder; when
   // it arrived via a spring navigation it is moved into the current folder and then
   // slotted into place (an append + reorder, hence two undo steps). Driven by dnd-kit's
   // `over` (the drop-zone droppable), so it must run independently of the geometry resolver:
   // the slots sit in the folder-nav region the resolver excludes, so its target is null there.
   if (isFolderDrag && over?.data.current?.type === 'drawer-drop-zone') {
      const destParentId = useDrawerStore.getState().currentFolderId ?? null;
      // Folder scope comes from the folder-tree cache (the store no longer carries folders).
      const scope = getChildFolders(destParentId);
      const { targetId } = over.data.current as { targetId: string };
      const fromIndex = scope.findIndex((f) => f.id === draggedId);
      const slotIndex = targetId === 'last' ? scope.length : scope.findIndex((f) => f.id === targetId);
      if (fromIndex !== -1) {
         let newIndex = targetId === 'last' ? scope.length - 1 : slotIndex;
         if (newIndex !== -1) {
            if (fromIndex < newIndex) newIndex -= 1;
            if (fromIndex !== newIndex) void reorderFolders(destParentId, fromIndex, newIndex);
         }
      } else {
         const targetIndex = slotIndex < 0 ? scope.length : slotIndex;
         void (async () => {
            await moveFolder(draggedId, destParentId ?? undefined);
            // The move re-derived the cache; read the appended position back from it to slot it in.
            await whenFolderTreeSettled();
            const after = getChildFolders(destParentId);
            const appendedIndex = after.findIndex((f) => f.id === draggedId);
            if (appendedIndex !== -1 && appendedIndex !== targetIndex) {
               await reorderFolders(destParentId, appendedIndex, targetIndex);
            }
         })();
      }
      return true;
   }

   // The remaining in-drawer drops need the geometry-resolved target: nest onto a folder ROW, or
   // move into the VIEWED folder (the items body / Back). When it is null - the cursor is over
   // chrome (header / breadcrumb / search) - there is nothing more to do here.
   if (manualDrawerTarget) {
      if (manualDrawerTarget.kind === 'folder') {
         if (manualDrawerTarget.id !== draggedId) {
            if (isFolderDrag) void moveFolder(draggedId, manualDrawerTarget.id);
            else void moveItem(draggedId, manualDrawerTarget.id);
         }
         return true;
      }
      // current-folder: move into the folder being VIEWED, unless the dragged item is
      // ALREADY a child of it (then fall through to reorder). The source of truth is
      // the loaded current-folder view, NOT the drag data's `parentFolderId`, which is
      // stale/null after a spring navigation (it reported ROOT for an item dragged from
      // a folder, making a real cross-folder drop look like a same-folder no-op).
      const currentFolderId = useDrawerStore.getState().currentFolderId ?? null;
      const view = useDrawerStore.getState().currentFolderView;
      const alreadyInCurrentFolder = isFolderDrag
         ? getChildFolders(currentFolderId).some((f) => f.id === draggedId)
         : (view?.items ?? []).some((i) => i.id === draggedId);
      if (!alreadyInCurrentFolder) {
         if (isFolderDrag) void moveFolder(draggedId, currentFolderId ?? undefined);
         else void moveItem(draggedId, currentFolderId ?? undefined);
         return true;
      }
      // Already in the current folder -> fall through to the dnd-kit reorder path below.
   }
   return false;
}

// ##############################################
// ###   BRANCH 1: Dragging FROM the Drawer   ###
// ##############################################
export function routeDrawerDrag(
   event: DragEndEvent,
   { over, activeType, overType, overIdStr, dropPointer }: DragEndTarget,
   {
      character, currentFolderView, tNotifications, contractIfExpanded,
      reorderItems, openCharacterTab, openBoardTab, openNoteTab, setActiveTab, setContextualGame,
      addImportedCard, addImportedTracker, addImportedJournal,
   }: DragEndDeps,
): boolean {
   const { active } = event;
   if (activeType !== 'drawer-item' && activeType !== 'drawer-folder') return false;

   // ==================
   //  SCENARIO 1.0: Dropping a card/tracker onto the board canvas
   // ==================
   // Board-only target (the zone exists solely on a board tab). A board is game-agnostic, so
   // there is NO game gate. A card/tracker becomes a self-contained COPY, an image a native
   // image, and a saved character a read-only reference element - all at the drop point. A
   // folder / full board has no spec and no-ops.
   if (overIdStr === 'board-drop-zone') {
      const boardStore = getActiveBoardStore();
      const draggedItem = active.data.current?.item as DrawerItem | undefined;
      if (!boardStore || !draggedItem) return true;
      const spec = embeddedSpecForDrawerItem(draggedItem);
      if (!spec) return true;

      void boardStore.getState().actions.addItem({
         ...boardDropPlacement(boardStore, dropPointer, spec),
         kind: spec.kind,
         content: spec.content,
      });
      contractIfExpanded();
      return true;
   }

   // ==================
   //  SCENARIO 1.1: Dropping a full character onto the play area
   // ==================
   if (overIdStr === 'main-character-drop-zone') {
      const draggedItem = active.data.current?.item as DrawerItem;
      if (draggedItem?.type === 'FULL_CHARACTER_SHEET') {
         const characterData = draggedItem.content as Character;
         openCharacterTab(characterData, draggedItem.id);
         setContextualGame(characterData.game);
         contractIfExpanded();
      } else if (draggedItem?.type === 'FULL_BOARD') {
         // A board dropped on the workspace opens like a character: focus its tab if already
         // open (don't re-import, so live unsaved edits aren't clobbered), else materialize the
         // drawer copy into the working tables and open it by id.
         const boardData = draggedItem.content as Board;
         if (useTabManagerStore.getState().openTabs.some((tab) => tab.id === boardData.id)) {
            setActiveTab(boardData.id);
         } else {
            void importBoard(boardData).then(() => openBoardTab(boardData.id));
         }
         contractIfExpanded();
      } else if (draggedItem?.type === 'NOTE') {
         // A note opens like a board: focus its tab if already open (don't re-import, so live
         // unsaved edits aren't clobbered), else materialize the drawer copy into the working
         // note table (linked to the drawer item) and open it by id.
         const noteData = draggedItem.content as Note;
         if (useTabManagerStore.getState().openTabs.some((tab) => tab.id === noteData.id)) {
            setActiveTab(noteData.id);
         } else {
            void importNote(noteData, draggedItem.id).then(() => openNoteTab(noteData.id));
         }
         contractIfExpanded();
      }
      return true;
   }

   // ==================
   //  SCENARIO 1.1b: Dropping a full character / board onto the tab strip (open or focus)
   // ==================
   // Only FULL_CHARACTER_SHEET / FULL_BOARD items are valid here; anything else is a no-op.
   if (overIdStr === 'tab-strip-drop-zone') {
      const draggedItem = active.data.current?.item as DrawerItem;
      if (draggedItem?.type === 'FULL_CHARACTER_SHEET') {
         const characterData = draggedItem.content as Character;
         openCharacterTab(characterData, draggedItem.id); // append-or-focus
         setContextualGame(characterData.game);
         contractIfExpanded();
      } else if (draggedItem?.type === 'FULL_BOARD') {
         // The drawer copy is the source of truth on open: materialize it into the
         // working tables, then focus-or-open its tab (by board id) so an already-open
         // board's live state is never clobbered.
         const boardData = draggedItem.content as Board;
         void importBoard(boardData).then(() => openBoardTab(boardData.id));
         contractIfExpanded();
      } else if (draggedItem?.type === 'NOTE') {
         // Same as a board: materialize the drawer copy into the working note table (linked to
         // the drawer item), then focus-or-open its tab (by note id).
         const noteData = draggedItem.content as Note;
         void importNote(noteData, draggedItem.id).then(() => openNoteTab(noteData.id));
         contractIfExpanded();
      }
      return true;
   }

   // ==================
   //  SCENARIO 1.2: Dropping INSIDE the drawer
   // ==================
   if (overType?.startsWith('drawer-') || overIdStr.startsWith('drawer-')) {
      const activeIsItem = activeType === 'drawer-item';
      const parentFolderId = active.data.current?.parentFolderId ?? null;
      // Scope = the currently loaded folder's children (the drawer only ever
      // shows one folder, so every in-drawer drag originates there).
      const itemsInScope = currentFolderView?.items ?? [];

      // NOTE: moves INTO a folder / Back / the items body of a different folder, and
      // ALL folder slot placements (reorder + cross-folder insert), are handled by the
      // manual geometry resolver above; this block now only handles same-folder
      // item REORDER. The `over` is resolved from live row geometry (customCollisionDetection),
      // so the live-shuffle lands on the right sibling - reliable at the edges and in place.
      if (overType === 'drawer-item' && activeIsItem && parentFolderId === (over.data.current?.parentFolderId ?? null)) {
         const oldIndex = itemsInScope.findIndex(item => item.id === active.id);
         const overIndex = itemsInScope.findIndex(item => item.id === over.id);
         if (oldIndex !== -1 && overIndex !== -1) void reorderItems(parentFolderId, oldIndex, overIndex);
         return true;
      }
   }

   // ==================
   //  SCENARIO 1.3: Dropping ONTO the character sheet
   // ==================
   // (Requires a character to be loaded)
   if (!character) return true;

   const isOverSheet = overIdStr === 'character-sheet-main-drop-zone' ||
                        overIdStr === 'tracker-drop-zone' ||
                        overIdStr === 'card-drop-zone' ||
                        overType === 'sheet-card' ||
                        overType === 'sheet-journal' ||
                        overType === 'sheet-tracker';

   if (isOverSheet) {
      if (activeType !== 'drawer-item') return true;

      const draggedItem = active.data.current?.item as DrawerItem;
      if (!draggedItem) return true;

      const isTrackerType = draggedItem.type === 'STATUS_TRACKER' || draggedItem.type === 'STORY_TAG_TRACKER' || draggedItem.type === 'STORY_THEME_TRACKER';
      const isImageCard = draggedItem.type === 'IMAGE_CARD';
      const isCardType = draggedItem.type === 'CHARACTER_CARD' || draggedItem.type === 'CHARACTER_THEME' || draggedItem.type === 'GROUP_THEME' || draggedItem.type === 'LOADOUT_THEME' || isImageCard;
      const isJournalType = draggedItem.type === 'JOURNAL';

      // Only sheet components add here; a FULL_CHARACTER_SHEET over the sheet is
      // not a failure (it opens a tab via its own zone), so don't toast for it.
      if (!isTrackerType && !isCardType && !isJournalType) return true;

      // Game mismatch: the drop can't land, tell the user why instead of a silent
      // no-op. NEUTRAL items are game-agnostic, so they skip this gate.
      if (draggedItem.game !== 'NEUTRAL' && draggedItem.game !== character.game) {
         toast.error(tNotifications(draggedItem.type === 'CHALLENGE_CARD'
            ? 'Notifications.general.importFailedWrongGameChallenge'
            : 'Notifications.general.importFailedWrongGame'));
         return true;
      }

      if (isTrackerType) {
         addImportedTracker(draggedItem.content as Tracker);
         toast.success(tNotifications('Notifications.character.componentImported'));
      } else if (isJournalType) {
         // A bare journal (game-agnostic): import a copy onto the sheet (fresh id, pages/bookmarks kept).
         addImportedJournal(draggedItem.content as Journal);
         toast.success(tNotifications('Notifications.character.componentImported'));
      } else if (isCardType) {
         const added = addImportedCard(draggedItem.content as CardData);
         if (added) {
            toast.success(tNotifications('Notifications.character.componentImported'));
         } else {
            toast.error(tNotifications('Notifications.character.duplicatePortrait'));
         }
      }
      contractIfExpanded();
      return true;
   }
   return false;
}
