// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

// -- Type Imports --
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';

/*
 * Pins the three `handleDragEnd` branches that run AFTER the `!over` guard - tab, drawer-sourced and
 * sheet-sourced - one case per destination, plus the branch-crossing drops (a game mismatch, and a sheet
 * item landing on ANOTHER character's sheet after a mid-drag tab navigation).
 *
 * Same ledger discipline as the pre-guard routes: every destination-writing action records its name, so
 * each case asserts the whole set of writes one drop produced. A branch that stops returning shows up as
 * a second name here, not as a failed expectation on its own route.
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
      currentFolderView: null as { items: { id: string }[] } | null,
      openTabs: [] as { id: string; type: string }[],
      tabCharacter: null as Record<string, unknown> | null,
      generalState: { isDrawerExpanded: false, isDrawerReceded: false },
      activeBoardStore: null as unknown,
      boardStore: {
         getState: () => ({ viewport: { x: 0, y: 0, zoom: 1 }, items: {}, actions: { addItem: boardAddItem } }),
      },
      boardInstance: {
         getState: () => ({ boardId: 'b1', name: 'Board', actions: { linkToDrawerItem: () => Promise.resolve({ id: 'b1' }) } }),
      },
      noteInstance: {
         getState: () => ({ noteId: 'n1', note: { title: 'Note' }, actions: { linkToDrawerItem: () => Promise.resolve({ id: 'n1' }) } }),
      },
      stampNoteReferences: write('stampNoteReferencesDrawerSource', Promise.resolve()),
      linkToDrawerItem: vi.fn(),
      setHasUnsavedChanges: vi.fn(),
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
      { getState: () => ({ currentFolderId: null, currentFolderView: mocks.currentFolderView }) },
   ),
   useDrawerActions: () => mocks.drawerActions,
}));
vi.mock('@/lib/character/tabManagerStore', () => ({
   useTabManagerActions: () => mocks.tabActions,
   useTabManagerStore: { getState: () => ({ openTabs: mocks.openTabs, activeTabId: null }) },
}));
vi.mock('@/lib/stores/appSettingsStore', () => ({ useAppSettingsActions: () => mocks.settingsActions }));
vi.mock('@/lib/stores/appGeneralStateStore', () => ({
   useAppGeneralStateActions: () => mocks.generalActions,
   useAppGeneralStateStore: { getState: () => mocks.generalState },
}));
vi.mock('@/lib/board/boardStoreRegistry', () => ({
   getActiveBoardStore: () => mocks.activeBoardStore,
   getOrCreateBoardInstance: () => mocks.boardInstance,
}));
vi.mock('@/lib/character/characterStoreRegistry', () => ({
   getOrCreateInstance: () => ({
      getState: () => ({
         character: mocks.tabCharacter,
         actions: { linkToDrawerItem: mocks.linkToDrawerItem, setHasUnsavedChanges: mocks.setHasUnsavedChanges },
      }),
   }),
}));
vi.mock('@/lib/notes/noteStoreRegistry', () => ({ getOrCreateNoteInstance: () => mocks.noteInstance }));
vi.mock('@/lib/board/boardRepository', () => ({ importBoard: mocks.write('importBoard', Promise.resolve()) }));
vi.mock('@/lib/notes/noteRepository', () => ({ importNote: mocks.write('importNote', Promise.resolve()) }));
vi.mock('@/lib/board/refreezeNoteReferences', () => ({ stampNoteReferencesDrawerSource: mocks.stampNoteReferences }));
vi.mock('@/lib/drawer/drawerFolderTree', () => ({
   getChildFolders: () => [],
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
      end: (id: string, data: Data, over: OverSpec | null) => act(() => { view.result.current.handleDragEnd(endEvent(id, data, over)); }),
      rerender: () => act(() => { view.rerender(); }),
   };
}

const card = (id: string, game = 'LEGENDS') => ({ id, cardType: 'CHARACTER_CARD', title: id, details: { game } });
const tracker = (id: string) => ({ id, trackerType: 'STATUS', name: id });
const makeCharacter = (id: string, game = 'LEGENDS', cards: unknown[] = [], statuses: unknown[] = []) => ({
   id, game, cards, journals: [], trackers: { statuses, storyTags: [], storyThemes: [] },
});
const drawerItem = (id: string, type: string, game = 'LEGENDS', content: unknown = {}) => ({ id, type, game, content });
const itemDrag = (item: unknown) => ({ type: 'drawer-item', isDrawer: true, item });
const tabDrag = (tabId: string) => ({ type: 'tab', tabId });

beforeEach(() => {
   mocks.ledger.length = 0;
   vi.clearAllMocks();
   mocks.character = null;
   mocks.currentFolderView = null;
   mocks.openTabs = [];
   mocks.tabCharacter = null;
   mocks.generalState = { isDrawerExpanded: false, isDrawerReceded: false };
   mocks.activeBoardStore = null;
});
afterEach(() => {
   cleanup();
   document.body.innerHTML = '';
});

describe('handleDragEnd BRANCH 0 (tab)', () => {
   it('reorders the strip when a tab lands on another tab', () => {
      mocks.openTabs = [{ id: 't1', type: 'character' }, { id: 't2', type: 'character' }];
      const dnd = mountDnD();

      dnd.start('t1', tabDrag('t1'));
      dnd.end('t1', tabDrag('t1'), { id: 't2', data: { type: 'tab' } });

      expect(mocks.ledger).toEqual(['reorderTabs']);
   });

   it('saves a character tab as a new linked drawer copy, asserting the tab clean afterwards', () => {
      mocks.openTabs = [{ id: 't1', type: 'character' }];
      mocks.tabCharacter = makeCharacter('t1');
      const dnd = mountDnD();

      dnd.start('t1', tabDrag('t1'));
      dnd.end('t1', tabDrag('t1'), { id: 'drawer-drop-zone-root', data: { type: 'drawer-item' } });

      expect(mocks.ledger).toEqual(['initiateItemDrop']);
      expect(mocks.linkToDrawerItem).toHaveBeenCalledTimes(1);
      expect(mocks.setHasUnsavedChanges).toHaveBeenCalledWith(false);
   });

   it('routes a BOARD tab save through the board aggregate, not the character path', async () => {
      mocks.openTabs = [{ id: 'b1', type: 'board' }];
      const dnd = mountDnD();

      dnd.start('b1', tabDrag('b1'));
      dnd.end('b1', tabDrag('b1'), { id: 'drawer-drop-zone-root', data: { type: 'drawer-item' } });

      await waitFor(() => { expect(mocks.ledger).toEqual(['initiateItemDrop']); });
      expect(mocks.linkToDrawerItem).not.toHaveBeenCalled();
   });

   /*
    * A NOTE tab save stamps every board reference to the once-tab-only note with the new drawer source
    * BEFORE the item is minted. The order is the contract, so the ledger pins the sequence rather than
    * just asserting both calls happened.
    */
   it('stamps the note references before minting the drawer item on a NOTE tab save', async () => {
      mocks.openTabs = [{ id: 'n1', type: 'note' }];
      const dnd = mountDnD();

      dnd.start('n1', tabDrag('n1'));
      dnd.end('n1', tabDrag('n1'), { id: 'drawer-drop-zone-root', data: { type: 'drawer-item' } });

      await waitFor(() => { expect(mocks.ledger).toEqual(['stampNoteReferencesDrawerSource', 'initiateItemDrop']); });
   });

   it('adds a character element when a tab lands on the board', () => {
      mocks.activeBoardStore = mocks.boardStore;
      mocks.openTabs = [{ id: 't1', type: 'character' }];
      mocks.tabCharacter = makeCharacter('t1');
      const dnd = mountDnD();

      dnd.start('t1', tabDrag('t1'));
      dnd.end('t1', tabDrag('t1'), { id: 'board-drop-zone' });

      expect(mocks.ledger).toEqual(['board:addItem']);
   });
});

