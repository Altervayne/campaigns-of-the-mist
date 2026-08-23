// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Utils Imports --
import { mapItemToStorableInfo } from '@/lib/utils/dnd';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Store Imports --
import { getActiveBoardStore } from '@/lib/board/boardStoreRegistry';

// -- Type Imports --
import type { DragEndEvent } from '@dnd-kit/core';
import type { DragEndDeps, DragEndSnapshot, DragEndTarget } from '@/hooks/character-sheet/dnd/dragEndDeps';
import type { Journal } from '@/lib/types/board';
import type { Card as CardData, Tracker } from '@/lib/types/character';

/*
 * The two sheet-sourced routes: the board geometry fallback, which runs BEFORE the `!over` guard, and
 * BRANCH 2 once dnd-kit has resolved a target.
 */

// ##################################################
// ###   Sheet -> board via mid-drag spring nav    ###
// ##################################################
// A sheet item dropped on the board after spring-navigating to the board tab MID-DRAG:
// BoardView's `board-drop-zone` droppable mounts during the drag, so dnd-kit never measures
// it and `over` is not `board-drop-zone` (often null), which would fall through to the reorder
// path below. Resolve it by real cursor geometry instead, matching how the drawer force-morph
// and nav-grace already trust the live pointer over dnd-kit's `over`. Guarded so it fires ONLY
// for a sheet drag with a live board tab and a real pointer inside the board canvas, so it can
// never hijack a sheet or drawer target. Runs BEFORE the `over` null-guard for the null case.
export function routeSheetToBoardFallback(
   _event: DragEndEvent,
   { dragKind, dropPointer }: DragEndSnapshot,
   { dropSheetItemOnBoard }: DragEndDeps,
): boolean {
   if (dragKind !== 'sheet-item' || !dropPointer || !getActiveBoardStore()) return false;

   const clip = document.querySelector('[data-board-clip]') as HTMLElement | null;
   const rect = clip?.getBoundingClientRect() ?? null;
   const overBoard = !!rect &&
      dropPointer.x >= rect.left && dropPointer.x <= rect.right &&
      dropPointer.y >= rect.top && dropPointer.y <= rect.bottom;
   if (overBoard) {
      dropSheetItemOnBoard();
      return true;
   }
   return false;
}

// #############################################
// ###   BRANCH 2: Dragging FROM the Sheet   ###
// #############################################
export function routeSheetDrag(
   event: DragEndEvent,
   { over, activeType, overType, overIdStr, dragSourceCharacterId }: DragEndTarget,
   {
      character, activeDragItem, tNotifications,
      addImportedCard, addImportedTracker, addImportedJournal,
      dropSheetItemOnBoard, handleSheetToDrawerDrop, handleSheetLayoutReorder, handleSheetTrackerReorder,
   }: DragEndDeps,
): boolean {
   const { active } = event;
   if (!activeType?.startsWith('sheet-')) return false;

   // A sheet JOURNAL (SHEET_JOURNAL) rides the SAME scenarios below as a card - board drop, drawer
   // save, cross-character import, reorder - each of which forks explicitly on the journal shape (its
   // bare aggregate has no cardType/trackerType). It saves a COPY and stays put, mirroring a card.

   // ==================
   //  SCENARIO 2.0a: Dropping a card/tracker/journal onto the board canvas
   // ==================
   // Mirrors the drawer's board drop (SCENARIO 1.0): a board is game-agnostic, so there is NO
   // game gate. The sheet component becomes a self-contained COPY (no `sourceDrawerItemId`, it is
   // not from the drawer); an image drops as a native image. The board zone only exists on a board
   // tab, so a sheet drag reaches it only when a board is active. The geometry fallback above
   // handles the mid-drag spring-nav case where this dnd-kit target is not yet measured.
   if (overIdStr === 'board-drop-zone') {
      dropSheetItemOnBoard();
      return true;
   }

   // ==================
   //  SCENARIO 2.0: Dropping on a DIFFERENT character's sheet (after tab auto-nav)
   // ==================
   // The sheet item came from another tab; import a copy into the now-active
   // character (game must match). A same-character drop falls through to reorder.
   const overIsSheetZone = overIdStr === 'character-sheet-main-drop-zone' ||
      overIdStr === 'card-drop-zone' || overIdStr === 'tracker-drop-zone' ||
      overType?.startsWith('sheet-');
   // The source character is read from the snapshot (captured before the teardown nulls its ref), so a
   // drop on a DIFFERENT character's sheet after a mid-drag spring-nav imports a copy instead of falling
   // through to a no-op reorder.
   if (
      character && activeDragItem && overIsSheetZone &&
      dragSourceCharacterId && dragSourceCharacterId !== character.id
   ) {
      const info = mapItemToStorableInfo(activeDragItem as CardData | Tracker | Journal);
      // NEUTRAL items are game-agnostic; every other component must match the sheet's game.
      if (info && (info[1] === 'NEUTRAL' || info[1] === character.game)) {
         if ('cardType' in activeDragItem) {
            const added = addImportedCard(activeDragItem as CardData);
            if (added) {
               toast.success(tNotifications('Notifications.character.componentImported'));
            } else {
               toast.error(tNotifications('Notifications.character.duplicatePortrait'));
            }
         } else if ('trackerType' in activeDragItem) {
            addImportedTracker(activeDragItem as Tracker);
            toast.success(tNotifications('Notifications.character.componentImported'));
         } else if ('pages' in activeDragItem) {
            // A bare journal (no cardType/trackerType): import a copy onto the now-active character.
            addImportedJournal(activeDragItem as Journal);
            toast.success(tNotifications('Notifications.character.componentImported'));
         }
      }
      return true;
   }

   // ==================
   //  SCENARIO 2.1: Dropping ONTO the drawer
   // ==================
   if (overIdStr.startsWith('drawer-drop-zone-') || overType?.startsWith('drawer-')) {
      handleSheetToDrawerDrop(activeDragItem, overIdStr, overType, over);
      return true;
   }

   // ==================
   //  SCENARIO 2.2: Reordering ON the sheet
   // ==================
   if (overType?.startsWith('sheet-') && character) {
      // Cards and journals share one manifest space: a card-or-journal reorder lands on any
      // card-or-journal target, resolved by id through reorderSheetLayout.
      const isLayoutDrag = activeType === DRAG_TYPES.SHEET_CARD || activeType === DRAG_TYPES.SHEET_JOURNAL;
      const overIsLayout = overType === DRAG_TYPES.SHEET_CARD || overType === DRAG_TYPES.SHEET_JOURNAL;
      if (isLayoutDrag && overIsLayout) {
         handleSheetLayoutReorder(active.id as string, over.id as string);
      } else if (activeType === DRAG_TYPES.SHEET_TRACKER) {
         handleSheetTrackerReorder(active, over);
      }
   }
   return false;
}
