// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

// -- Type Imports --
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';

/*
 * Pins the four `handleDragEnd` routes that run BEFORE the `!over` guard - the generous tab lane, the
 * folder reorder slot, the geometry-resolved in-drawer move, and the sheet-to-board geometry fallback -
 * plus the order between routes that could both match one drop.
 *
 * Every store the hook writes to is mocked, and every destination-writing action records its name in one
 * ordered ledger, so a case asserts the WHOLE set of writes a drop produced. That is what catches a
 * fall-through: a route that stops returning lets a SECOND route write on the same drop, and the extra
 * name appears in the ledger even though the case's own expectation still holds.
 */

const mocks = vi.hoisted(() => {
   const ledger: string[] = [];
   const write = (name: string, result?: unknown) => vi.fn(() => { ledger.push(name); return result; });
   const boardAddItem = write('board:addItem');
   return {
      ledger,
      write,
      boardAddItem,
      character: null as Record<string, unknown> | null,
      currentFolderId: null as string | null,
      currentFolderView: null as { items: { id: string }[] } | null,
      // Successive `getChildFolders` answers; the cross-view slot path reads twice (before the move and
      // after the tree settles), so it is a queue rather than one value.
      folderScopes: [[]] as { id: string }[][],
      generalState: { isDrawerExpanded: false, isDrawerReceded: false },
      activeBoardStore: null as unknown,
      boardStore: {
         getState: () => ({ viewport: { x: 0, y: 0, zoom: 1 }, items: {}, actions: { addItem: boardAddItem } }),
      },
      drawerActions: {
         initiateItemDrop: write('initiateItemDrop'),
         moveFolder: write('moveFolder', Promise.resolve()),
         reorderFolders: write('reorderFolders', Promise.resolve()),
         moveItem: write('moveItem', Promise.resolve()),
         reorderItems: write('reorderItems', Promise.resolve()),
         setDrawerCurrentFolderId: vi.fn(),
      },
      characterActions: {
         reorderSheetLayout: write('reorderSheetLayout'),
         reorderStatuses: write('reorderStatuses'),
         reorderStoryTags: write('reorderStoryTags'),
         reorderStoryThemes: write('reorderStoryThemes'),
         addImportedCard: write('addImportedCard', true),
         addImportedTracker: write('addImportedTracker'),
         addImportedJournal: write('addImportedJournal'),
      },
      tabActions: {
         openCharacterTab: write('openCharacterTab'),
         openBoardTab: write('openBoardTab'),
         openNoteTab: write('openNoteTab'),
         reorderTabs: write('reorderTabs'),
         setActiveTab: write('setActiveTab'),
      },
      settingsActions: { setContextualGame: write('setContextualGame') },
      generalActions: { setDrawerOpen: vi.fn(), setDrawerReceded: vi.fn(), contractDrawer: vi.fn() },
      morph: {
         captureGrab: vi.fn(), setCursor: vi.fn(), setMorph: vi.fn(), setIdentity: vi.fn(),
         reset: vi.fn(), renderClone: vi.fn(), renderCluster: vi.fn(),
      },
      toastError: vi.fn(),
      toastSuccess: vi.fn(),
   };
});

