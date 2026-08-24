// -- React Imports --
import { useCallback } from 'react';

// -- Local Imports --
import { routeDrawerDrag, routeManualDrawerDrop } from '@/hooks/character-sheet/dnd/dragEndDrawerRoutes';
import { routeSheetDrag, routeSheetToBoardFallback } from '@/hooks/character-sheet/dnd/dragEndSheetRoutes';
import { routeGenerousTabLane, routeTabDrag } from '@/hooks/character-sheet/dnd/dragEndTabRoutes';

// -- Store Imports --
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import { getActiveBoardStore } from '@/lib/board/boardStoreRegistry';

// -- Board Imports --
import { boardDropPlacement } from '@/lib/board/boardDropPlacement';
import { embeddedSpecForComponent } from '@/lib/board/embedDrawerItem';

// -- Type Imports --
import type { Dispatch, SetStateAction } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import type { DragEndDeps, DragEndSnapshot, DragEndTarget } from '@/hooks/character-sheet/dnd/dragEndDeps';
import type { OpenTab } from '@/lib/character/tabManagerStore';
import type { useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';
import type { Journal } from '@/lib/types/board';
import type { Card as CardData, Tracker } from '@/lib/types/character';

interface UseDragEndRouterArgs extends Omit<DragEndDeps, 'contractIfExpanded' | 'dropSheetItemOnBoard'> {
   /** Reads the drag-feedback refs as plain values; must run before `clearDragFeedback`. */
   readDragSnapshot: () => DragEndSnapshot;
   clearDragFeedback: () => void;
   contractDrawer: ReturnType<typeof useAppGeneralStateActions>['contractDrawer'];
   setDrawerReceded: ReturnType<typeof useAppGeneralStateActions>['setDrawerReceded'];
   setActiveDragItem: Dispatch<SetStateAction<DragEndDeps['activeDragItem']>>;
   setIsOverDrawer: Dispatch<SetStateAction<boolean>>;
   setOverDragId: Dispatch<SetStateAction<string | null>>;
   setActiveTabDrag: Dispatch<SetStateAction<OpenTab | null>>;
}

/*
 * The drop dispatch table. `handleDragEnd` snapshots the drag-feedback layer, builds the two closures the
 * routes share, tears the layer down, and then walks the routes in order - four of them BEFORE dnd-kit's
 * `over` is even consulted, because the drawer and board targets are resolved by live geometry. A route
 * returns true when it handled the drop, and the chain stops there: exactly one route ever writes.
 */
export function useDragEndRouter({
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
}: UseDragEndRouterArgs) {
   const handleDragEnd = useCallback((event: DragEndEvent) => {
      const { active, over } = event;

      // Read the feedback refs BEFORE tearing them down (clearDragFeedback resets them).
      const snapshot = readDragSnapshot();
      // Read the drawer's expand/recede state before clearDragFeedback tears it down: once an item lands
      // on the workspace, the Library's search/nav job is done, so leave the drawer as the reduced side
      // panel. If the drop came from the receded See-Workspace state, clearDragFeedback just un-receded it,
      // which would slide the Library back UP into view as the overlay contracts (a flash). Re-recede so it
      // stays off-screen through the exit - only the reduced side panel is seen opening; ExpandedDrawer
      // clears the flag when it unmounts. Only the successful workspace-drop branches call this; a no-op /
      // cancel leaves clearDragFeedback's un-recede in place, restoring the Library.
      const wasDrawerExpanded = useAppGeneralStateStore.getState().isDrawerExpanded;
      const wasDrawerReceded = useAppGeneralStateStore.getState().isDrawerReceded;
      const contractIfExpanded = () => {
         if (!wasDrawerExpanded) return;
         contractDrawer();
         if (wasDrawerReceded) setDrawerReceded(true);
      };

      // Embeds the dragged sheet component as a self-contained board copy at the drop point.
      // Shared by SCENARIO 2.0a's two entry paths: the dnd-kit `board-drop-zone` hit, and the
      // geometry fallback for a board tab reached by a mid-drag spring nav (see below).
      const dropSheetItemOnBoard = () => {
         const boardStore = getActiveBoardStore();
         if (!boardStore || !activeDragItem) return;
         // A card, tracker, OR journal: embeddedSpecForComponent forks on the shape (a bare Journal drops
         // as a board journal copy), so no separate journal branch is needed here.
         const spec = embeddedSpecForComponent(activeDragItem as CardData | Tracker | Journal);
         if (!spec) return;
         void boardStore.getState().actions.addItem({
            ...boardDropPlacement(boardStore, snapshot.dropPointer, spec),
            kind: spec.kind,
            content: spec.content,
         });
         contractIfExpanded();
      };

      const deps: DragEndDeps = {
         character, currentFolderView, activeDragItem, tNotifications,
         moveFolder, reorderFolders, moveItem, reorderItems,
         openCharacterTab, openBoardTab, openNoteTab, openPdfTab, reorderTabs, setActiveTab, setContextualGame,
         addImportedCard, addImportedTracker, addImportedJournal,
         handleSheetLayoutReorder, handleSheetTrackerReorder, handleSheetToDrawerDrop,
         saveTabToDrawer, saveBoardTabToDrawer, saveNoteTabToDrawer,
         contractIfExpanded, dropSheetItemOnBoard,
      };

      setActiveDragItem(null);
      setIsOverDrawer(false);
      setOverDragId(null);
      setActiveTabDrag(null);
      clearDragFeedback();

      // The four routes that run ahead of the `over` null-guard: the padded tab lane, the in-drawer
      // geometry target, and the board canvas, none of which dnd-kit resolves reliably.
      if (routeGenerousTabLane(event, snapshot, deps)) return;
      if (routeManualDrawerDrop(event, snapshot, deps)) return;
      if (routeSheetToBoardFallback(event, snapshot, deps)) return;

      if (!over || active.id === over.id) {
         return;
      }

      const target: DragEndTarget = {
         ...snapshot,
         over,
         activeType: active.data.current?.type as string,
         overType: over.data.current?.type as string,
         overIdStr: over.id.toString(),
      };

      if (routeTabDrag(event, target, deps)) return;
      if (routeDrawerDrag(event, target, deps)) return;
      routeSheetDrag(event, target, deps);
   }, [
      character,
      currentFolderView,
      moveFolder,
      reorderFolders,
      moveItem,
      reorderItems,
      handleSheetLayoutReorder,
      handleSheetTrackerReorder,
      handleSheetToDrawerDrop,
      saveTabToDrawer,
      saveBoardTabToDrawer,
      saveNoteTabToDrawer,
      openCharacterTab,
      openBoardTab,
      openNoteTab,
      openPdfTab,
      reorderTabs,
      setActiveTab,
      setContextualGame,
      addImportedTracker,
      addImportedCard,
      addImportedJournal,
      tNotifications,
      clearDragFeedback,
      contractDrawer,
      setDrawerReceded,
      activeDragItem,
      readDragSnapshot,
      setActiveDragItem,
      setIsOverDrawer,
      setOverDragId,
      setActiveTabDrag,
   ]);

   return handleDragEnd;
}
