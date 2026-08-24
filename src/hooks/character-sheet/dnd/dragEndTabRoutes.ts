// -- Utils Imports --
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Store Imports --
import { useTabManagerStore } from '@/lib/character/tabManagerStore';
import { getOrCreateInstance } from '@/lib/character/characterStoreRegistry';
import { getActiveBoardStore } from '@/lib/board/boardStoreRegistry';

// -- Board Imports --
import { boardDropPlacement } from '@/lib/board/boardDropPlacement';
import { characterElementSpec } from '@/lib/board/embedDrawerItem';

// -- Type Imports --
import type { DragEndEvent } from '@dnd-kit/core';
import type { DragEndDeps, DragEndSnapshot, DragEndTarget } from '@/hooks/character-sheet/dnd/dragEndDeps';
import type { Character } from '@/lib/types/character';
import type { DrawerItem } from '@/lib/types/drawer';

/*
 * The two tab-lane routes: the generous release band, which runs BEFORE the `!over` guard, and the tab
 * drag itself once dnd-kit has resolved a target.
 */

// ##################################################
// ###   Generous tab lane (drawer character)     ###
// ##################################################
// A character released anywhere in the padded top band opens/focuses its tab,
// even when @dnd-kit's thin `tab-strip-drop-zone` was missed (so this runs
// BEFORE the `over` null-guard). The kind guard keeps it character-only.
export function routeGenerousTabLane(
   event: DragEndEvent,
   { wasOverTabLane, dragKind }: DragEndSnapshot,
   { openCharacterTab, setContextualGame, contractIfExpanded }: DragEndDeps,
): boolean {
   if (!wasOverTabLane || dragKind !== 'drawer-character') return false;

   const draggedItem = event.active.data.current?.item as DrawerItem | undefined;
   if (draggedItem?.type === 'FULL_CHARACTER_SHEET') {
      const characterData = draggedItem.content as Character;
      openCharacterTab(characterData, draggedItem.id); // append-or-focus
      setContextualGame(characterData.game);
      contractIfExpanded();
   }
   return true;
}

// ##########################################
// ###   BRANCH 0: Reordering tab strip   ###
// ##########################################
// A tab reorders against another tab, or saves to the drawer when dropped on a
// drawer target (collision detection scopes a tab drag to those two). Reorder
// persistence is the TabManager's; the save creates a new linked drawer copy.
export function routeTabDrag(
   event: DragEndEvent,
   { over, activeType, overType, overIdStr, dropPointer }: DragEndTarget,
   { reorderTabs, saveTabToDrawer, saveBoardTabToDrawer, saveNoteTabToDrawer }: DragEndDeps,
): boolean {
   if (activeType !== DRAG_TYPES.TAB) return false;

   const { active } = event;
   const tabId = (active.data.current?.tabId as string) ?? String(active.id);
   if (overType === DRAG_TYPES.TAB) {
      reorderTabs(String(active.id), String(over.id));
   } else if (overIdStr.startsWith('drawer-drop-zone-') || overType?.startsWith('drawer-')) {
      // Route the save by the tab's kind: a board/note tab saves its own aggregate, a character
      // tab its character. All three land a NEW linked drawer copy in the drop target's folder.
      const draggedTab = useTabManagerStore.getState().openTabs.find((openTab) => openTab.id === tabId);
      if (draggedTab?.type === 'board') void saveBoardTabToDrawer(tabId, overIdStr, overType, over);
      else if (draggedTab?.type === 'note') void saveNoteTabToDrawer(tabId, overIdStr, overType, over);
      else if (draggedTab?.type === 'pdf') { /* read-only: a pdf has no save-back, so dropping its tab on the drawer is a no-op */ }
      else saveTabToDrawer(tabId, overIdStr, overType, over);
   } else if (overIdStr === 'board-drop-zone') {
      // A tab dropped on the board adds a character element - saved or unsaved. The element keys
      // on the character id and reads live while the tab is open; a saved one also links its
      // drawer source for when the tab is closed.
      const boardStore = getActiveBoardStore();
      const character = getOrCreateInstance(tabId).getState().character;
      if (!boardStore) return true;
      const spec = characterElementSpec(character);
      if (!spec) return true;
      void boardStore.getState().actions.addItem({
         ...boardDropPlacement(boardStore, dropPointer, spec),
         kind: spec.kind,
         content: spec.content,
      });
   }
   return true;
}
