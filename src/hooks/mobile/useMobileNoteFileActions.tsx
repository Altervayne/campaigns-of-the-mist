// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Component Imports --
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

// -- Utils Imports --
import { exportActiveNote } from '@/lib/notes/noteExport';
import { importNoteFromFile, parseNoteUpdateFile, applyNoteUpdate } from '@/lib/notes/noteImport';
import { ACCEPT_NOTE_IMPORT } from '@/lib/utils/fileAccept';
import { getActiveNoteStore } from '@/lib/notes/noteStoreRegistry';

// -- Store and Hook Imports --
import { useTabManagerActions } from '@/lib/character/tabManagerStore';
import { useNoteMarkdownIO } from '@/hooks/useNoteMarkdownIO';

// -- Type Imports --
import type { Note } from '@/lib/types/board';

/*
 * The mobile note toolbelt's file actions, at desktop parity: export the active note as a `.cotm` envelope
 * or as `.md`; import a `.cotm`/`.md` file as a new note; or update the CURRENT note in place from a file.
 * Export + import reuse the shared helpers; the markdown export keeps the shared images-won't-travel warning.
 * Import opens through the mobile tab path (the desktop opener adds a desktop tab the mobile shell omits).
 * Update is destructive, so it stashes the parse behind a confirm gate. All confirms/warnings render via
 * `dialogs`, which the host mounts once.
 */
export function useMobileNoteFileActions() {
   const { t } = useTranslation();
   const { mobileOpenNoteTab } = useTabManagerActions();
   const { exportActiveNoteAsMarkdown, dialogs: markdownDialogs } = useNoteMarkdownIO();
   const [pendingUpdate, setPendingUpdate] = useState<{ note: Note; replaceCover: boolean } | null>(null);

   const exportNote = () => { void exportActiveNote(t); };
   const exportMarkdown = () => { void exportActiveNoteAsMarkdown(); };

   // Import Note: pick a `.cotm`/`.md` file and open it as a new note tab (the mobile single-workspace path).
   const importNote = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = ACCEPT_NOTE_IMPORT;
      input.onchange = async () => {
         const file = input.files?.[0];
         if (!file) return;
         try {
            const result = await importNoteFromFile(file);
            if (!result) { toast.error(t('Notifications.general.importFailed')); return; }
            await mobileOpenNoteTab(result.noteId);
            toast.success(t(result.wasMarkdown ? 'Notifications.note.importedMarkdown' : 'Notifications.note.imported'));
         } catch (error) {
            console.error('Failed to import note file:', error);
            toast.error(t('Notifications.general.importFailed'));
         }
      };
      input.click();
   };

   // Update Note from File: pick a `.cotm`/`.md` file and stash it for the destructive replace-in-place confirm.
   const updateNote = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = ACCEPT_NOTE_IMPORT;
      input.onchange = async () => {
         const file = input.files?.[0];
         if (!file) return;
         if (!getActiveNoteStore()?.getState().note) { toast.error(t('Notifications.general.importFailed')); return; }
         try {
            const pending = await parseNoteUpdateFile(file);
            if (!pending) { toast.error(t('Notifications.general.importFailed')); return; }
            setPendingUpdate(pending);
         } catch (error) {
            console.error('Failed to read note file:', error);
            toast.error(t('Notifications.general.importFailed'));
         }
      };
      input.click();
   };

   const confirmUpdate = () => {
      if (pendingUpdate && applyNoteUpdate(pendingUpdate)) toast.success(t('Notifications.note.updated'));
      setPendingUpdate(null);
   };
   const cancelUpdate = () => setPendingUpdate(null);

   const dialogs = (
      <>
         {markdownDialogs}
         {/* Update-from-file confirm gate: the last step before the destructive replace-in-place. */}
         <AlertDialog open={pendingUpdate !== null} onOpenChange={(open) => { if (!open) cancelUpdate(); }}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>{t('CharacterSheetPage.SidebarMenu.updateNoteConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('CharacterSheetPage.SidebarMenu.updateNoteConfirmDescription')}</AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">{t('Common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer" onClick={confirmUpdate}>{t('CharacterSheetPage.SidebarMenu.updateConfirmButton')}</AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   );

   return { exportNote, exportMarkdown, importNote, updateNote, dialogs };
}
