// -- React Imports --
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Utils Imports --
import { exportCharacterSheet, exportToFile, generateExportFilename, importFromFile, readFileAsText } from '@/lib/utils/export-import';
import { noteFromMarkdown } from '@/lib/notes/noteMarkdownFile';
import { harmonizeData } from '@/lib/harmonization';
import { getActiveBoardStore } from '@/lib/board/boardStoreRegistry';
import { importBoard, loadBoard } from '@/lib/board/boardRepository';
import { collectBoardEmbeddedEntities } from '@/lib/board/collectBoardEmbeddedEntities';
import { prepareImportedBoard } from '@/lib/board/importBoardReferencedCharacters';
import { getActiveNoteStore } from '@/lib/notes/noteStoreRegistry';
import { importNote, loadNote } from '@/lib/notes/noteRepository';
import { reIdNote } from '@/lib/notes/reIdNote';
import { reIdCharacterAggregate } from '@/lib/character/reIdCharacterAggregate';

// -- Store and Hook Imports --
import { useCharacterActions, useCharacterStore } from '@/lib/stores/characterStore';
import { useTabManagerActions } from '@/lib/character/tabManagerStore';
import { useDrawerActions } from '@/lib/stores/drawerStore';

// -- Type Imports --
import type { Character, Card as CardData, Tracker } from '@/lib/types/character';
import type { Board, Note } from '@/lib/types/board';

interface UseSidebarFileIOArgs {
   onImportNoteMarkdownFile: (file: File) => Promise<void>;
}