describe('handleDragEnd BRANCH 1 (from the drawer)', () => {
   it('embeds a drawer item dropped on the board canvas', () => {
      mocks.activeBoardStore = mocks.boardStore;
      const item = drawerItem('i1', 'CHARACTER_CARD', 'LEGENDS', card('c1'));
      const dnd = mountDnD();

      dnd.start('i1', itemDrag(item));
      dnd.end('i1', itemDrag(item), { id: 'board-drop-zone' });

      expect(mocks.ledger).toEqual(['board:addItem']);
   });

   it('opens a character dropped on the play area', () => {
      const item = drawerItem('i1', 'FULL_CHARACTER_SHEET', 'LEGENDS', { id: 'c9', game: 'LEGENDS' });
      const dnd = mountDnD();

      dnd.start('i1', itemDrag(item));
      dnd.end('i1', itemDrag(item), { id: 'main-character-drop-zone' });

      expect(mocks.ledger).toEqual(['openCharacterTab', 'setContextualGame']);
   });

   it('opens a character dropped on the tab strip zone', () => {
      const item = drawerItem('i1', 'FULL_CHARACTER_SHEET', 'LEGENDS', { id: 'c9', game: 'LEGENDS' });
      const dnd = mountDnD();

      dnd.start('i1', itemDrag(item));
      dnd.end('i1', itemDrag(item), { id: 'tab-strip-drop-zone' });

      expect(mocks.ledger).toEqual(['openCharacterTab', 'setContextualGame']);
   });

   it('imports a compatible component dropped on the sheet', () => {
      mocks.character = makeCharacter('cA');
      const item = drawerItem('i1', 'CHARACTER_CARD', 'LEGENDS', card('c1'));
      const dnd = mountDnD();

      dnd.start('i1', itemDrag(item));
      dnd.end('i1', itemDrag(item), { id: 'character-sheet-main-drop-zone' });

      expect(mocks.ledger).toEqual(['addImportedCard']);
   });

   it('rejects a game-mismatched component with a toast and no import', () => {
      mocks.character = makeCharacter('cA', 'LEGENDS');
      const item = drawerItem('i1', 'CHARACTER_CARD', 'CITY_OF_MIST', card('c1', 'CITY_OF_MIST'));
      const dnd = mountDnD();

      dnd.start('i1', itemDrag(item));
      dnd.end('i1', itemDrag(item), { id: 'character-sheet-main-drop-zone' });

      expect(mocks.ledger).toEqual([]);
      expect(mocks.toastError).toHaveBeenCalledTimes(1);
   });
});

