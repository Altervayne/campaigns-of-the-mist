// -- Library Imports --
import { beforeEach, describe, expect, it, vi } from 'vitest';

// -- Data Imports --
import { drawerDatabase as db } from '@/lib/drawer/drawerDatabase';
import { DRAWER_ROOT_PARENT_ID } from '@/lib/drawer/drawerRecords';
import { NOTE_SCHEMA_VERSION } from '@/lib/notes/noteRecords';
import { BOARD_SCHEMA_VERSION } from '@/lib/board/boardRecords';

// -- Type Imports --
import type { DrawerItemRecord } from '@/lib/drawer/drawerRecords';
import type { NoteRecord } from '@/lib/notes/noteRecords';
import type { BoardRecord, BoardItemRecord } from '@/lib/board/boardRecords';
import type { Note, Board, BoardItemContent, PortalStyle } from '@/lib/types/board';
import type { LinkInsertTarget } from './buildLinkToken';

/*
 * Persistence tests for the re-point ops against fake-indexeddb, with the store registries mocked so the
 * open-vs-closed branch can be driven directly. Proves the closed path rewrites the record + linked drawer copy,
 * and the open path routes through the buffer without folding an unsaved edit into the saved copy.
 */

vi.mock('@/lib/notes/noteStoreRegistry', () => ({ peekNoteInstance: vi.fn() }));
vi.mock('@/lib/board/boardStoreRegistry', () => ({ peekBoardInstance: vi.fn() }));

import { peekNoteInstance } from '@/lib/notes/noteStoreRegistry';
import { peekBoardInstance } from '@/lib/board/boardStoreRegistry';
import { rePointNoteLinks, rePointBoardLinks } from './rePointOps';

const mockPeekNote = vi.mocked(peekNoteInstance);
const mockPeekBoard = vi.mocked(peekBoardInstance);

const OLD = 'oldTargetId';
const NEW_PDF: LinkInsertTarget = { kind: 'entity', entity: 'pdf', id: 'newPdfId' };
const NEW_NOTE: LinkInsertTarget = { kind: 'entity', entity: 'note', id: 'newNoteId' };
const PORTAL_STYLE: PortalStyle = { visual: null, label: 'Go', align: 'bottom', background: true };

function noteRecord(id: string, body: string, drawerItemId: string | null): NoteRecord {
   return { id, title: 'N', body, updatedAt: 1, drawerItemId, schemaVersion: NOTE_SCHEMA_VERSION };
}

function noteDrawerItem(id: string, content: Note): DrawerItemRecord {
   return { id, name: content.title, parentFolderId: DRAWER_ROOT_PARENT_ID, order: 0, game: 'NEUTRAL', type: 'NOTE', createdAt: 1, updatedAt: 1, content };
}

beforeEach(async () => {
   await db.notes.clear();
   await db.items.clear();
   await db.boards.clear();
   await db.boardItems.clear();
   mockPeekNote.mockReset();
   mockPeekBoard.mockReset();
   mockPeekNote.mockReturnValue(undefined);
   mockPeekBoard.mockReturnValue(undefined);
});

describe('rePointNoteLinks - closed note', () => {
   it('rewrites the note record body and its linked drawer copy', async () => {
      const body = 'See [book](cotm://pdf/oldTargetId).';
      await db.notes.put(noteRecord('note1', body, 'item1'));
      await db.items.put(noteDrawerItem('item1', { id: 'note1', title: 'N', body }));

      await rePointNoteLinks('note1', OLD, NEW_PDF);

      expect((await db.notes.get('note1'))!.body).toBe('See [book](cotm://pdf/newPdfId).');
      const item = await db.items.get('item1');
      expect((item!.content as Note).body).toBe('See [book](cotm://pdf/newPdfId).');
   });

   it('rewrites the record even with no linked drawer item', async () => {
      await db.notes.put(noteRecord('note2', '[x](cotm://item/oldTargetId)', null));
      await rePointNoteLinks('note2', OLD, { kind: 'element', drawerItemId: 'newItemId' });
      expect((await db.notes.get('note2'))!.body).toBe('[x](cotm://item/newItemId)');
   });

   it('is a no-op on a missing note', async () => {
      await expect(rePointNoteLinks('ghost', OLD, NEW_PDF)).resolves.toBeUndefined();
   });
});

