// -- Repository Imports --
import { getNote } from '@/lib/notes/noteRepository';
import { recordToNote } from '@/lib/notes/noteRecords';
import { getNoteItemIdMap, getBoardItemIdMap, getCharacterItemIdMap, getPdfItemIdMap, getItem } from '@/lib/drawer/drawerRepository';
import { loadBoard, importBoard } from '@/lib/board/boardRepository';
import { getCharacter } from '@/lib/character/characterRepository';
import { getPdf, importPdf } from '@/lib/pdf/pdfRepository';
import { getActivePdfStore } from '@/lib/pdf/pdfStoreRegistry';
import { openNoteReference } from '@/lib/notes/openNoteReference';
import { useTabManagerStore } from '@/lib/character/tabManagerStore';

// -- Type Imports --
import type { useTabManagerActions } from '@/lib/character/tabManagerStore';
import type { Note, Board } from '@/lib/types/board';
import type { Character } from '@/lib/types/character';
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * The Portals entity open-or-create-tab service: resolves an entity link's id to its aggregate and opens (or
 * focuses) its tab, composing the EXISTING tab-manager + repository services. It is the ONE place the id ->
 * aggregate resolve + the uniform dead-target handling lives, so every entity branch no-ops with a toast
 * rather than crashing on a deleted target. Store-coupled by design (it IS the wiring layer); the pure
 * classify/resolve is `linkTarget.ts` and the thin dispatch is `runLinkAction.ts`.
 */

/** Dependencies the entity open needs: the tab actions, and a dead-target notifier (a toast). */
export interface OpenEntityDeps {
   actions: ReturnType<typeof useTabManagerActions>;
   /** Called when the target id resolves to nothing (deleted / never saved) - the caller shows a toast. */
   onMissing: () => void;
   /**
    * Called ONCE on a SUCCESS path (a tab actually opened or was focused), NEVER on a dead target. The portal
    * trail records an edge here; a note internal link can opt in the same way. Optional: existing callers omit it.
    */
   onNavigated?: () => void;
}

/**
 * Resolves a note id to its aggregate + drawer source. Prefers the working row (an open or recently-open
 * note), else consults the drawer (a saved-then-closed note lives only as its `NOTE` drawer item). Returns
 * `null` when neither exists (a deleted target).
 */
async function resolveNoteAggregate(noteId: string): Promise<{ note: Note; sourceDrawerItemId?: string } | null> {
   const record = await getNote(noteId);
   if (record) return { note: recordToNote(record), sourceDrawerItemId: record.drawerItemId ?? undefined };

   const drawerItemId = (await getNoteItemIdMap()).get(noteId);
   if (drawerItemId) {
      const item = await getItem(drawerItemId);
      if (item) return { note: item.content as Note, sourceDrawerItemId: drawerItemId };
   }
   return null;
}

/**
 * Opens (or focuses) the tab for entity `id`. A note reuses the note tile's focus-or-import path; a board
 * hydrates itself once its record is confirmed; a character resolves its aggregate then opens with its drawer
 * link; a pdf focuses-or-imports then jumps to `page` when one is given. A dead target on any branch calls
 * `onMissing` and no-ops. `page` is honored only by the pdf branch (a bare link just focuses at page 1).
 */
export async function openEntityTab(entity: 'note' | 'board' | 'character' | 'pdf', id: string, deps: OpenEntityDeps, page?: number): Promise<void> {
   if (entity === 'note') {
      // Already open: focus it (skips the resolve entirely).
      if (useTabManagerStore.getState().openTabs.some((tab) => tab.id === id)) {
         deps.actions.setActiveTab(id);
         deps.onNavigated?.();
         return;
      }
      const resolved = await resolveNoteAggregate(id);
      if (!resolved) return deps.onMissing();
      openNoteReference(id, resolved.note, resolved.sourceDrawerItemId, deps.actions);
      deps.onNavigated?.();
      return;
   }

   if (entity === 'board') {
      // Working row present (open, or previously opened): `openBoardTab` focuses-or-hydrates by id.
      if (await loadBoard(id)) {
         await deps.actions.openBoardTab(id);
         deps.onNavigated?.();
         return;
      }
      // Saved-but-closed: the durable copy lives as the FULL_BOARD drawer item; import it into the working
      // table (like the drawer's own open path), then open it.
      const drawerItemId = (await getBoardItemIdMap()).get(id);
      const item = drawerItemId ? await getItem(drawerItemId) : undefined;
      if (!item) return deps.onMissing();
      await importBoard(item.content as Board);
      await deps.actions.openBoardTab(id);
      deps.onNavigated?.();
      return;
   }

   if (entity === 'pdf') {
      // Working row present (open, or previously opened): `openPdfTab` focuses-or-hydrates by id.
      if (await getPdf(id)) {
         await deps.actions.openPdfTab(id);
      } else {
         // Saved-but-closed: the durable copy lives as the PDF drawer item; import it into the working table
         // (like the drawer's own open path), then open it.
         const drawerItemId = (await getPdfItemIdMap()).get(id);
         const item = drawerItemId ? await getItem(drawerItemId) : undefined;
         if (!item) return deps.onMissing();
         await importPdf(item.content as PdfDocument, drawerItemId ?? null);
         await deps.actions.openPdfTab(id);
      }
      // A page link jumps the now-active reader (works whether it just opened or was already open); a bare link
      // leaves it at page 1.
      if (page) getActivePdfStore()?.getState().actions.requestPage(page);
      deps.onNavigated?.();
      return;
   }

   // character: working row first (open/recently-open), else the drawer copy (saved-but-closed).
   const record = await getCharacter(id);
   if (record) {
      deps.actions.openCharacterTab(record.character, record.drawerItemId ?? undefined);
      deps.onNavigated?.();
      return;
   }
   const drawerItemId = (await getCharacterItemIdMap()).get(id);
   const item = drawerItemId ? await getItem(drawerItemId) : undefined;
   if (!item) return deps.onMissing();
   deps.actions.openCharacterTab(item.content as Character, drawerItemId);
   deps.onNavigated?.();
}