// The workspace file-I/O engine: the hidden file inputs, every export/import/update-pick handler, and the
// update-in-place confirms. The refs pair with the hidden forms rendered by the sidebar; the trigger buttons
// `.click()` an input and each handler `.reset()`s its form so re-picking the same file re-fires onChange.
export function useSidebarFileIO({ onImportNoteMarkdownFile }: UseSidebarFileIOArgs) {
   const { t } = useTranslation();
   const { t: tNotifications } = useTranslation();

   const character = useCharacterStore((state) => state.character);
   // `loadCharacter` here replaces the CURRENT active character in place (update-from-file keeps its
   // drawerItemId), not a tab open, so it stays a per-character action. Opening a *different* character
   // (file import) and returning to the menu go through the TabManager.
   const { loadCharacter, addImportedCard, addImportedTracker, setHasUnsavedChanges } = useCharacterActions();
   const { openCharacterTab, openBoardTab, openNoteTab } = useTabManagerActions();
   const { reloadCurrentFolder } = useDrawerActions();

   const characterImportInputRef = useRef<HTMLInputElement>(null);
   const characterFormRef = useRef<HTMLFormElement>(null);
   const componentImportInputRef = useRef<HTMLInputElement>(null);
   const componentFormRef = useRef<HTMLFormElement>(null);
   const boardImportInputRef = useRef<HTMLInputElement>(null);
   const boardFormRef = useRef<HTMLFormElement>(null);
   const characterUpdateInputRef = useRef<HTMLInputElement>(null);
   const characterUpdateFormRef = useRef<HTMLFormElement>(null);
   const boardUpdateInputRef = useRef<HTMLInputElement>(null);
   const boardUpdateFormRef = useRef<HTMLFormElement>(null);
   const noteImportInputRef = useRef<HTMLInputElement>(null);
   const noteFormRef = useRef<HTMLFormElement>(null);
   const noteUpdateInputRef = useRef<HTMLInputElement>(null);
   const noteUpdateFormRef = useRef<HTMLFormElement>(null);
   const workspaceImportInputRef = useRef<HTMLInputElement>(null);
   const workspaceFormRef = useRef<HTMLFormElement>(null);

   const handleExportCharacter = async () => {
      if (!character) return;
      try {
         await exportCharacterSheet(character);
         toast.success(tNotifications('Notifications.character.exported'));
      } catch {
         toast.error(tNotifications('Notifications.general.exportError'));
      }
   };

   // One import for any workspace file: sniff the fileType (a plain .md becomes a note) and route it to the
   // matching path. Folds the separate character / board / note imports into a single "from file" entry.
   const handleWorkspaceFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // A plain markdown file imports as a portable-text note (which owns its own toasts).
      const name = file.name.toLowerCase();
      if (name.endsWith('.md') || name.endsWith('.markdown')) {
         await onImportNoteMarkdownFile(file);
         workspaceFormRef.current?.reset();
         return;
      }

      try {
         const importedData = await importFromFile(file);
         switch (importedData.fileType) {
            case 'FULL_CHARACTER_SHEET': {
               // An import is a fresh entity: re-id so it can't collide with an open tab or overwrite an
               // existing working row (that is the "update from file" path). The aggregate re-id keeps the
               // card/journal order and journal bookmarks intact.
               const newCharacter = reIdCharacterAggregate(harmonizeData(importedData.content, importedData.fileType) as Character);
               openCharacterTab(newCharacter);
               toast.success(tNotifications('Notifications.character.imported'));
               break;
            }
            case 'FULL_BOARD': {
               const migratedContent = harmonizeData(importedData.content, importedData.fileType) as Board;
               const prepared = await prepareImportedBoard(
                  migratedContent,
                  importedData.embedded,
                  t('Drawer.importedFromBoardFolder', { board: migratedContent.name }),
               );
               await importBoard(prepared);
               await reloadCurrentFolder();
               await openBoardTab(prepared.id);
               toast.success(tNotifications('Notifications.board.imported'));
               break;
            }
            case 'NOTE': {
               // A fresh import re-ids, so it can't collide with an open note tab or overwrite an existing row.
               const note = reIdNote(importedData.content as Note);
               await importNote(note, null);
               await openNoteTab(note.id);
               toast.success(tNotifications('Notifications.note.imported'));
               break;
            }
            default:
               toast.error(tNotifications('Notifications.general.importFailed'));
         }
      } catch (error) {
         console.error('Failed to import workspace file:', error);
         toast.error(tNotifications('Notifications.general.importFailed'));
      }

      workspaceFormRef.current?.reset();
   };

   const handleCharacterFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
         const importedData = await importFromFile(file);
         const migratedContent = harmonizeData(importedData.content, importedData.fileType);

         if (importedData.fileType === 'FULL_CHARACTER_SHEET') {
            // A fresh import re-ids (order + journal bookmarks preserved); "update from file" is the replace path.
            const newCharacter = reIdCharacterAggregate(migratedContent as Character);
            openCharacterTab(newCharacter);
            toast.success(tNotifications('Notifications.character.imported'));
         } else {
            toast.error(tNotifications('Notifications.general.importFailed'));
         }
      } catch (error) {
         console.error("Failed to import character file:", error);
         toast.error(tNotifications('Notifications.general.importFailed'));
      }

      characterFormRef.current?.reset();
   };

   const handleExportBoard = async () => {
      const store = getActiveBoardStore();
      if (!store) return;
      const { boardId } = store.getState();
      if (!boardId) return;
      try {
         // Serialize from the repo (items persist optimistically); the generic export
         // embeds any board image / card-copy art via collectFromBoard.
         const aggregate = await loadBoard(boardId);
         if (!aggregate) return;
         // Embed the full data of every character AND note the board's tiles reference, so those live
         // references survive on another machine (their portraits / covers / inline images ride the assets map).
         const embedded = await collectBoardEmbeddedEntities(aggregate);
         await exportToFile(aggregate, 'FULL_BOARD', 'NEUTRAL', generateExportFilename('NEUTRAL', 'FULL_BOARD', aggregate.name), embedded);
         toast.success(tNotifications('Notifications.board.exported'));
      } catch {
         toast.error(tNotifications('Notifications.general.exportError'));
      }
   };

   const handleBoardFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
         const importedData = await importFromFile(file);
         if (importedData.fileType === 'FULL_BOARD') {
            const migratedContent = harmonizeData(importedData.content, importedData.fileType) as Board;
            // Rehydrate the board's referenced characters (link existing / recreate absent, ids kept),
            // re-id for a fresh independent copy, then rewire the elements to the local characters.
            const prepared = await prepareImportedBoard(
               migratedContent,
               importedData.embedded,
               t('Drawer.importedFromBoardFolder', { board: migratedContent.name }),
            );
            await importBoard(prepared);
            // The import may have written an "Imported from {board}" folder straight to the DB;
            // re-read the current view so it shows without an app reload (a no-op on a pure link).
            await reloadCurrentFolder();
            await openBoardTab(prepared.id);
            toast.success(tNotifications('Notifications.board.imported'));
         } else {
            toast.error(tNotifications('Notifications.general.importFailed'));
         }
      } catch (error) {
         console.error("Failed to import board file:", error);
         toast.error(tNotifications('Notifications.general.importFailed'));
      }

      boardFormRef.current?.reset();
   };

   const handleExportNote = async () => {
      const store = getActiveNoteStore();
      if (!store) return;
      const { noteId } = store.getState();
      if (!noteId) return;
      try {
         // Serialize from the repo (the note store debounce-saves onto its row). A note is a flat
         // document with no asset references yet, so the generic export needs no embed.
         const aggregate = await loadNote(noteId);
         if (!aggregate) return;
         await exportToFile(aggregate, 'NOTE', 'NEUTRAL', generateExportFilename('NEUTRAL', 'NOTE', aggregate.title));
         toast.success(tNotifications('Notifications.note.exported'));
      } catch {
         toast.error(tNotifications('Notifications.general.exportError'));
      }
   };

   const handleNoteFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Route by extension: a plain markdown file imports as portable text, everything else as the
      // full-fidelity `.cotm` envelope. The markdown branch owns its own toasts.
      const name = file.name.toLowerCase();
      if (name.endsWith('.md') || name.endsWith('.markdown')) {
         await onImportNoteMarkdownFile(file);
         noteFormRef.current?.reset();
         return;
      }

      try {
         const importedData = await importFromFile(file);
         if (importedData.fileType === 'NOTE') {
            // A note is 2.0-native (no harmonize step); re-id it (a fresh import is a fresh entity, never a
            // replace-by-id), materialize it into the working table (unlinked, so a first save routes to
            // Save-As), then open its tab by id.
            const note = reIdNote(importedData.content as Note);
            await importNote(note, null);
            await openNoteTab(note.id);
            toast.success(tNotifications('Notifications.note.imported'));
         } else {
            toast.error(tNotifications('Notifications.general.importFailed'));
         }
      } catch (error) {
         console.error("Failed to import note file:", error);
         toast.error(tNotifications('Notifications.general.importFailed'));
      }

      noteFormRef.current?.reset();
   };

   const handleComponentFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
         const importedData = await importFromFile(file);
         const migratedContent = harmonizeData(importedData.content, importedData.fileType);
         const { fileType } = importedData;

         const isCardType = fileType === 'CHARACTER_CARD' || fileType === 'CHARACTER_THEME' || fileType === 'GROUP_THEME' || fileType === 'IMAGE_CARD';
         const isTrackerType = fileType === 'STATUS_TRACKER' || fileType === 'STORY_TAG_TRACKER';

         if (isCardType) {
            const added = addImportedCard(migratedContent as CardData);
            if (added) {
               toast.success(tNotifications('Notifications.character.componentImported'));
            } else {
               toast.error(tNotifications('Notifications.character.duplicatePortrait'));
            }
         } else if (isTrackerType) {
            addImportedTracker(migratedContent as Tracker);
            toast.success(tNotifications('Notifications.character.componentImported'));
         } else {
            toast.error(tNotifications('Notifications.general.importFailed'));
         }
      } catch (error) {
         console.error("Failed to import component file:", error);
         toast.error(tNotifications('Notifications.general.importFailed'));
      }

      componentFormRef.current?.reset();
   };

   // Update-in-place: overwrite the OPEN character/board with a file's contents while KEEPING its id +
   // drawer link, so every reference-by-id (a board's character element, the drawer copy) stays intact.
   // A pick validates the type then stashes the parsed entity; the confirm dialog is the last gate
   // before the destructive replace. No re-ID here (that's the new-board path) - the id is preserved.
   const [pendingCharacterUpdate, setPendingCharacterUpdate] = useState<Character | null>(null);
   const [pendingBoardUpdate, setPendingBoardUpdate] = useState<Board | null>(null);
   // A note update stashes the incoming content plus whether it replaces the cover: a `.cotm` update
   // replaces everything (cover included); a `.md` update carries no cover, so it keeps the existing one.
   const [pendingNoteUpdate, setPendingNoteUpdate] = useState<{ note: Note; replaceCover: boolean } | null>(null);

   const handleCharacterUpdateFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
         const importedData = await importFromFile(file);
         if (importedData.fileType !== 'FULL_CHARACTER_SHEET' || !character) {
            toast.error(tNotifications('Notifications.general.importFailed'));
         } else {
            setPendingCharacterUpdate(harmonizeData(importedData.content, importedData.fileType) as Character);
         }
      } catch (error) {
         console.error("Failed to read character file:", error);
         toast.error(tNotifications('Notifications.general.importFailed'));
      }
      characterUpdateFormRef.current?.reset();
   };

   const handleBoardUpdateFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
         const importedData = await importFromFile(file);
         const hasActiveBoard = !!getActiveBoardStore()?.getState().boardId;
         if (importedData.fileType !== 'FULL_BOARD' || !hasActiveBoard) {
            toast.error(tNotifications('Notifications.general.importFailed'));
         } else {
            setPendingBoardUpdate(harmonizeData(importedData.content, importedData.fileType) as Board);
         }
      } catch (error) {
         console.error("Failed to read board file:", error);
         toast.error(tNotifications('Notifications.general.importFailed'));
      }
      boardUpdateFormRef.current?.reset();
   };

   const handleNoteUpdateFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const hasActiveNote = !!getActiveNoteStore()?.getState().note;
      try {
         const name = file.name.toLowerCase();
         if (name.endsWith('.md') || name.endsWith('.markdown')) {
            // Markdown replaces title + body only; the existing cover is kept.
            if (!hasActiveNote) {
               toast.error(tNotifications('Notifications.general.importFailed'));
            } else {
               const note = noteFromMarkdown(await readFileAsText(file), file.name);
               setPendingNoteUpdate({ note, replaceCover: false });
            }
         } else {
            // A `.cotm` note replaces everything, cover included. Notes are 2.0-native (no harmonize).
            const importedData = await importFromFile(file);
            if (importedData.fileType !== 'NOTE' || !hasActiveNote) {
               toast.error(tNotifications('Notifications.general.importFailed'));
            } else {
               setPendingNoteUpdate({ note: importedData.content as Note, replaceCover: true });
            }
         }
      } catch (error) {
         console.error("Failed to read note file:", error);
         toast.error(tNotifications('Notifications.general.importFailed'));
      }
      noteUpdateFormRef.current?.reset();
   };

   const confirmCharacterUpdate = () => {
      if (!pendingCharacterUpdate || !character) { setPendingCharacterUpdate(null); return; }
      // Keep this character's identity + drawer link; take everything else from the file. The same id
      // means loadCharacter replaces the active tab's instance in place (no duplicate tab).
      const updated: Character = { ...pendingCharacterUpdate, id: character.id, drawerItemId: character.drawerItemId };
      loadCharacter(updated, character.drawerItemId);
      // Overwritten in the working store but not yet pushed to the drawer copy - mark dirty until Save.
      setHasUnsavedChanges(true);
      setPendingCharacterUpdate(null);
      toast.success(tNotifications('Notifications.character.updated'));
   };

   const confirmBoardUpdate = async () => {
      const store = getActiveBoardStore();
      const boardId = store?.getState().boardId;
      if (!pendingBoardUpdate || !store || !boardId) { setPendingBoardUpdate(null); return; }
      // Keep this board's id + drawer link; replace its rows wholesale from the file (the file's item
      // ids are a consistent set). hydrate reloads clean, so mark dirty after.
      const updated: Board = { ...pendingBoardUpdate, id: boardId, drawerItemId: store.getState().drawerItemId ?? undefined };
      try {
         await importBoard(updated);
         await store.getState().actions.hydrate(boardId);
         store.getState().actions.setHasUnsavedChanges(true);
         toast.success(tNotifications('Notifications.board.updated'));
      } catch (error) {
         console.error("Failed to update board from file:", error);
         toast.error(tNotifications('Notifications.general.importFailed'));
      }
      setPendingBoardUpdate(null);
   };

   const confirmNoteUpdate = () => {
      const store = getActiveNoteStore();
      const current = store?.getState().note;
      if (!pendingNoteUpdate || !store || !current) { setPendingNoteUpdate(null); return; }
      // Keep this note's id + drawer link; take title/body from the file. A `.cotm` replaces the cover
      // too; a `.md` keeps the current one. loadNote re-seeds the open editor in place; mark dirty until Save.
      const { note, replaceCover } = pendingNoteUpdate;
      const updated: Note = { id: current.id, title: note.title, body: note.body, cover: replaceCover ? note.cover : current.cover };
      const { loadNote: loadNoteIntoStore, setHasUnsavedChanges: setNoteDirty, flush } = store.getState().actions;
      loadNoteIntoStore(updated, store.getState().drawerItemId);
      setNoteDirty(true);
      flush();
      setPendingNoteUpdate(null);
      toast.success(tNotifications('Notifications.note.updated'));
   };

   return {
      // File-input refs (each input ref pairs with its hidden form ref).
      characterImportInputRef,
      characterFormRef,
      componentImportInputRef,
      componentFormRef,
      boardImportInputRef,
      boardFormRef,
      characterUpdateInputRef,
      characterUpdateFormRef,
      boardUpdateInputRef,
      boardUpdateFormRef,
      noteImportInputRef,
      noteFormRef,
      noteUpdateInputRef,
      noteUpdateFormRef,
      workspaceImportInputRef,
      workspaceFormRef,

      // Export handlers.
      handleExportCharacter,
      handleExportBoard,
      handleExportNote,

      // Import + update-pick change handlers.
      handleWorkspaceFileSelected,
      handleCharacterFileSelected,
      handleBoardFileSelected,
      handleNoteFileSelected,
      handleComponentFileSelected,
      handleCharacterUpdateFileSelected,
      handleBoardUpdateFileSelected,
      handleNoteUpdateFileSelected,

      // Pending update state + setters (drive the confirm dialogs).
      pendingCharacterUpdate,
      setPendingCharacterUpdate,
      pendingBoardUpdate,
      setPendingBoardUpdate,
      pendingNoteUpdate,
      setPendingNoteUpdate,

      // Update-in-place confirms.
      confirmCharacterUpdate,
      confirmBoardUpdate,
      confirmNoteUpdate,
   };
}
