// -- Data Imports --
import { drawerDatabase as db } from '@/lib/drawer/drawerDatabase';
import { listAllNotes } from '@/lib/notes/noteRepository';
import { listBoards } from '@/lib/board/boardRepository';

// -- Store Registry Imports --
import { peekNoteInstance } from '@/lib/notes/noteStoreRegistry';
import { peekBoardInstance } from '@/lib/board/boardStoreRegistry';

// -- Portals Imports --
import {
   rePointNoteBody,
   rePointBoardItemContent,
   rePointBoardTarget,
   countNoteBodyLinks,
   countBoardLinks,
} from './rePoint';

// -- Type Imports --
import type { LinkInsertTarget } from './buildLinkToken';
import type { Note, Board, BoardItemContent } from '@/lib/types/board';

/*
 * Persistence side of the re-point primitives: buffer-aware ops that apply the pure rewrites in `rePoint.ts` to
 * stored user content and to any OPEN editor buffer, keeping the two in sync. The pure rewrites are surgical, so
 * each op transforms every representation on its OWN text - an open note's unsaved prose is never folded into the
 * saved drawer copy; only the dead link changes everywhere it lives.
 *
 * Undo is a later concern (2b/2c): these ops must be correct + atomic now. The board path already lands one undo
 * step per item via the open board's command engine; the note path is a plain content write.
 */

/**
 * Re-points every note-body link targeting `oldId` to `newTarget`, in the note record AND its linked drawer copy.
 * When the note is OPEN, its live buffer is rewritten through the store first so the editor's next debounce-save
 * can't reintroduce the dead link. Each body is rewritten on its own text, so an open note's unsaved edits stay
 * only in the buffer. A no-op when nothing matches.
 */
export async function rePointNoteLinks(noteId: string, oldId: string, newTarget: LinkInsertTarget): Promise<void> {
   // Open note: rewrite the live buffer (the open note's source of truth) so its next save carries the fix.
   const live = peekNoteInstance(noteId);
   const openNote = live?.getState().note;
   if (live && openNote && openNote.id === noteId) {
      const nextBufferBody = rePointNoteBody(openNote.body, oldId, newTarget);
      if (nextBufferBody !== openNote.body) live.getState().actions.applyLinkRewrite(nextBufferBody);
   }

   // Persist the record + its linked drawer copy atomically. Each body is transformed independently.
   await db.transaction('rw', [db.notes, db.items], async () => {
      const record = await db.notes.get(noteId);
      if (!record) return;

      const nextRecordBody = rePointNoteBody(record.body, oldId, newTarget);
      if (nextRecordBody !== record.body) {
         await db.notes.update(noteId, { body: nextRecordBody, updatedAt: Date.now() });
      }

      const drawerItemId = record.drawerItemId ?? null;
      if (!drawerItemId) return;
      const item = await db.items.get(drawerItemId);
      if (!item || item.type !== 'NOTE') return;
      const content = item.content as Note;
      const nextItemBody = rePointNoteBody(content.body, oldId, newTarget);
      if (nextItemBody !== content.body) {
         await db.items.update(drawerItemId, { content: { ...content, body: nextItemBody } });
      }
   });
}

/**
 * Re-points every board portal / note-embed targeting `oldId` to `newTarget`. When the board is OPEN, each match
 * routes through the store (one undo step per item, live view + item rows in sync). When it is CLOSED, the item
 * rows AND the linked drawer `FULL_BOARD` copy are rewritten in one transaction. A no-op when nothing matches.
 */
export async function rePointBoardLinks(boardId: string, oldId: string, newTarget: LinkInsertTarget): Promise<void> {
   const live = peekBoardInstance(boardId);
   if (live) {
      const items = Object.values(live.getState().items);
      for (const item of items) {
         const nextContent = rePointBoardItemContent(item.content, oldId, newTarget);
         if (nextContent) await live.getState().actions.updateItemContent(item.id, nextContent);
      }
      return;
   }

   await db.transaction('rw', [db.boards, db.boardItems, db.items], async () => {
      const boardRow = await db.boards.get(boardId);
      if (!boardRow) return;

      const itemRows = await db.boardItems.where('boardId').equals(boardId).toArray();
      for (const row of itemRows) {
         const nextContent = rePointBoardItemContent(row.content, oldId, newTarget);
         if (nextContent) await db.boardItems.update(row.id, { content: nextContent });
      }

      const drawerItemId = boardRow.drawerItemId ?? null;
      if (!drawerItemId) return;
      const item = await db.items.get(drawerItemId);
      if (!item || item.type !== 'FULL_BOARD') return;
      const board = item.content as Board;
      const nextBoard = rePointBoardTarget(board, oldId, newTarget);
      if (nextBoard !== board) await db.items.update(drawerItemId, { content: nextBoard });
   });
}

/** Aggregate scope of an app-wide re-point: how many hosts of each kind carry a match, and the total link count. */
export interface RePointScope {
   notes: number;
   boards: number;
   links: number;
}

/**
 * A board's item contents for the count scan: the OPEN board's live items when it is open, else the persisted item
 * rows. The peek-or-db read lives here so the count and the apply agree on which items a closed board holds.
 */
async function boardItemContentsForCount(boardId: string): Promise<BoardItemContent[]> {
   const live = peekBoardInstance(boardId);
   if (live) return Object.values(live.getState().items).map((item) => item.content);
   const rows = await db.boardItems.where('boardId').equals(boardId).toArray();
   return rows.map((row) => row.content);
}

/**
 * Counts every link to `oldId` across all notes and boards, for the picker header's "all N links" scope. The count
 * reads persisted (and any open board's live) state; an open NOTE's unsaved-but-unpersisted new dead link is not
 * seen here, but {@link rePointNoteLinks} still fixes it in the buffer, so the count can under-report while the
 * rewrite stays faithful. `notes`/`boards` count HOSTS with at least one match; `links` is the total.
 */
export async function countAllLinks(oldId: string): Promise<RePointScope> {
   const scope: RePointScope = { notes: 0, boards: 0, links: 0 };

   for (const note of await listAllNotes()) {
      const count = countNoteBodyLinks(note.body, oldId);
      if (count > 0) { scope.notes += 1; scope.links += count; }
   }

   for (const board of await listBoards()) {
      const count = countBoardLinks(await boardItemContentsForCount(board.id), oldId);
      if (count > 0) { scope.boards += 1; scope.links += count; }
   }

   return scope;
}

/**
 * Re-points every note-body link and every board portal / note-embed targeting `oldId` to `newTarget`, across the
 * whole app in one pass, returning the aggregate counts for the toast. A host with no match is skipped; each match
 * routes through the buffer-aware per-host op, so open buffers stay in sync and the board undo behavior is kept.
 */
export async function rePointAllLinks(oldId: string, newTarget: LinkInsertTarget): Promise<RePointScope> {
   const scope: RePointScope = { notes: 0, boards: 0, links: 0 };

   for (const note of await listAllNotes()) {
      const count = countNoteBodyLinks(note.body, oldId);
      if (count === 0) continue;
      await rePointNoteLinks(note.id, oldId, newTarget);
      scope.notes += 1;
      scope.links += count;
   }

   for (const board of await listBoards()) {
      const count = countBoardLinks(await boardItemContentsForCount(board.id), oldId);
      if (count === 0) continue;
      await rePointBoardLinks(board.id, oldId, newTarget);
      scope.boards += 1;
      scope.links += count;
   }

   return scope;
}