vi.mock('@/lib/stores/characterStore', () => ({
   useCharacterStore: Object.assign(
      (selector: (state: { character: unknown }) => unknown) => selector({ character: mocks.character }),
      { getState: () => ({ character: mocks.character }) },
   ),
   useCharacterActions: () => mocks.characterActions,
}));
vi.mock('@/lib/stores/drawerStore', () => ({
   useDrawerStore: Object.assign(
      (selector: (state: { currentFolderView: unknown }) => unknown) => selector({ currentFolderView: mocks.currentFolderView }),
      { getState: () => ({ currentFolderId: mocks.currentFolderId, currentFolderView: mocks.currentFolderView }) },
   ),
   useDrawerActions: () => mocks.drawerActions,
}));
vi.mock('@/lib/character/tabManagerStore', () => ({
   useTabManagerActions: () => mocks.tabActions,
   useTabManagerStore: { getState: () => ({ openTabs: [], activeTabId: null }) },
}));
vi.mock('@/lib/stores/appSettingsStore', () => ({ useAppSettingsActions: () => mocks.settingsActions }));
vi.mock('@/lib/stores/appGeneralStateStore', () => ({
   useAppGeneralStateActions: () => mocks.generalActions,
   useAppGeneralStateStore: { getState: () => mocks.generalState },
}));
vi.mock('@/lib/board/boardStoreRegistry', () => ({
   getActiveBoardStore: () => mocks.activeBoardStore,
   getOrCreateBoardInstance: () => mocks.boardStore,
}));
vi.mock('@/lib/character/characterStoreRegistry', () => ({ getOrCreateInstance: () => ({ getState: () => ({ character: null }) }) }));
vi.mock('@/lib/notes/noteStoreRegistry', () => ({ getOrCreateNoteInstance: () => ({ getState: () => ({ noteId: null, note: null }) }) }));
vi.mock('@/lib/board/boardRepository', () => ({ importBoard: mocks.write('importBoard', Promise.resolve()) }));
vi.mock('@/lib/notes/noteRepository', () => ({ importNote: mocks.write('importNote', Promise.resolve()) }));
vi.mock('@/lib/board/refreezeNoteReferences', () => ({ stampNoteReferencesDrawerSource: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/drawer/drawerFolderTree', () => ({
   getChildFolders: () => (mocks.folderScopes.length > 1 ? mocks.folderScopes.shift() : mocks.folderScopes[0]),
   getParentFolderId: () => null,
   whenFolderTreeSettled: () => Promise.resolve(),
}));
vi.mock('react-hot-toast', () => ({ default: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/molecules/drag-morph/useDragMorph', () => ({ useDragMorph: () => mocks.morph }));
vi.mock('@/hooks/character-sheet/buildDragIdentity', () => ({ buildDragIdentity: () => null }));

import { useCharacterSheetDnD } from '../useCharacterSheetDnD';

type Data = Record<string, unknown>;
type OverSpec = { id: string; data?: Data };

/** An element the live-geometry resolvers can hit-test, with its rect stubbed (jsdom measures nothing). */
function mountRect(attribute: string, box: { left: number; top: number; right: number; bottom: number }): void {
   const el = document.createElement('div');
   const [name, value] = attribute.split('=');
   el.setAttribute(name, value ?? '');
   el.getBoundingClientRect = () => ({
      ...box, width: box.right - box.left, height: box.bottom - box.top, x: box.left, y: box.top, toJSON: () => ({}),
   }) as DOMRect;
   document.body.appendChild(el);
}

const startEvent = (id: string, data: Data) =>
   ({ active: { id, data: { current: data }, rect: { current: { initial: null } } }, activatorEvent: null }) as unknown as DragStartEvent;

const endEvent = (id: string, data: Data, over: OverSpec | null) =>
   ({
      active: { id, data: { current: data } },
      over: over ? { id: over.id, data: { current: over.data ?? {} } } : null,
   }) as unknown as DragEndEvent;

function mountDnD() {
   const view = renderHook(() => useCharacterSheetDnD());
   return {
      start: (id: string, data: Data) => act(() => { view.result.current.handleDragStart(startEvent(id, data)); }),
      move: (x: number, y: number) => act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y })); }),
      end: (id: string, data: Data, over: OverSpec | null) => act(() => { view.result.current.handleDragEnd(endEvent(id, data, over)); }),
   };
}

const card = (id: string, game = 'LEGENDS') => ({ id, cardType: 'CHARACTER_CARD', title: id, details: { game } });
const makeCharacter = (id: string, game = 'LEGENDS', cards: unknown[] = []) => ({
   id, game, cards, journals: [], trackers: { statuses: [], storyTags: [], storyThemes: [] },
});
const drawerItem = (id: string, type: string, game = 'LEGENDS', content: unknown = {}) => ({ id, type, game, content });
const itemDrag = (item: unknown) => ({ type: 'drawer-item', isDrawer: true, item });
const folderDrag = (item: unknown) => ({ type: 'drawer-folder', isDrawer: true, item });

