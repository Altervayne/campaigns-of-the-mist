// -- React Imports --
import { useCallback, useRef, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Hook Imports --
import { useFileDrop } from '@/hooks/useFileDrop';

// -- Utils Imports --
import { importFromFile } from '@/lib/utils/export-import';
import { harmonizeData } from '@/lib/harmonization';
import { reIdCharacterAggregate } from '@/lib/character/reIdCharacterAggregate';
import { importBoard } from '@/lib/board/boardRepository';
import { prepareImportedBoard } from '@/lib/board/importBoardReferencedCharacters';
import { useThemeImport } from '@/lib/theme/useThemeImport';
import { ACCEPT_SHEET_IMPORT } from '@/lib/utils/fileAccept';

// -- Store Imports --
import { useCharacterStore, useCharacterActions } from '@/lib/stores/characterStore';
import { useTabManagerActions } from '@/lib/character/tabManagerStore';
import { useAppSettingsActions } from '@/lib/stores/appSettingsStore';
import { useDrawerActions } from '@/lib/stores/drawerStore';

// -- Type Imports --
import type { Character, Card as CardData, Tracker } from '@/lib/types/character';
import type { Board } from '@/lib/types/board';



/**
 * Universal file import for the character sheet, behind both a drop zone and a
 * file picker.
 *
 * Parses and harmonizes a .cotm/.json file, then routes by type: a full character
 * sheet or board opens as a tab (the board rehydrates its referenced characters),
 * a custom theme is added and selected, and an individual card or tracker imports
 * onto the loaded character (after validating a character is loaded and its game
 * matches). The drop zone and the picker share the same `importFile` router.
 *
 * @returns The dropzone root props and active-drag flag, plus the picker plumbing:
 *   `triggerImport` (opens the OS picker), the change handler, and the form/input refs.
 */
export function useCharacterSheetFileImport() {
   const { t: tNotifications } = useTranslation();
   const character = useCharacterStore((state) => state.character);
   const { addImportedCard, addImportedTracker } = useCharacterActions();
   const { openCharacterTab, openBoardTab } = useTabManagerActions();
   const { setContextualGame } = useAppSettingsActions();
   const { reloadCurrentFolder } = useDrawerActions();
   const importTheme = useThemeImport();

   const formRef = useRef<HTMLFormElement>(null);
   const fileInputRef = useRef<HTMLInputElement>(null);

   const importFile = useCallback(async (file: File) => {
      try {
         const importedData = await importFromFile(file);
         const migratedContent = harmonizeData(importedData.content, importedData.fileType);
         const { fileType, game } = importedData;

         // ==================
         //  Full character sheet
         // ==================
         if (fileType === 'FULL_CHARACTER_SHEET') {
            // An imported file is a fresh, independent copy: re-id the aggregate (cross-ref-safe, keeping the
            // sheet-layout manifest + journal bookmarks consistent) so re-importing the same file opens a NEW
            // tab instead of silently focusing the source, and a file's id can't collide with an already-open
            // autosaved instance or a board's characterId reference. Mirrors the mobile import path.
            const characterData = reIdCharacterAggregate(migratedContent as Character);
            openCharacterTab(characterData);
            setContextualGame(characterData.game);
            toast.success(tNotifications('Notifications.character.imported'));
            return;
         }

         // ==================
         //  Full board (character-independent; always imported as a NEW board)
         // ==================
         if (fileType === 'FULL_BOARD') {
            const board = migratedContent as Board;
            // Rehydrate the board's referenced characters (link existing / recreate absent, ids kept),
            // re-id for a fresh independent copy, then rewire the elements to the local characters.
            const prepared = await prepareImportedBoard(
               board,
               importedData.embedded,
               tNotifications('Drawer.importedFromBoardFolder', { board: board.name }),
            );
            await importBoard(prepared);
            // The import may have written an "Imported from {board}" folder straight to the DB;
            // re-read the current view so it shows without an app reload (a no-op on a pure link).
            await reloadCurrentFolder();
            await openBoardTab(prepared.id);
            toast.success(tNotifications('Notifications.board.imported'));
            return;
         }

         // ==================
         //  Custom theme (character-independent; always imported as a NEW custom and selected)
         // ==================
         if (fileType === 'CUSTOM_THEME') {
            importTheme(importedData);
            return;
         }

         // ==================
         //  Individual components require a character to be loaded
         // ==================
         if (!character) {
            toast.error(tNotifications('Notifications.general.importFailedNoCharacter'));
            return;
         }

         // ==================
         //  Compatibility check for individual components
         // ==================
         // NEUTRAL items are game-agnostic, so they import onto any character.
         if (game !== 'NEUTRAL' && game !== character.game) {
            toast.error(tNotifications(fileType === 'CHALLENGE_CARD'
               ? 'Notifications.general.importFailedWrongGameChallenge'
               : 'Notifications.general.importFailedWrongGame'));
            return;
         }

         const isCardType = fileType === 'CHARACTER_CARD' || fileType === 'CHARACTER_THEME' || fileType === 'GROUP_THEME' || fileType === 'LOADOUT_THEME' || fileType === 'CHALLENGE_CARD';
         const isTrackerType = fileType === 'STATUS_TRACKER' || fileType === 'STORY_TAG_TRACKER' || fileType === 'STORY_THEME_TRACKER';

         if (isCardType) {
            addImportedCard(migratedContent as CardData);
            toast.success(tNotifications('Notifications.character.componentImported'));
         } else if (isTrackerType) {
            addImportedTracker(migratedContent as Tracker);
            toast.success(tNotifications('Notifications.character.componentImported'));
         } else {
            toast.error(tNotifications('Notifications.general.importFailed'));
         }

      } catch (error) {
         console.error("Failed to import file:", error);
         toast.error(tNotifications('Notifications.general.importFailed'));
      }
   }, [character, openCharacterTab, openBoardTab, addImportedCard, addImportedTracker, setContextualGame, reloadCurrentFolder, importTheme, tNotifications]);

   const onFiles = useCallback((files: File[]) => {
      importFile(files[0]);
   }, [importFile]);

   // Drop-only: the picker path below (its own hidden input + `triggerImport`) handles clicks.
   const { getRootProps, isDragActive } = useFileDrop({
      onFiles,
      accept: ACCEPT_SHEET_IMPORT,
      noClick: true,
   });

   // Picker path: the change handler routes the pick through the same `importFile`, then
   // resets the form so re-picking the same file fires `change` again.
   const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) await importFile(file);
      formRef.current?.reset();
   };

   const triggerImport = () => fileInputRef.current?.click();

   return { getRootProps, isDragActive, handleFileSelected, triggerImport, formRef, fileInputRef };
}
