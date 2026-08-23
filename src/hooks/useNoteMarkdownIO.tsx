// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Basic UI Imports --
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

// -- Utils Imports --
import { downloadTextFile, readFileAsText } from '@/lib/utils/export-import';
import { noteToMarkdown } from '@/lib/notes/noteMarkdown';
import { markdownFilename, noteFromMarkdown, noteHasImages } from '@/lib/notes/noteMarkdownFile';

// -- Store and Hook Imports --
import { getActiveNoteStore } from '@/lib/notes/noteStoreRegistry';
import { importNote, loadNote } from '@/lib/notes/noteRepository';
import { useTabManagerActions } from '@/lib/character/tabManagerStore';

// -- Type Imports --
import type { Note } from '@/lib/types/board';

/**
 * The plain-`.md` note flow. EXPORT is its own explicit format choice: serialize the active note
 * through {@link noteToMarkdown} and download it, warning first when the note has images (they are
 * refs, not bytes, so they can't travel in a `.md`). `dialogs` (the warning) must be rendered once
 * by the host. IMPORT has no separate entry point - {@link importMarkdownFile} is the `.md` step the
 * unified "Import Note" picker calls when the picked file is markdown; it toasts and never throws.
 */
export function useNoteMarkdownIO() {
   const { t } = useTranslation();
   const { openNoteTab } = useTabManagerActions();

   // A note staged for export while the "images won't travel" warning is up; null when nothing pends.
   const [pendingExport, setPendingExport] = useState<Note | null>(null);

   const writeMarkdown = (note: Note) => {
      downloadTextFile(markdownFilename(note.title), noteToMarkdown(note));
      toast.success(t('Notifications.note.exportedMarkdown'));
   };

   const exportActiveNoteAsMarkdown = async () => {
      const store = getActiveNoteStore();
      if (!store) return;
      const { noteId } = store.getState();
      if (!noteId) return;
      try {
         const note = await loadNote(noteId);
         if (!note) return;
         // Images ride along as local refs, so warn before the file leaves the device; otherwise silent.
         if (noteHasImages(note)) setPendingExport(note);
         else writeMarkdown(note);
      } catch {
         toast.error(t('Notifications.general.exportError'));
      }
   };

   const confirmExport = () => {
      if (pendingExport) writeMarkdown(pendingExport);
      setPendingExport(null);
   };

   // The `.md` branch of the unified "Import Note" picker: parse the text into a new working note
   // (unlinked, so a first save routes to Save-As) and open its tab. Self-contained toasts, no throw.
   const importMarkdownFile = async (file: File) => {
      try {
         const text = await readFileAsText(file);
         const note = noteFromMarkdown(text, file.name);
         await importNote(note, null);
         await openNoteTab(note.id);
         toast.success(t('Notifications.note.importedMarkdown'));
      } catch (error) {
         console.error('Failed to import markdown file:', error);
         toast.error(t('Notifications.general.importFailed'));
      }
   };

   const dialogs = (
      <AlertDialog open={pendingExport !== null} onOpenChange={(open) => { if (!open) setPendingExport(null); }}>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>{t('WorkspacePage.SidebarMenu.exportMarkdownWarningTitle')}</AlertDialogTitle>
               <AlertDialogDescription>{t('WorkspacePage.SidebarMenu.exportMarkdownWarningDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
               <AlertDialogCancel className="cursor-pointer">{t('Common.cancel')}</AlertDialogCancel>
               <AlertDialogAction className="cursor-pointer" onClick={confirmExport}>{t('WorkspacePage.SidebarMenu.exportMarkdownWarningConfirm')}</AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   );

   return { exportActiveNoteAsMarkdown, importMarkdownFile, dialogs };
}