beforeEach(() => {
   mocks.ledger.length = 0;
   vi.clearAllMocks();
   mocks.character = null;
   mocks.currentFolderId = null;
   mocks.currentFolderView = null;
   mocks.folderScopes = [[]];
   mocks.generalState = { isDrawerExpanded: false, isDrawerReceded: false };
   mocks.activeBoardStore = null;
});
afterEach(() => {
   cleanup();
   document.body.innerHTML = '';
});

describe('handleDragEnd pre-guard routes', () => {
   it('opens a tab for a character released in the generous lane, with no drawer write', () => {
      mountRect('data-tab-strip', { left: 0, top: 0, right: 800, bottom: 40 });
      const item = drawerItem('i1', 'FULL_CHARACTER_SHEET', 'LEGENDS', { id: 'c9', game: 'LEGENDS' });
      const dnd = mountDnD();

      dnd.start('i1', itemDrag(item));
      dnd.move(100, 30);
      dnd.end('i1', itemDrag(item), null);

      expect(mocks.ledger).toEqual(['openCharacterTab', 'setContextualGame']);
   });

   it('reorders a folder onto a slot in the same view without ever moving it', () => {
      mocks.folderScopes = [[{ id: 'fA' }, { id: 'fB' }, { id: 'fC' }]];
      const folder = { id: 'fA' };
      const dnd = mountDnD();

      dnd.start('fA', folderDrag(folder));
      dnd.end('fA', folderDrag(folder), { id: 'slot-fC', data: { type: 'drawer-drop-zone', targetId: 'fC' } });

      expect(mocks.ledger).toEqual(['reorderFolders']);
      expect(mocks.drawerActions.reorderFolders).toHaveBeenCalledWith(null, 0, 1);
   });

   it('moves then reorders a folder dropped on a slot from another view, in that order (two undo steps)', async () => {
      mocks.folderScopes = [[{ id: 'fB' }, { id: 'fC' }], [{ id: 'fB' }, { id: 'fC' }, { id: 'fA' }]];
      const folder = { id: 'fA' };
      const dnd = mountDnD();

      dnd.start('fA', folderDrag(folder));
      dnd.end('fA', folderDrag(folder), { id: 'slot-fB', data: { type: 'drawer-drop-zone', targetId: 'fB' } });

      await waitFor(() => { expect(mocks.ledger).toEqual(['moveFolder', 'reorderFolders']); });
      expect(mocks.drawerActions.reorderFolders).toHaveBeenCalledWith(null, 2, 0);
   });

   it('nests an item into the geometry-resolved folder row even when dnd-kit reports no target', () => {
      mountRect('data-drawer-panel', { left: 0, top: 0, right: 300, bottom: 900 });
      mountRect('data-folder-id=f2', { left: 10, top: 100, right: 290, bottom: 140 });
      const item = drawerItem('i1', 'CHARACTER_CARD');
      const dnd = mountDnD();

      dnd.start('i1', itemDrag(item));
      dnd.move(150, 120);
      dnd.end('i1', itemDrag(item), null);

      expect(mocks.ledger).toEqual(['moveItem']);
      expect(mocks.drawerActions.moveItem).toHaveBeenCalledWith('i1', 'f2');
   });

   it('falls through to the reorder path when the current-folder target already holds the item', () => {
      mocks.currentFolderId = 'f1';
      mocks.currentFolderView = { items: [{ id: 'i1' }, { id: 'i2' }] };
      mountRect('data-drawer-panel', { left: 0, top: 0, right: 300, bottom: 900 });
      mountRect('data-drawer-items-area', { left: 0, top: 200, right: 300, bottom: 800 });
      const item = drawerItem('i1', 'CHARACTER_CARD');
      const dnd = mountDnD();

      dnd.start('i1', itemDrag(item));
      dnd.move(150, 400);
      dnd.end('i1', { ...itemDrag(item), parentFolderId: 'f1' }, { id: 'i2', data: { type: 'drawer-item', parentFolderId: 'f1' } });

      expect(mocks.ledger).toEqual(['reorderItems']);
      expect(mocks.drawerActions.reorderItems).toHaveBeenCalledWith('f1', 0, 1);
   });

   it('drops a sheet item on the board by cursor geometry when dnd-kit never measured the canvas', () => {
      mocks.activeBoardStore = mocks.boardStore;
      mocks.character = makeCharacter('cA', 'LEGENDS', [card('sc1')]);
      mountRect('data-board-clip', { left: 400, top: 100, right: 1200, bottom: 800 });
      const data = { type: 'sheet-card' };
      const dnd = mountDnD();

      dnd.start('sc1', data);
      dnd.move(700, 400);
      dnd.end('sc1', data, null);

      expect(mocks.ledger).toEqual(['board:addItem']);
   });
});

