// -- Library Imports --
import { beforeEach, describe, expect, it, vi } from 'vitest';

// -- Mocks --
vi.mock('cuid', () => ({ default: () => 'NEW_ID' }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/drawer/drawerItemPath', () => ({ getDrawerItemDisplayPath: vi.fn(async () => 'Path/To/Item') }));
vi.mock('@/lib/board/refreezeNoteReferences', () => ({ stampNoteReferencesDrawerSource: vi.fn(async () => {}) }));
vi.mock('@/lib/saveAs/forkToDrawer', () => ({ forkNoteToDrawerItem: vi.fn(async () => ({ id: 'FORK' })) }));

// -- Local Imports --
import { saveNote, saveNoteAs } from './useMobileNoteSave';
import { stampNoteReferencesDrawerSource } from '@/lib/board/refreezeNoteReferences';
import { forkNoteToDrawerItem } from '@/lib/saveAs/forkToDrawer';

// -- Type Imports --
import type { TFunction } from 'i18next';
import type { NoteStore } from '@/lib/stores/noteStore';

/*
 * The Save / Save-As branch logic. Save on a LINKED note overwrites its item; a dangling link and an unlinked
 * first save both link + add a fresh item and stamp references; Save-As on a linked note FORKS. The soft
 * keyboard, sheet rise, and actual persistence are the owner's cursor to confirm on a device.
 */

const t = ((key: string) => key) as unknown as TFunction;

// A note aggregate stand-in; only identity matters to these assertions.
const AGGREGATE = { id: 'note-1' };

/** Fake note store: a fixed state with spy-able save actions. */
function makeStore(overrides: { drawerItemId: string | null; linkedItemUpdated?: boolean }): {
   store: NoteStore;
   saveToDrawer: ReturnType<typeof vi.fn>;
   linkToDrawerItem: ReturnType<typeof vi.fn>;
} {
   const saveToDrawer = vi.fn(async () => ({ linkedItemUpdated: overrides.linkedItemUpdated ?? true }));
   const linkToDrawerItem = vi.fn(async () => AGGREGATE);
   const state = {
      noteId: 'note-1',
      note: { id: 'note-1', title: 'My Note' },
      drawerItemId: overrides.drawerItemId,
      actions: { saveToDrawer, linkToDrawerItem },
   };
   return { store: { getState: () => state } as unknown as NoteStore, saveToDrawer, linkToDrawerItem };
}

const addItem = vi.fn(async () => 'NEW_ID');

beforeEach(() => {
   vi.clearAllMocks();
});

describe('saveNote', () => {
   it('overwrites the linked item, stamps references, and does not add a new item', async () => {
      const { store, saveToDrawer } = makeStore({ drawerItemId: 'item-9', linkedItemUpdated: true });

      const result = await saveNote({ store, addItem, currentFolderId: null, t });

      expect(result).toEqual({ needsName: false });
      expect(saveToDrawer).toHaveBeenCalledOnce();
      expect(stampNoteReferencesDrawerSource).toHaveBeenCalledWith('note-1', 'item-9');
      expect(addItem).not.toHaveBeenCalled();
      expect(forkNoteToDrawerItem).not.toHaveBeenCalled();
   });

   it('reports needsName for an unlinked note (first save prompts for a name)', async () => {
      const { store, saveToDrawer, linkToDrawerItem } = makeStore({ drawerItemId: null });

      const result = await saveNote({ store, addItem, currentFolderId: null, t });

      expect(result).toEqual({ needsName: true });
      expect(saveToDrawer).not.toHaveBeenCalled();
      expect(linkToDrawerItem).not.toHaveBeenCalled();
      expect(addItem).not.toHaveBeenCalled();
   });

   it('links + adds a fresh item on a dangling link, keeping the note identity', async () => {
      const { store, linkToDrawerItem } = makeStore({ drawerItemId: 'gone', linkedItemUpdated: false });

      await saveNote({ store, addItem, currentFolderId: 'folder-3', t });

      expect(linkToDrawerItem).toHaveBeenCalledWith('NEW_ID');
      expect(addItem).toHaveBeenCalledWith('My Note', 'NEUTRAL', 'NOTE', AGGREGATE, 'folder-3', 'NEW_ID');
      expect(stampNoteReferencesDrawerSource).toHaveBeenCalledWith('note-1', 'NEW_ID');
      expect(forkNoteToDrawerItem).not.toHaveBeenCalled();
   });
});

describe('saveNoteAs', () => {
   it('links + adds a fresh item with the minted preset id on an unlinked note', async () => {
      const { store, linkToDrawerItem } = makeStore({ drawerItemId: null });

      await saveNoteAs({ store, addItem, currentFolderId: 'folder-1', t }, 'Chosen Name');

      expect(linkToDrawerItem).toHaveBeenCalledWith('NEW_ID');
      expect(addItem).toHaveBeenCalledWith('Chosen Name', 'NEUTRAL', 'NOTE', AGGREGATE, 'folder-1', 'NEW_ID');
      expect(stampNoteReferencesDrawerSource).toHaveBeenCalledWith('note-1', 'NEW_ID');
      expect(forkNoteToDrawerItem).not.toHaveBeenCalled();
   });

   it('forks a linked note to a fresh identity and adds it, leaving references on the original', async () => {
      const { store, linkToDrawerItem } = makeStore({ drawerItemId: 'item-9' });

      await saveNoteAs({ store, addItem, currentFolderId: null, t }, 'Fork Name');

      expect(forkNoteToDrawerItem).toHaveBeenCalledWith('NEW_ID');
      expect(addItem).toHaveBeenCalledWith('Fork Name', 'NEUTRAL', 'NOTE', { id: 'FORK' }, undefined, 'NEW_ID');
      expect(linkToDrawerItem).not.toHaveBeenCalled();
      expect(stampNoteReferencesDrawerSource).not.toHaveBeenCalled();
   });
});