describe('handleDragEnd BRANCH 2 (from the sheet)', () => {
   it('embeds a sheet component dropped on the board canvas', () => {
      mocks.activeBoardStore = mocks.boardStore;
      mocks.character = makeCharacter('cA', 'LEGENDS', [card('sc1')]);
      const data = { type: 'sheet-card' };
      const dnd = mountDnD();

      dnd.start('sc1', data);
      dnd.end('sc1', data, { id: 'board-drop-zone' });

      expect(mocks.ledger).toEqual(['board:addItem']);
   });

   /*
    * The cross-character import path does NOT fire today: the source-character ref it keys off is one of
    * the refs `clearDragFeedback` clears at the top of the handler, and unlike the four snapshotted refs
    * it is read afterwards, so it is always null by the time the branch tests it. A drop on another
    * character's sheet therefore falls through to the reorder path. Pinned as the current behaviour, so
    * that restoring the import is a deliberate change rather than a side effect of moving the teardown.
    */
   it('falls through to reorder when the active character changed mid-drag (the source ref is already cleared)', () => {
      mocks.character = makeCharacter('cA', 'LEGENDS', [card('sc1')]);
      const data = { type: 'sheet-card' };
      const dnd = mountDnD();

      dnd.start('sc1', data);
      mocks.character = makeCharacter('cB', 'LEGENDS', [card('other')]);
      dnd.rerender();
      dnd.end('sc1', data, { id: 'other', data: { type: 'sheet-card' } });

      expect(mocks.ledger).toEqual(['reorderSheetLayout']);
      expect(mocks.characterActions.addImportedCard).not.toHaveBeenCalled();
   });

   it('saves a sheet component dropped on the drawer', () => {
      mocks.character = makeCharacter('cA', 'LEGENDS', [card('sc1')]);
      const data = { type: 'sheet-card' };
      const dnd = mountDnD();

      dnd.start('sc1', data);
      dnd.end('sc1', data, { id: 'drawer-drop-zone-root', data: { type: 'drawer-item' } });

      expect(mocks.ledger).toEqual(['initiateItemDrop']);
   });

   it('reorders the manifest when a card lands on another card of the same sheet', () => {
      mocks.character = makeCharacter('cA', 'LEGENDS', [card('sc1'), card('sc2')]);
      const data = { type: 'sheet-card' };
      const dnd = mountDnD();

      dnd.start('sc1', data);
      dnd.end('sc1', data, { id: 'sc2', data: { type: 'sheet-card' } });

      expect(mocks.ledger).toEqual(['reorderSheetLayout']);
      expect(mocks.characterActions.reorderSheetLayout).toHaveBeenCalledWith('sc1', 'sc2');
   });

   it('reorders a tracker against a sibling of its own type', () => {
      mocks.character = makeCharacter('cA', 'LEGENDS', [], [tracker('st1'), tracker('st2')]);
      const data = { type: 'sheet-tracker', item: tracker('st1') };
      const dnd = mountDnD();

      dnd.start('st1', data);
      dnd.end('st1', data, { id: 'st2', data: { type: 'sheet-tracker', item: tracker('st2') } });

      expect(mocks.ledger).toEqual(['reorderStatuses']);
      expect(mocks.characterActions.reorderStatuses).toHaveBeenCalledWith(0, 1);
   });

   // The self-drop is intercepted by the router's own `active.id === over.id` guard, upstream of every
   // route; the reorder never sees one.
   it('writes nothing when a tracker is dropped back on itself', () => {
      mocks.character = makeCharacter('cA', 'LEGENDS', [], [tracker('st1'), tracker('st2')]);
      const data = { type: 'sheet-tracker', item: tracker('st1') };
      const dnd = mountDnD();

      dnd.start('st1', data);
      dnd.end('st1', data, { id: 'st1', data: { type: 'sheet-tracker', item: tracker('st1') } });

      expect(mocks.ledger).toEqual([]);
   });

   it('writes nothing when a tracker lands on another tracker type', () => {
      // The target id resolves inside the active's own group, so only the trackerType check refuses it.
      mocks.character = makeCharacter('cA', 'LEGENDS', [], [tracker('st1'), tracker('st2')]);
      const data = { type: 'sheet-tracker', item: tracker('st1') };
      const overTag = { id: 'st2', trackerType: 'STORY_TAG', name: 'st2' };
      const dnd = mountDnD();

      dnd.start('st1', data);
      dnd.end('st1', data, { id: 'st2', data: { type: 'sheet-tracker', item: overTag } });

      expect(mocks.ledger).toEqual([]);
   });
});
