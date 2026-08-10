// -- Utils Imports --
import { importFromFile, readFileAsText } from '@/lib/utils/export-import';
import { noteFromMarkdown } from '@/lib/notes/noteMarkdownFile';
import { importNote } from '@/lib/notes/noteRepository';
import { reIdNote } from '@/lib/notes/reIdNote';
import { getActiveNoteStore } from '@/lib/notes/noteStoreRegistry';

// -- Type Imports --
import type { Note } from '@/lib/types/board';

const isMarkdownFile = (name: string): boolean => {
   const lower = name.toLowerCase();
   return lower.endsWith('.md') || lower.endsWith('.markdown');
};

/**
 * Materialize a picked file as a fresh working note (new identity, unlinked so a first save routes to
 * Save-As). Accepts a `.cotm` NOTE envelope or plain Markdown (`.md`/`.markdown`); returns the new note id
 * and whether it came from Markdown (the caller opens it and picks the toast), or null on an unsupported file.
 */
export async function importNoteFromFile(file: File): Promise<{ noteId: string; wasMarkdown: boolean } | null> {
   if (isMarkdownFile(file.name)) {
      const note = noteFromMarkdown(await readFileAsText(file), file.name);
      await importNote(note, null);
      return { noteId: note.id, wasMarkdown: true };
   }
   const importedData = await importFromFile(file);
   if (importedData.fileType !== 'NOTE') return null;
   // A fresh import re-ids so it can't collide with an open note tab or overwrite an existing row.
   const note = reIdNote(importedData.content as Note);
   await importNote(note, null);
   return { noteId: note.id, wasMarkdown: false };
}

/**
 * Parse a picked file into a pending update for the CURRENT note: the incoming content plus whether the
 * cover is replaced. A `.cotm` replaces everything (cover included); Markdown carries no cover, so it keeps
 * the existing one. Returns null on an unsupported file. Touches no store - {@link applyNoteUpdate} does.
 */
export async function parseNoteUpdateFile(file: File): Promise<{ note: Note; replaceCover: boolean } | null> {
   if (isMarkdownFile(file.name)) {
      return { note: noteFromMarkdown(await readFileAsText(file), file.name), replaceCover: false };
   }
   const importedData = await importFromFile(file);
   if (importedData.fileType !== 'NOTE') return null;
   return { note: importedData.content as Note, replaceCover: true };
}

/**
 * Overwrite the active note in place from a parsed update, KEEPING its id + drawer link so every
 * reference-by-id (a board tile, the drawer copy) stays intact. Marks dirty (not yet pushed to the drawer
 * copy) and flushes. Returns false when no note is active.
 */
export function applyNoteUpdate(pending: { note: Note; replaceCover: boolean }): boolean {
   const store = getActiveNoteStore();
   const current = store?.getState().note;
   if (!store || !current) return false;
   const { note, replaceCover } = pending;
   const updated: Note = { id: current.id, title: note.title, body: note.body, cover: replaceCover ? note.cover : current.cover };
   const { loadNote: loadNoteIntoStore, setHasUnsavedChanges, flush } = store.getState().actions;
   loadNoteIntoStore(updated, store.getState().drawerItemId);
   setHasUnsavedChanges(true);
   flush();
   return true;
}