describe('rePointNoteLinks - open note (buffer-safe)', () => {
   it('rewrites the live buffer and keeps unsaved prose out of the saved drawer copy', async () => {
      // The buffer carries an unsaved edit the record/drawer copy do not have yet.
      const bufferBody = 'UNSAVED EDIT See [book](cotm://pdf/oldTargetId).';
      const savedBody = 'See [book](cotm://pdf/oldTargetId).';
      const applyLinkRewrite = vi.fn();
      mockPeekNote.mockReturnValue({
         getState: () => ({ note: { id: 'note1', title: 'N', body: bufferBody }, actions: { applyLinkRewrite } }),
      } as never);

      await db.notes.put(noteRecord('note1', savedBody, 'item1'));
      await db.items.put(noteDrawerItem('item1', { id: 'note1', title: 'N', body: savedBody }));

      await rePointNoteLinks('note1', OLD, NEW_PDF);

      // The buffer rewrite preserves the unsaved edit, only fixing the link.
      expect(applyLinkRewrite).toHaveBeenCalledWith('UNSAVED EDIT See [book](cotm://pdf/newPdfId).');
      // The saved drawer copy is fixed from its OWN body - the unsaved edit never leaks into it.
      const item = await db.items.get('item1');
      expect((item!.content as Note).body).toBe('See [book](cotm://pdf/newPdfId).');
      expect((await db.notes.get('note1'))!.body).toBe('See [book](cotm://pdf/newPdfId).');
   });

   it('does not touch the buffer when the open note has no matching link', async () => {
      const applyLinkRewrite = vi.fn();
      mockPeekNote.mockReturnValue({
         getState: () => ({ note: { id: 'note1', title: 'N', body: 'no links' }, actions: { applyLinkRewrite } }),
      } as never);
      await db.notes.put(noteRecord('note1', 'no links', null));

      await rePointNoteLinks('note1', OLD, NEW_PDF);
      expect(applyLinkRewrite).not.toHaveBeenCalled();
   });
});

// -- Board fixtures --

function boardRecord(id: string, drawerItemId: string | null): BoardRecord {
   return { id, name: 'B', updatedAt: 1, viewport: { x: 0, y: 0, zoom: 1 }, drawerItemId, nextLayerSeq: 1, schemaVersion: BOARD_SCHEMA_VERSION };
}

function itemRow(id: string, boardId: string, content: BoardItemContent): BoardItemRecord {
   return { id, boardId, kind: content.kind, x: 0, y: 0, width: 100, height: 100, z: 0, content };
}

function portalContent(targetId: string): BoardItemContent {
   return { kind: 'portal', target: { kind: 'entity', entity: 'pdf', id: targetId }, style: PORTAL_STYLE };
}

function boardDrawerItem(id: string, content: Board): DrawerItemRecord {
   return { id, name: content.name, parentFolderId: DRAWER_ROOT_PARENT_ID, order: 0, game: 'NEUTRAL', type: 'FULL_BOARD', createdAt: 1, updatedAt: 1, content };
}

describe('rePointBoardLinks - closed board', () => {
   it('rewrites the matching item rows and the linked drawer FULL_BOARD copy, leaving other items alone', async () => {
      await db.boards.put(boardRecord('board1', 'bitem1'));
      await db.boardItems.put(itemRow('p1', 'board1', portalContent(OLD)));
      await db.boardItems.put(itemRow('x1', 'board1', { kind: 'pin', color: '#abc' }));

      const aggregate: Board = {
         id: 'board1', name: 'B', viewport: { x: 0, y: 0, zoom: 1 }, nextLayerSeq: 1,
         items: [
            { id: 'p1', kind: 'portal', x: 0, y: 0, width: 100, height: 100, z: 0, content: portalContent(OLD) },
            { id: 'x1', kind: 'pin', x: 0, y: 0, width: 100, height: 100, z: 0, content: { kind: 'pin', color: '#abc' } },
         ],
      };
      await db.items.put(boardDrawerItem('bitem1', aggregate));

      await rePointBoardLinks('board1', OLD, NEW_NOTE);

      const portalRow = await db.boardItems.get('p1');
      expect(portalRow!.content).toMatchObject({ target: { kind: 'entity', entity: 'note', id: 'newNoteId' } });
      expect((await db.boardItems.get('x1'))!.content).toEqual({ kind: 'pin', color: '#abc' });

      const drawerCopy = (await db.items.get('bitem1'))!.content as Board;
      expect(drawerCopy.items[0].content).toMatchObject({ target: { kind: 'entity', entity: 'note', id: 'newNoteId' } });
      expect(drawerCopy.items[1].content).toEqual({ kind: 'pin', color: '#abc' });
   });

   it('is a no-op on a missing board', async () => {
      await expect(rePointBoardLinks('ghost', OLD, NEW_NOTE)).resolves.toBeUndefined();
   });
});

describe('rePointBoardLinks - open board (buffer-safe)', () => {
   it('routes each matching item through the store, skipping non-matches', async () => {
      const updateItemContent = vi.fn().mockResolvedValue(undefined);
      mockPeekBoard.mockReturnValue({
         getState: () => ({
            items: {
               p1: { id: 'p1', content: portalContent(OLD) },
               x1: { id: 'x1', content: { kind: 'pin', color: '#abc' } },
            },
            actions: { updateItemContent },
         }),
      } as never);

      await rePointBoardLinks('board1', OLD, NEW_NOTE);

      expect(updateItemContent).toHaveBeenCalledTimes(1);
      expect(updateItemContent).toHaveBeenCalledWith('p1', { kind: 'portal', target: { kind: 'entity', entity: 'note', id: 'newNoteId' }, style: PORTAL_STYLE });
   });
});
