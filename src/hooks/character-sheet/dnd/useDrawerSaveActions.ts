// -- React Imports --
import { useCallback } from 'react';

// -- Other Library Imports --
import cuid from 'cuid';

// -- Utils Imports --
import { mapItemToStorableInfo } from '@/lib/utils/dnd';

// -- Local Imports --
import { drawerDropFolderId } from '@/hooks/character-sheet/dnd/dragClassification';

// -- Store Imports --
import { getOrCreateInstance } from '@/lib/character/characterStoreRegistry';
import { getOrCreateBoardInstance } from '@/lib/board/boardStoreRegistry';
import { getOrCreateNoteInstance } from '@/lib/notes/noteStoreRegistry';

// -- Board Imports --
import { stampNoteReferencesDrawerSource } from '@/lib/board/refreezeNoteReferences';

// -- Type Imports --
import type { DragOverEvent } from '@dnd-kit/core';
import type { DrawerState } from '@/lib/stores/drawerStore';
import type { Journal } from '@/lib/types/board';
import type { Card as CardData, Tracker } from '@/lib/types/character';
import type { ActiveDragItem } from '@/lib/utils/dnd';

interface UseDrawerSaveActionsArgs {
   initiateItemDrop: DrawerState['actions']['initiateItemDrop'];
}

/*
 * The four drops that write INTO the drawer: a sheet card/tracker/journal saved back, and the character /
 * board / note tab saves. All four mint a new drawer item through `initiateItemDrop` and resolve their
 * destination through `drawerDropFolderId`, so every path reads the drop target identically.
 */