/*
 * The ordering half. Each drop below matches TWO routes; the assertion is that the earlier one wins and
 * the later one never runs, which is what a reordered chain (or a route that stops returning) breaks.
 */
describe('handleDragEnd route ordering', () => {
   it('opens the tab exactly once when the lane release also lands on the play-area zone', () => {
      mountRect('data-tab-strip', { left: 0, top: 0, right: 800, bottom: 40 });
      const item = drawerItem('i1', 'FULL_CHARACTER_SHEET', 'LEGENDS', { id: 'c9', game: 'LEGENDS' });
      const dnd = mountDnD();

      dnd.start('i1', itemDrag(item));
      dnd.move(100, 30);
      dnd.end('i1', itemDrag(item), { id: 'main-character-drop-zone' });

      expect(mocks.ledger).toEqual(['openCharacterTab', 'setContextualGame']);
   });

   it('lets the folder slot beat the geometry resolver when both resolve a target', () => {
      mocks.folderScopes = [[{ id: 'fA' }, { id: 'fB' }, { id: 'fC' }]];
      mountRect('data-drawer-panel', { left: 0, top: 0, right: 300, bottom: 900 });
      mountRect('data-folder-id=fB', { left: 10, top: 100, right: 290, bottom: 140 });
      const folder = { id: 'fA' };
      const dnd = mountDnD();

      dnd.start('fA', folderDrag(folder));
      dnd.move(150, 120);
      dnd.end('fA', folderDrag(folder), { id: 'slot-fC', data: { type: 'drawer-drop-zone', targetId: 'fC' } });

      expect(mocks.ledger).toEqual(['reorderFolders']);
      expect(mocks.drawerActions.moveFolder).not.toHaveBeenCalled();
   });

   it('lets the geometry-resolved drawer target beat the board drop zone', () => {
      mocks.activeBoardStore = mocks.boardStore;
      mountRect('data-drawer-panel', { left: 0, top: 0, right: 300, bottom: 900 });
      mountRect('data-folder-id=f2', { left: 10, top: 100, right: 290, bottom: 140 });
      const item = drawerItem('i1', 'CHARACTER_CARD');
      const dnd = mountDnD();

      dnd.start('i1', itemDrag(item));
      dnd.move(150, 120);
      dnd.end('i1', itemDrag(item), { id: 'board-drop-zone' });

      expect(mocks.ledger).toEqual(['moveItem']);
      expect(mocks.boardAddItem).not.toHaveBeenCalled();
   });

   it('lets the sheet-to-board fallback beat the sheet reorder path', () => {
      mocks.activeBoardStore = mocks.boardStore;
      mocks.character = makeCharacter('cA', 'LEGENDS', [card('sc1'), card('sc2')]);
      mountRect('data-board-clip', { left: 400, top: 100, right: 1200, bottom: 800 });
      const data = { type: 'sheet-card' };
      const dnd = mountDnD();

      dnd.start('sc1', data);
      dnd.move(700, 400);
      dnd.end('sc1', data, { id: 'sc2', data: { type: 'sheet-card' } });

      expect(mocks.ledger).toEqual(['board:addItem']);
      expect(mocks.characterActions.reorderSheetLayout).not.toHaveBeenCalled();
   });
});
