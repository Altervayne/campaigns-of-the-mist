// -- React Imports --
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import type { DragStartEvent, DragOverEvent } from '@dnd-kit/core';

// -- Utils Imports --
import { sheetSectionForItemType } from '@/lib/utils/dnd';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Local Imports --
import { classifyDrag } from '@/hooks/character-sheet/dnd/dragClassification';
import { useDragEndRouter } from '@/hooks/character-sheet/dnd/useDragEndRouter';
import { useDragFeedbackLayer } from '@/hooks/character-sheet/dnd/useDragFeedbackLayer';
import { useDrawerSaveActions } from '@/hooks/character-sheet/dnd/useDrawerSaveActions';
import { useSheetReorderActions } from '@/hooks/character-sheet/dnd/useSheetReorderActions';
import { useTrackerSortableIds } from '@/hooks/useTrackerSortableIds';

// -- Drag-morph engine --
import { useDragMorph } from '@/components/molecules/drag-morph/useDragMorph';
import { buildDragIdentity } from '@/hooks/character-sheet/buildDragIdentity';

// -- Store Imports --
import { useCharacterStore, useCharacterActions } from '@/lib/stores/characterStore';
import { useTabManagerActions, useTabManagerStore } from '@/lib/character/tabManagerStore';
import { useDrawerStore, useDrawerActions } from '@/lib/stores/drawerStore';
import { useAppSettingsActions } from '@/lib/stores/appSettingsStore';
import { useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';

// -- Type Imports --
import type { DrawerItem, Folder as FolderType } from '@/lib/types/drawer';
import type { OpenTab } from '@/lib/character/tabManagerStore';
import type { ActiveDragItem } from '@/lib/utils/dnd';
import type { DragOverZone } from '@/lib/utils/dragFeedback';



/**
 * Owns the entire character-sheet drag-and-drop subsystem.
 *
 * Encapsulates the active drag item and hover state, the memoized SortableContext
 * id arrays, and the full set of @dnd-kit event handlers. `handleDragEnd` routes
 * every supported drop - drawer-to-sheet character loads and component imports,
 * sheet-to-drawer saves, in-drawer moves and reorders, and on-sheet reordering -
 * by inspecting the drag source and target and dispatching directly to the
 * character and drawer store actions. The page only forwards `handleDragStart`,
 * `handleDragOver`, and `handleDragEnd` to its `DndContext` and wires the returned
 * id arrays and drag state into its JSX.
 *
 * The three sheet drop zones (trackers, cards, main play area) are intentionally
 * NOT registered here: `useDroppable` only resolves against a `DndContext` when
 * it is called inside that context's subtree, and this hook runs in the page body
 * that renders the `DndContext` (so it is above it, not within). The zones
 * therefore self-register inside their descendant components (`TrackersSection`,
 * `CardsSection`, `SheetMainDropZone`).
 *
 * @returns The drag state, memoized id arrays, and the `DndContext` event
 *   handlers.
 */
export function useCharacterSheetDnD() {
   const { t: tNotifications } = useTranslation();

   const character = useCharacterStore((state) => state.character);
   const { reorderSheetLayout, reorderStatuses, reorderStoryTags, reorderStoryThemes,
            addImportedCard, addImportedTracker, addImportedJournal } = useCharacterActions();
   const { openCharacterTab, openBoardTab, openNoteTab, openPdfTab, reorderTabs, setActiveTab } = useTabManagerActions();
   // The drawer renders a single folder at a time, so the loaded current-folder
   // view is the reorder scope for any in-drawer drag.
   const currentFolderView = useDrawerStore((state) => state.currentFolderView);
   const { initiateItemDrop, moveFolder, reorderFolders, moveItem, reorderItems, setDrawerCurrentFolderId } = useDrawerActions();
   const { setContextualGame } = useAppSettingsActions();
   const { setDrawerOpen, setDrawerReceded, contractDrawer } = useAppGeneralStateActions();

   // ==================
   //  Utility & Library States
   // ==================
   const [isOverDrawer, setIsOverDrawer] = useState(false);
   const [activeDragItem, setActiveDragItem] = useState<ActiveDragItem>(null);
   const [overDragId, setOverDragId] = useState<string | null>(null);
   // The tab being dragged (the strip shares this DndContext); drives the overlay's
   // tab-preview branch. Separate from `activeDragItem` since a tab is not a sheet item.
   const [activeTabDrag, setActiveTabDrag] = useState<OpenTab | null>(null);

   // Memoize SortableContext arrays to prevent unnecessary re-renders
   const { statusIds, storyTagIds, storyThemeIds } = useTrackerSortableIds(character);

   // ==================
   //  Drag-morph engine
   // ==================
   // The reusable overlay-feedback engine (funnel clone + cursor cluster). This hook
   // computes the signals (cursor, descriptor, spring) and feeds them in; the engine
   // owns only the visual choreography and knows nothing of drawers/tabs/navigation.
   const { captureGrab, setCursor, setMorph, setIdentity, reset: resetMorph, renderClone, renderCluster } = useDragMorph();

   // ==================
   //  Drag-feedback layer
   // ==================
   // Owns the per-move refs, their change-gated mirrored state, and the teardown. `handleDragStart`
   // and `handleDragOver` below arm and refresh those refs; `handleDragEnd` reads them through
   // `readDragSnapshot()` before `clearDragFeedback()` clears them.
   const {
      drawerDropTarget,
      isOverTabLane,
      sheetHighlight,
      isIncompatibleComponentDrag,
      isDrawerItemDragActive,
      isFolderDragActive,
      springTarget,
      workspaceDwellKey,
      dragKindRef,
      tabStripElRef,
      isOverTabLaneRef,
      overZoneRef,
      sheetCompatibleRef,
      dragSourceCharacterIdRef,
      draggedFolderIdRef,
      setIsDrawerItemDragActive,
      setIsFolderDragActive,
      setSheetHighlight,
      setIsIncompatibleComponentDrag,
      handlePointerMove,
      updateContext,
      readDragSnapshot,
      clearDragFeedback,
   } = useDragFeedbackLayer({
      setDrawerCurrentFolderId,
      setActiveTab,
      setDrawerReceded,
      setCursor,
      setMorph,
      resetMorph,
   });

   const handleDragStart = useCallback((event: DragStartEvent) => {
      const { active } = event;

      // Arm the drag-feedback layer for every drag: classify the source, cache the
      // strip element for the lane test, and attach the move listener.
      dragKindRef.current = classifyDrag(active);
      // A drawer ITEM drag (not a folder) gets the See-Workspace strip while Expanded.
      setIsDrawerItemDragActive(dragKindRef.current === 'drawer-character' || dragKindRef.current === 'drawer-component');
      // A FOLDER drag shows the reorder drop slots in every drawer view (so a drilled-into folder can host it).
      setIsFolderDragActive(dragKindRef.current === 'drawer-folder');
      tabStripElRef.current = document.querySelector<HTMLElement>('[data-tab-strip]');
      isOverTabLaneRef.current = false;
      overZoneRef.current = null;
      // The dragged folder is excluded as a spring target (can't drill into what you hold).
      draggedFolderIdRef.current = dragKindRef.current === 'drawer-folder' ? String(active.id) : null;
      window.addEventListener('pointermove', handlePointerMove);

      // Capture the grab point so the clone funnels toward the cursor, not the card
      // center. dnd-kit provides the dragged element's initial rect + the activator.
      const activator = event.activatorEvent as PointerEvent | null;
      const initialRect = event.active.rect.current.initial;
      if (initialRect && activator && typeof activator.clientX === 'number') {
         captureGrab(initialRect, activator.clientX, activator.clientY);
      }

      // A tab drag is previewed via its own overlay branch, not as a sheet item.
      // Auto-open the drawer so the tab->drawer save has visible drop targets (the
      // chosen affordance; it does not auto-close).
      const untitledLabel = tNotifications('Tabs.untitled');

      if (active.data.current?.type === DRAG_TYPES.TAB) {
         // Preview the tab by its real kind (board/note/character), so the overlay renders the
         // board/note preview rather than the character default. The strip carries only the tab id,
         // so the kind is read from the tab manager.
         const draggedTab = useTabManagerStore.getState().openTabs.find((openTab) => openTab.id === String(active.id));
         setActiveTabDrag(draggedTab ?? { id: String(active.id), type: 'character' });
         setDrawerOpen(true);
         setIdentity(buildDragIdentity({ kind: dragKindRef.current, active, untitledLabel }));
         return;
      }

      if (active.data.current?.isDrawer) {
         const drawerItem = active.data.current.item as DrawerItem | FolderType;
         setActiveDragItem(drawerItem);
         setIdentity(buildDragIdentity({ kind: dragKindRef.current, active, untitledLabel }));
         // A component dragged while a character of a DIFFERENT game is loaded can't be
         // dropped on the sheet, flag it to show the "can't drop here" overlay. NEUTRAL
         // items are game-agnostic, so they are never incompatible.
         if (
            dragKindRef.current === 'drawer-component' && character &&
            (drawerItem as DrawerItem).game !== 'NEUTRAL' &&
            (drawerItem as DrawerItem).game !== character.game
         ) {
            setIsIncompatibleComponentDrag(true);
         }
         return;
      }

      const allSheetItems = [...(character?.cards || []), ...(character?.journals || []), ...(character?.trackers.statuses || []), ...(character?.trackers.storyTags || []), ...(character?.trackers.storyThemes || [])];
      const item = allSheetItems.find(i => i.id === active.id);
      if (item) {
         setActiveDragItem(item);
         setIdentity(buildDragIdentity({ kind: dragKindRef.current, active, sheetItem: item, untitledLabel }));
         // Remember the source character so a drop on a DIFFERENT tab's sheet (after
         // tab auto-nav) imports a copy instead of a no-op same-character reorder.
         dragSourceCharacterIdRef.current = character?.id ?? null;
      }
   }, [character, setDrawerOpen, handlePointerMove, captureGrab, setIdentity, tNotifications, draggedFolderIdRef,
      dragKindRef, dragSourceCharacterIdRef, isOverTabLaneRef, overZoneRef, tabStripElRef,
      setIsDrawerItemDragActive, setIsFolderDragActive, setIsIncompatibleComponentDrag]);

   const handleDragOver = useCallback((event: DragOverEvent) => {
      const { active, over } = event;

      // A tab drag reorders within the strip's SortableContext and never touches the
      // sheet zones, but it CAN save into the drawer, so light the drawer items-area
      // while it is held over the drawer (mirroring a sheet-item save), then bail out of
      // the sheet/zone logic below.
      if (active.data.current?.type === DRAG_TYPES.TAB) {
         // Light the items-BODY dropzone only when over it, not over a folder/Back (a
         // tab save INTO a folder still works via the dnd-kit `over` at drop).
         const overId = over?.id.toString();
         setIsOverDrawer(overId?.startsWith('drawer-drop-zone-') ?? false);
         // Over the board, a tab morphs to the "add to board" glyph (like a drawer character):
         // feed the board over-zone so updateContext derives 'add-to-board'; elsewhere it carries
         // no zone (reorder / drawer-save show no morph).
         overZoneRef.current = overId === 'board-drop-zone' ? 'board' : null;
         updateContext();
         return;
      }

      setOverDragId(over ? over.id.toString() : null);

      // Keep the "can't drop here" overlay honest against the LIVE active character: a spring-nav to a
      // different-game tab mid-drag changes whether the dragged component fits, so a flag frozen at pickup
      // would contradict the actual drop (which routes on the live compatibility). NEUTRAL is game-agnostic.
      if (dragKindRef.current === 'drawer-component') {
         const dragged = active.data.current?.item as DrawerItem | undefined;
         setIsIncompatibleComponentDrag(!!dragged && !!character && dragged.game !== 'NEUTRAL' && dragged.game !== character.game);
      }

      let isHoveringDrawer = false;
      // The actionable surface under the cursor. The drawer splits into its items
      // area (reorder/land) and its nav area (folders, folder slots, Back). The thin
      // tab strip is handled by the generous pointermove test, not here.
      let zone: DragOverZone = null;
      let highlight: 'cards' | 'trackers' | null = null;
      if (over) {
        const activeType = active.data.current?.type as string;
        const overId = over.id.toString();
        const overType = over.data.current?.type as string | undefined;
        // Light the drawer items-BODY dropzone only when the cursor is actually over it
        // (`drawer-drop-zone-<id>`), NOT over a folder/Back, those are their own targets,
        // and lighting the body while aiming at a folder is misleading. A save INTO a
        // folder still works via the dnd-kit `over` at drop (handleSheetToDrawerDrop).
        const overIsItemsBody = overId.startsWith('drawer-drop-zone-');

         if (activeType?.startsWith('sheet-') && overIsItemsBody) {
            isHoveringDrawer = true;
         }

         if (overId === 'main-character-drop-zone') {
            zone = 'play-area';
         } else if (overId === 'board-drop-zone') {
            zone = 'board';
         } else if (
            overId === 'character-sheet-main-drop-zone' || overId === 'tracker-drop-zone' || overId === 'card-drop-zone'
         ) {
            // Only the explicit sheet zones (resolved via pointerWithin when the cursor
            // is truly over them) count as 'sheet', NOT a closestCenter-snapped
            // sheet-card/tracker, which would mislabel neutral space.
            zone = 'sheet';
         } else if (overId.startsWith('drawer-drop-zone-') || overType === 'drawer-item') {
            zone = 'drawer-items';
         } else if (overType === 'drawer-folder' || overType === 'drawer-drop-zone' || overId.startsWith('drawer-back-button-')) {
            zone = 'drawer-nav';
         }

         // Content-aware sheet highlight: over the play area, only the section that
         // matches the dragged drawer item's type lights up (the drop is still
         // accepted anywhere on the sheet and routed by type). Game-incompatible
         // items neither highlight nor get an action glyph (no possible action).
         if (zone === 'sheet' && activeType === 'drawer-item' && character) {
            const item = active.data.current?.item as DrawerItem | undefined;
            // NEUTRAL items are game-agnostic, so they light the section on any sheet.
            const compatible = !!item && (item.game === 'NEUTRAL' || item.game === character.game);
            sheetCompatibleRef.current = compatible;
            if (compatible && item) highlight = sheetSectionForItemType(item.type);
         } else {
            sheetCompatibleRef.current = true;
         }
      } else {
         sheetCompatibleRef.current = true;
      }

      setIsOverDrawer(isHoveringDrawer);
      setSheetHighlight(highlight);
      // Only the NON-drawer zones come from dnd-kit's `over`; the in-drawer zones are
      // owned by the manual geometry target (set in handlePointerMove -> updateContext),
      // which is reliable full-row where dnd-kit's collision is center-only.
      overZoneRef.current = zone === 'play-area' || zone === 'sheet' || zone === 'board' ? zone : null;
      updateContext();
   }, [updateContext, character, overZoneRef, sheetCompatibleRef, setSheetHighlight, dragKindRef, setIsIncompatibleComponentDrag]);

   // ==================
   //  Drop actions: on-sheet reorders + drawer saves
   // ==================
   const { handleSheetLayoutReorder, handleSheetTrackerReorder } = useSheetReorderActions({
      character,
      reorderSheetLayout,
      reorderStatuses,
      reorderStoryTags,
      reorderStoryThemes,
   });
   const { handleSheetToDrawerDrop, saveTabToDrawer, saveBoardTabToDrawer, saveNoteTabToDrawer } = useDrawerSaveActions({ initiateItemDrop });

   // ==================
   //  Drop routing: the ordered handleDragEnd chain
   // ==================
   const handleDragEnd = useDragEndRouter({
      character,
      currentFolderView,
      activeDragItem,
      tNotifications,
      moveFolder,
      reorderFolders,
      moveItem,
      reorderItems,
      openCharacterTab,
      openBoardTab,
      openNoteTab,
      openPdfTab,
      reorderTabs,
      setActiveTab,
      setContextualGame,
      addImportedCard,
      addImportedTracker,
      addImportedJournal,
      handleSheetLayoutReorder,
      handleSheetTrackerReorder,
      handleSheetToDrawerDrop,
      saveTabToDrawer,
      saveBoardTabToDrawer,
      saveNoteTabToDrawer,
      readDragSnapshot,
      clearDragFeedback,
      contractDrawer,
      setDrawerReceded,
      setActiveDragItem,
      setIsOverDrawer,
      setOverDragId,
      setActiveTabDrag,
   });

   /**
    * Clears all transient drag state when a drag is cancelled (Escape, or a drop
    * outside any droppable). Mirrors the reset at the top of `handleDragEnd` so the
    * overlay (including a tab preview) never lingers after a cancelled drag.
    */
   const handleDragCancel = useCallback(() => {
      setActiveDragItem(null);
      setIsOverDrawer(false);
      setOverDragId(null);
      setActiveTabDrag(null);
      clearDragFeedback();
   }, [clearDragFeedback]);

   return {
      activeDragItem,
      activeTabDrag,
      overDragId,
      isOverDrawer,
      // Resolved full-row in-drawer drop target, driving the folder nest + items-area
      // highlights so they match the drop.
      drawerDropTarget,
      statusIds,
      storyTagIds,
      storyThemeIds,
      handleDragStart,
      handleDragOver,
      handleDragEnd,
      handleDragCancel,
      // Strip highlight: the generous tab-lane flag.
      isOverTabLane,
      // The active dwell target id (folder id or the Back sentinel), for the static
      // row/Back highlight.
      springTarget,
      // See-Workspace: whether to show the strip (a drawer-item drag) and which recede dwell is
      // in progress ('see-workspace' | 'reexpand' | null), for the strip/edge progress cue.
      isDrawerItemDragActive,
      workspaceDwellKey,
      // True while a folder is dragged, so the drawer surfaces show the reorder slots in any view.
      isFolderDragActive,
      // Content-aware sheet highlight: which section to light up.
      sheetHighlight,
      // True while a game-incompatible component is dragged with a character loaded,
      // driving the "can't drop here" overlay.
      isIncompatibleComponentDrag,
      // Drag-morph engine slots: clone goes inside <DragOverlay>, cluster is a sibling.
      renderClone,
      renderCluster,
   };
}
