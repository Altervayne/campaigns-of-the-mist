// -- Store Imports --
import { getActiveCharacterStore } from '@/lib/character/characterStoreRegistry';
import { getActiveBoardStore } from '@/lib/board/boardStoreRegistry';
import { getActivePdfStore } from '@/lib/pdf/pdfStoreRegistry';
import { useDrawerStore } from '@/lib/stores/drawerStore';
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';

// -- Drawer Engine Imports --
import { drawerCommandEngine } from '@/lib/drawer/drawerCommandEngine';

/*
 * Shared undo/redo routing for the whole app: the Ctrl/Cmd+Z / +Y shortcut and the palette both go
 * through these, so the target and precedence can't drift. Every read is fresh (nothing captured).
 *
 * Precedence: the drawer when it was the last store modified AND is open, else the active pdf, else the
 * active board, else the active character (still zundo-based). A pdf tab parks the board/character, so pdf
 * sits between the drawer (which still wins when it is the open, last-touched store) and the inert board
 * branch. Each target acts only when it has history; the drawer, board, and pdf go through their STORE
 * ACTIONS so the surface resyncs after the revert. No active target is a no-op.
 */

/** True when the drawer owns undo/redo: it was the last store touched and it is open. */
function drawerHasFocus(): boolean {
   const { lastModifiedStore, isDrawerOpen } = useAppGeneralStateStore.getState();
   return lastModifiedStore === 'drawer' && isDrawerOpen;
}

/** Whether the active context has an undo step available. */
export function canUndoActiveContext(): boolean {
   if (drawerHasFocus()) return drawerCommandEngine.canUndo();
   const pdfStore = getActivePdfStore();
   if (pdfStore) return pdfStore.getState().undoStack.length > 0;
   const boardStore = getActiveBoardStore();
   if (boardStore) return boardStore.getState().canUndo;
   const temporal = getActiveCharacterStore()?.temporal.getState();
   return (temporal?.pastStates.length ?? 0) > 1;
}

/** Whether the active context has a redo step available. */
export function canRedoActiveContext(): boolean {
   if (drawerHasFocus()) return drawerCommandEngine.canRedo();
   const pdfStore = getActivePdfStore();
   if (pdfStore) return pdfStore.getState().redoStack.length > 0;
   const boardStore = getActiveBoardStore();
   if (boardStore) return boardStore.getState().canRedo;
   const temporal = getActiveCharacterStore()?.temporal.getState();
   return (temporal?.futureStates.length ?? 0) > 0;
}

/** Undoes the active context (drawer / board / character), firing only when that target has history. */
export function undoActiveContext(): void {
   if (drawerHasFocus()) {
      if (drawerCommandEngine.canUndo()) void useDrawerStore.getState().actions.undoDrawer();
      return;
   }
   const pdfStore = getActivePdfStore();
   if (pdfStore) {
      const pdf = pdfStore.getState();
      if (pdf.undoStack.length > 0) pdf.actions.undo();
      return;
   }
   const boardStore = getActiveBoardStore();
   if (boardStore) {
      const board = boardStore.getState();
      if (board.canUndo) void board.actions.undo();
      return;
   }
   const temporal = getActiveCharacterStore()?.temporal.getState();
   if ((temporal?.pastStates.length ?? 0) > 1) temporal?.undo();
}

/** Redoes the active context (drawer / board / character), firing only when that target has a redo step. */
export function redoActiveContext(): void {
   if (drawerHasFocus()) {
      if (drawerCommandEngine.canRedo()) void useDrawerStore.getState().actions.redoDrawer();
      return;
   }
   const pdfStore = getActivePdfStore();
   if (pdfStore) {
      const pdf = pdfStore.getState();
      if (pdf.redoStack.length > 0) pdf.actions.redo();
      return;
   }
   const boardStore = getActiveBoardStore();
   if (boardStore) {
      const board = boardStore.getState();
      if (board.canRedo) void board.actions.redo();
      return;
   }
   const temporal = getActiveCharacterStore()?.temporal.getState();
   if ((temporal?.futureStates.length ?? 0) > 0) temporal?.redo();
}