export function useDrawerSaveActions({ initiateItemDrop }: UseDrawerSaveActionsArgs) {
   /**
    * Handle dropping sheet items (cards/trackers) back into the drawer
    */
   const handleSheetToDrawerDrop = useCallback((
      activeDragItem: ActiveDragItem,
      overIdStr: string,
      overType: string,
      over: NonNullable<DragOverEvent['over']>
   ) => {
      if (!activeDragItem) return;

      const destinationFolderId = drawerDropFolderId(overIdStr, overType, over);

      // A card, tracker, OR journal: mapItemToStorableInfo forks on the shape (a journal → ['JOURNAL','NEUTRAL']).
      const storableInfo = mapItemToStorableInfo(activeDragItem as CardData | Tracker | Journal);
      if (!storableInfo) return;
      const [generalType, gameSystem] = storableInfo;

      const itemContentCopy = JSON.parse(JSON.stringify(activeDragItem));
      if ('isFlipped' in itemContentCopy) itemContentCopy.isFlipped = false;

      // A journal names by its `title` (else the first line of its first page), a card by `title`, a tracker
      // by `name` - each aggregate names off its own content (mirrors the board save-back). The journal is
      // discriminated first (by `pages`) because it also carries a `title`.
      const rawName = 'pages' in activeDragItem ? (activeDragItem.title.trim() ? activeDragItem.title : (activeDragItem.pages[0]?.text ?? '').split('\n')[0]) :
                     'title' in activeDragItem ? activeDragItem.title :
                     'name' in activeDragItem ? activeDragItem.name : '';
      // Keep the drawer item from landing blank when the content has no name (a portrait can be cleared
      // to an empty title; a fresh journal has no page text).
      const fallbackName = generalType === 'IMAGE_CARD' ? 'Portrait' : 'New Item';
      const defaultName = rawName?.trim() ? rawName : fallbackName;

      initiateItemDrop({
         game: gameSystem,
         type: generalType,
         content: itemContentCopy,
         parentFolderId: destinationFolderId,
         defaultName
      });
   }, [initiateItemDrop]);

   /**
    * Save a dragged tab's character to the drawer as a NEW linked copy - never
    * overwrites an existing item. The character is resolved from its OWN instance by
    * id, so dragging a background tab saves the right character, not the active one.
    * The destination folder is derived from the drop target exactly as
    * {@link handleSheetToDrawerDrop} does, and the live character is linked to the new
    * item id WITHOUT clearing that tab's undo stack (`linkToDrawerItem`).
    *
    * @param tabId - The dragged tab's character id (its store instance key).
    * @param overIdStr - The drop target's id.
    * @param overType - The drop target's `data.current.type`.
    * @param over - The drop target (for a back-button's `destinationId`).
    */
   const saveTabToDrawer = useCallback((
      tabId: string,
      overIdStr: string,
      overType: string,
      over: NonNullable<DragOverEvent['over']>,
   ) => {
      const instance = getOrCreateInstance(tabId);
      const tabCharacter = instance.getState().character;
      if (!tabCharacter) return;

      const newItemId = cuid();
      instance.getState().actions.linkToDrawerItem(newItemId);
      // The tab now has a saved drawer copy. linkToDrawerItem swaps in a new character
      // reference, so the change subscription re-dirties it; assert clean after.
      instance.getState().actions.setHasUnsavedChanges(false);
      initiateItemDrop({
         game: tabCharacter.game,
         type: 'FULL_CHARACTER_SHEET',
         content: { ...tabCharacter, drawerItemId: newItemId },
         parentFolderId: drawerDropFolderId(overIdStr, overType, over),
         presetId: newItemId,
         defaultName: tabCharacter.name,
      });
   }, [initiateItemDrop]);

   /**
    * Board counterpart of {@link saveTabToDrawer}: saves a dragged BOARD tab's board to the drawer as a
    * NEW linked copy. The board is resolved from its OWN instance by id (so a background board tab saves
    * the right board), `linkToDrawerItem` flushes the live viewport + marks it clean + returns the
    * aggregate, and the item lands NEUTRAL/`FULL_BOARD` in the drop target's folder.
    */
   const saveBoardTabToDrawer = useCallback(async (
      tabId: string,
      overIdStr: string,
      overType: string,
      over: NonNullable<DragOverEvent['over']>,
   ) => {
      const instance = getOrCreateBoardInstance(tabId);
      const { boardId, name } = instance.getState();
      if (!boardId) return;

      const newItemId = cuid();
      const aggregate = await instance.getState().actions.linkToDrawerItem(newItemId);
      if (!aggregate) return;

      initiateItemDrop({
         game: 'NEUTRAL',
         type: 'FULL_BOARD',
         content: aggregate,
         parentFolderId: drawerDropFolderId(overIdStr, overType, over),
         presetId: newItemId,
         defaultName: name,
      });
   }, [initiateItemDrop]);

   /**
    * Note counterpart of {@link saveTabToDrawer}: saves a dragged NOTE tab's note to the drawer as a NEW
    * linked copy. Resolved by id from its OWN instance; `linkToDrawerItem` flushes the live document,
    * marks it clean, and returns the aggregate. Any board tile referencing this once-tab-only note is
    * stamped with the new drawer source so the reference survives the save as a live drawer-backed one.
    */
   const saveNoteTabToDrawer = useCallback(async (
      tabId: string,
      overIdStr: string,
      overType: string,
      over: NonNullable<DragOverEvent['over']>,
   ) => {
      const instance = getOrCreateNoteInstance(tabId);
      const { noteId, note } = instance.getState();
      if (!noteId || !note) return;

      const newItemId = cuid();
      const aggregate = await instance.getState().actions.linkToDrawerItem(newItemId);
      if (!aggregate) return;

      await stampNoteReferencesDrawerSource(noteId, newItemId);

      initiateItemDrop({
         game: 'NEUTRAL',
         type: 'NOTE',
         content: aggregate,
         parentFolderId: drawerDropFolderId(overIdStr, overType, over),
         presetId: newItemId,
         defaultName: note.title,
      });
   }, [initiateItemDrop]);

   return { handleSheetToDrawerDrop, saveTabToDrawer, saveBoardTabToDrawer, saveNoteTabToDrawer };
}
