// -- Next Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';
import cuid from 'cuid';

// -- Utils Imports --
import { getDrawerItemDisplayPath } from '@/lib/drawer/drawerItemPath';
import { saveCharacterToLinkedDrawerItem } from '@/lib/character/characterRepository';
import { getActiveBoardStore } from '@/lib/board/boardStoreRegistry';
import { getActiveNoteStore } from '@/lib/notes/noteStoreRegistry';
import { getActivePdfStore } from '@/lib/pdf/pdfStoreRegistry';
import { stampNoteReferencesDrawerSource } from '@/lib/board/refreezeNoteReferences';
import { forkBoardToDrawerItem, forkCharacterToDrawerItem, forkNoteToDrawerItem } from '@/lib/saveAs/forkToDrawer';

// -- Store and Hook Imports --
import { useCharacterActions, useCharacterStore } from '@/lib/stores/characterStore';
import { useDrawerActions, useDrawerStore } from '@/lib/stores/drawerStore';
import { useAppGeneralStateStore, useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';

/*
 * Save-to-drawer for the active character / board / note, shared by the sidebar Save buttons and the command
 * palette so the two entry points can't drift. Each kind has a Save (linked atomic save) and a Save-As. Save-As
 * branches on link state: an ALREADY-LINKED entity FORKS (re-id to a fresh identity, the working tab adopts the
 * new copy, the original drawer item + its references are left untouched); an UNLINKED first save keeps its id
 * and links one fresh drawer item. A linked-but-deleted item (dangling link) is NOT a fork - it keeps its
 * identity and links a fresh item (a fork there would strand references resolving via the working record). The
 * drawer-open + naming-window hand-off is self-sourced here.
 */
export function useSaveToDrawer() {
   const { t: tNotifications } = useTranslation();

   const character = useCharacterStore((state) => state.character);
   const drawerCurrentFolderId = useDrawerStore((state) => state.currentFolderId);
   const { loadCharacter, setHasUnsavedChanges } = useCharacterActions();
   const { initiateItemDrop, reloadCurrentFolder } = useDrawerActions();
   const isDrawerOpen = useAppGeneralStateStore((state) => state.isDrawerOpen);
   const { setDrawerOpen } = useAppGeneralStateActions();

   const saveCharacterToDrawer = async () => {
      if (!character) return;

      if (character.drawerItemId) {
         const savedItemId = character.drawerItemId;
         try {
            // Atomic cross-store save: working record + the linked drawer item in one
            // transaction.
            const { linkedItemUpdated } = await saveCharacterToLinkedDrawerItem(character);
            if (linkedItemUpdated) {
               // The working record now matches its drawer copy.
               setHasUnsavedChanges(false);
               await reloadCurrentFolder();
               const itemPath = await getDrawerItemDisplayPath(savedItemId);
               toast.success(`${tNotifications('Notifications.character.saved')} ${itemPath}`);
            } else {
               // The linked drawer item was DELETED (dangling link): there is no original to preserve, so
               // keep this tab's identity and link a fresh drawer item - a fork here would strand any
               // reference that resolves this character via its (about-to-be-reaped) working record.
               firstSaveCharacterAs(cuid());
               toast(tNotifications('Notifications.character.linkedItemMissing'));
            }
         } catch {
            toast.error(tNotifications('Notifications.drawer.actionFailed'));
         }
      } else {
         firstSaveCharacterAs(cuid());
      }
   };

   /** First-save / dangling-link path: keep the character's id, link it to a fresh drawer item (existing behavior). */
   const firstSaveCharacterAs = (newItemId: string) => {
      if (!character) return;
      const characterWithDrawerId = { ...character, drawerItemId: newItemId };

      loadCharacter(character, newItemId);
      // loadCharacter sets the flag clean, but the change subscription fires on the new
      // character reference and re-dirties it; assert clean once more after.
      setHasUnsavedChanges(false);

      if (!isDrawerOpen) {
         setDrawerOpen(true);
      }

      initiateItemDrop({
         game: character.game,
         type: 'FULL_CHARACTER_SHEET',
         content: characterWithDrawerId,
         defaultName: character.name,
         presetId: newItemId,
         parentFolderId: drawerCurrentFolderId ?? undefined,
      });
   };

   const saveCharacterAsToDrawer = async () => {
      if (!character) return;
      const newItemId = cuid();

      if (character.drawerItemId) {
         // Linked -> FORK: re-id to a fresh identity, the working tab adopts the new copy, and the
         // original drawer item is left untouched. The tab now carries the new id, so the next plain
         // Save writes the fork (not the source), closing the re-stamp trap.
         const forked = await forkCharacterToDrawerItem(newItemId);
         if (!forked) return;
         if (!isDrawerOpen) {
            setDrawerOpen(true);
         }
         initiateItemDrop({
            game: forked.game,
            type: 'FULL_CHARACTER_SHEET',
            content: forked,
            defaultName: forked.name,
            presetId: newItemId,
            parentFolderId: drawerCurrentFolderId ?? undefined,
         });
         return;
      }

      // Unlinked first save: keep the id, link one drawer item (existing behavior).
      firstSaveCharacterAs(newItemId);
   };

   const saveBoardToDrawer = async () => {
      const store = getActiveBoardStore();
      if (!store) return;
      const { boardId, drawerItemId } = store.getState();
      if (!boardId) return;

      if (drawerItemId) {
         try {
            // Atomic cross-store save of the linked drawer copy, mirroring the character.
            const result = await store.getState().actions.saveToDrawer();
            if (result?.linkedItemUpdated) {
               await reloadCurrentFolder();
               const itemPath = await getDrawerItemDisplayPath(drawerItemId);
               toast.success(`${tNotifications('Notifications.board.saved')} ${itemPath}`);
            } else {
               // Dangling link: keep this board's identity + link a fresh drawer item (see the character note).
               await firstSaveBoardAs(cuid());
               toast(tNotifications('Notifications.board.linkedItemMissing'));
            }
         } catch {
            toast.error(tNotifications('Notifications.drawer.actionFailed'));
         }
      } else {
         await saveBoardAsToDrawer();
      }
   };

   /** First-save / dangling-link path: keep the board's id, link it to a fresh drawer item (existing behavior). */
   const firstSaveBoardAs = async (newItemId: string) => {
      const store = getActiveBoardStore();
      if (!store) return;
      const { boardId, name } = store.getState();
      if (!boardId) return;

      // Link the working board to a new drawer item id (also flushes the live viewport
      // and marks the board clean); the returned aggregate seeds the drawer item content.
      const aggregate = await store.getState().actions.linkToDrawerItem(newItemId);
      if (!aggregate) return;

      if (!isDrawerOpen) {
         setDrawerOpen(true);
      }

      // A board is game-agnostic -> a NEUTRAL drawer item; the naming window finalizes it.
      initiateItemDrop({
         game: 'NEUTRAL',
         type: 'FULL_BOARD',
         content: aggregate,
         defaultName: name,
         presetId: newItemId,
         parentFolderId: drawerCurrentFolderId ?? undefined,
      });
   };

   const saveBoardAsToDrawer = async () => {
      const store = getActiveBoardStore();
      if (!store) return;
      const { boardId, name, drawerItemId } = store.getState();
      if (!boardId) return;
      const newItemId = cuid();

      if (drawerItemId) {
         // Linked -> FORK: fresh board identity (new board id + item ids), the tab adopts it, the original
         // drawer item is untouched.
         const forked = await forkBoardToDrawerItem(newItemId);
         if (!forked) return;
         if (!isDrawerOpen) {
            setDrawerOpen(true);
         }
         initiateItemDrop({
            game: 'NEUTRAL',
            type: 'FULL_BOARD',
            content: forked,
            defaultName: name,
            presetId: newItemId,
            parentFolderId: drawerCurrentFolderId ?? undefined,
         });
         return;
      }

      // Unlinked first save: keep the id, link one drawer item (existing behavior).
      await firstSaveBoardAs(newItemId);
   };

   const saveNoteToDrawer = async () => {
      const store = getActiveNoteStore();
      if (!store) return;
      const { noteId, drawerItemId } = store.getState();
      if (!noteId) return;

      if (drawerItemId) {
         try {
            // Atomic cross-store save of the linked drawer copy, mirroring the board.
            const result = await store.getState().actions.saveToDrawer();
            if (result?.linkedItemUpdated) {
               // Keep any board tile referencing this note pointed at its drawer item (self-healing; a
               // first save stamps it, a re-save is a no-op).
               await stampNoteReferencesDrawerSource(noteId, drawerItemId);
               await reloadCurrentFolder();
               const itemPath = await getDrawerItemDisplayPath(drawerItemId);
               toast.success(`${tNotifications('Notifications.note.saved')} ${itemPath}`);
            } else {
               // Dangling link: keep this note's identity + link a fresh drawer item (see the character note).
               await firstSaveNoteAs(cuid());
               toast(tNotifications('Notifications.note.linkedItemMissing'));
            }
         } catch {
            toast.error(tNotifications('Notifications.drawer.actionFailed'));
         }
      } else {
         await saveNoteAsToDrawer();
      }
   };

   /** First-save / dangling-link path: keep the note's id, link it to a fresh drawer item, and stamp references (existing behavior). */
   const firstSaveNoteAs = async (newItemId: string) => {
      const store = getActiveNoteStore();
      if (!store) return;
      const { noteId, note } = store.getState();
      if (!noteId || !note) return;

      // Link the working note to a new drawer item id (also flushes the live document
      // and marks the note clean); the returned aggregate seeds the drawer item content.
      const aggregate = await store.getState().actions.linkToDrawerItem(newItemId);
      if (!aggregate) return;

      // Point any board tile referencing this (once tab-only) note at the new drawer item, so the reference
      // survives the save as a live drawer-backed reference (the note id is preserved, so no re-key needed).
      // Runs regardless of which tab is active - the Save is fired from the note tab, so the board tile's own
      // render effect can't do this.
      await stampNoteReferencesDrawerSource(noteId, newItemId);

      if (!isDrawerOpen) {
         setDrawerOpen(true);
      }

      // A note is game-agnostic -> a NEUTRAL drawer item; the naming window finalizes it.
      initiateItemDrop({
         game: 'NEUTRAL',
         type: 'NOTE',
         content: aggregate,
         defaultName: note.title,
         presetId: newItemId,
         parentFolderId: drawerCurrentFolderId ?? undefined,
      });
   };

   const saveNoteAsToDrawer = async () => {
      const store = getActiveNoteStore();
      if (!store) return;
      const { noteId, note, drawerItemId } = store.getState();
      if (!noteId || !note) return;
      const newItemId = cuid();

      if (drawerItemId) {
         // Linked -> FORK: fresh note identity, the tab adopts it. References STAY on the original (we do
         // NOT stamp board tiles to the fork), so a tile pointing at the source keeps resolving the source.
         const forked = await forkNoteToDrawerItem(newItemId);
         if (!forked) return;
         if (!isDrawerOpen) {
            setDrawerOpen(true);
         }
         initiateItemDrop({
            game: 'NEUTRAL',
            type: 'NOTE',
            content: forked,
            defaultName: forked.title,
            presetId: newItemId,
            parentFolderId: drawerCurrentFolderId ?? undefined,
         });
         return;
      }

      // Unlinked first save: keep the id, link one drawer item, stamp references (existing behavior).
      await firstSaveNoteAs(newItemId);
   };

   const savePdfToDrawer = async () => {
      const store = getActivePdfStore();
      if (!store) return;
      const { pdfId, drawerItemId } = store.getState();
      if (!pdfId) return;

      if (drawerItemId) {
         try {
            // Plain-save the linked drawer copy; annotations already autosave, so this flushes intent.
            const result = await store.getState().actions.saveToDrawer();
            if (result?.linkedItemUpdated) {
               await reloadCurrentFolder();
               const itemPath = await getDrawerItemDisplayPath(drawerItemId);
               toast.success(`${tNotifications('Notifications.pdf.saved')} ${itemPath}`);
            } else {
               // Dangling link: keep this pdf's identity + link a fresh drawer item (see the character note).
               await firstSavePdfAs(cuid());
               toast(tNotifications('Notifications.pdf.linkedItemMissing'));
            }
         } catch {
            toast.error(tNotifications('Notifications.drawer.actionFailed'));
         }
      } else {
         await firstSavePdfAs(cuid());
      }
   };

   /** First-save / dangling-link path: keep the pdf's id, link it to a fresh drawer item. A PDF is read-only, so there is no fork. */
   const firstSavePdfAs = async (newItemId: string) => {
      const store = getActivePdfStore();
      if (!store) return;
      const { pdfId, doc } = store.getState();
      if (!pdfId || !doc) return;

      // Link the working pdf to a new drawer item id (also flushes annotations + reading position);
      // the returned aggregate seeds the drawer item content.
      const aggregate = await store.getState().actions.linkToDrawerItem(newItemId);
      if (!aggregate) return;

      if (!isDrawerOpen) {
         setDrawerOpen(true);
      }

      // A PDF is game-agnostic -> a NEUTRAL drawer item; the naming window finalizes it.
      initiateItemDrop({
         game: 'NEUTRAL',
         type: 'PDF',
         content: aggregate,
         defaultName: doc.title,
         presetId: newItemId,
         parentFolderId: drawerCurrentFolderId ?? undefined,
      });
   };

   return { saveCharacterToDrawer, saveCharacterAsToDrawer, saveBoardToDrawer, saveBoardAsToDrawer, saveNoteToDrawer, saveNoteAsToDrawer, savePdfToDrawer };
}
