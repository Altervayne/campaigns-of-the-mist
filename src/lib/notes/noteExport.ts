// -- Library Imports --
import toast from 'react-hot-toast';

// -- Utils Imports --
import { exportToFile, generateExportFilename } from '@/lib/utils/export-import';
import { getActiveNoteStore } from '@/lib/notes/noteStoreRegistry';
import { loadNote } from '@/lib/notes/noteRepository';

// -- Type Imports --
import type { TFunction } from 'i18next';

/**
 * Export the active note as a full-fidelity `.cotm` envelope. Serializes from the repo (the note store
 * debounce-saves onto its row); a note is a flat document with no asset refs, so the generic export needs
 * no embed. Toasts on success and failure. Shared by the desktop sidebar and the mobile note toolbelt.
 */
export async function exportActiveNote(t: TFunction): Promise<void> {
   const store = getActiveNoteStore();
   if (!store) return;
   const { noteId } = store.getState();
   if (!noteId) return;
   try {
      const aggregate = await loadNote(noteId);
      if (!aggregate) return;
      await exportToFile(aggregate, 'NOTE', 'NEUTRAL', generateExportFilename('NEUTRAL', 'NOTE', aggregate.title));
      toast.success(t('Notifications.note.exported'));
   } catch {
      toast.error(t('Notifications.general.exportError'));
   }
}
