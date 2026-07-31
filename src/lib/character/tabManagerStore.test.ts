// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import { useTabManagerStore, runCharacterBoot, __resetMobileKeepAliveForTest } from './tabManagerStore';
import {
   SINGLE_ACTIVE_INSTANCE_ID,
   disposeInstance,
   getActiveCharacterStore,
   getCharacterInstanceIds,
   getOrCreateInstance,
} from './characterStoreRegistry';
import { detachPersistenceHandle, useCharacterBootStore } from './characterPersistence';
import { saveCharacter, getCharacter } from './characterRepository';
import { readWorkspace, writeWorkspace, WORKSPACE_KEY } from './workspaceSession';
import { ACTIVE_CHARACTER_ID_KEY } from './characterSession';
import {
   disposeBoardInstance,
   getActiveBoardStore,
   getBoardInstanceIds,
   getOrCreateBoardInstance,
   setActiveBoardInstance,
} from '@/lib/board/boardStoreRegistry';
import { createBoard, getBoard } from '@/lib/board/boardRepository';
import * as deviceTypeModule from '@/hooks/useDeviceType';

// -- Type Imports --
import type { Character } from '@/lib/types/character';

/*
 * Tests for the multi-tab TabManager: lifted cap (keep-alive, focus-or-add),
 * workspace persistence + backward seed, and boot restore-of-many. Runs against
 * fake-indexeddb plus an in-memory localStorage shim.
 */

function installLocalStorageShim(): void {
   const store = new Map<string, string>();
   (globalThis as unknown as { localStorage: Storage }).localStorage = {
      get length() {
         return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      removeItem: (key: string) => void store.delete(key),
      setItem: (key: string, value: string) => void store.set(key, String(value)),
   };
}

function makeCharacter(id: string, overrides: Partial<Character> = {}): Character {
   return {
      id,
      name: 'Hero',
      game: 'LEGENDS',
      cards: [],
      journals: [],
      sheetLayout: [],
      trackers: { statuses: [], storyTags: [], storyThemes: [] },
      ...overrides,
   } as Character;
}

const FIXTURE_IDS = ['A', 'B', 'C', 'D', 'old', 'gone', SINGLE_ACTIVE_INSTANCE_ID];

beforeEach(async () => {
   installLocalStorageShim();
   await drawerDatabase.characters.clear();
   await drawerDatabase.meta.clear();
   await drawerDatabase.boards.clear();
   await drawerDatabase.boardItems.clear();
   useTabManagerStore.setState({ openTabs: [], activeTabId: null });
   __resetMobileKeepAliveForTest();
});

afterEach(async () => {
   vi.restoreAllMocks();
   // Keep-alive can leave several live instances (including re-minted import ids); sweep them all.
   getCharacterInstanceIds().forEach((id) => {
      detachPersistenceHandle(id);
      disposeInstance(id);
   });
   FIXTURE_IDS.forEach((id) => {
      detachPersistenceHandle(id);
      disposeInstance(id);
   });
   getBoardInstanceIds().forEach((id) => disposeBoardInstance(id));
   setActiveBoardInstance(null);
   useTabManagerStore.setState({ openTabs: [], activeTabId: null });
   await new Promise((resolve) => setTimeout(resolve, 0));
});

describe('multi-tab lifecycle (keep-alive)', () => {
   it('opens three live tabs and switches active without disposing', () => {
      const actions = useTabManagerStore.getState().actions;
      actions.openCharacterTab(makeCharacter('A'));
      actions.openCharacterTab(makeCharacter('B'));
      actions.openCharacterTab(makeCharacter('C'));

      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['A', 'B', 'C']);
      expect(useTabManagerStore.getState().activeTabId).toBe('C');

      const instA = getOrCreateInstance('A');
      const instC = getOrCreateInstance('C');

      actions.setActiveTab('A');
      expect(useTabManagerStore.getState().activeTabId).toBe('A');
      expect(getActiveCharacterStore()).toBe(instA);
      // Switching disposes nothing: A and C are the same instances as before.
      expect(getOrCreateInstance('C')).toBe(instC);
      expect(getOrCreateInstance('A')).toBe(instA);
   });

   it('closeTab disposes only that tab and activates a neighbour (right, else left, else menu)', () => {
      const actions = useTabManagerStore.getState().actions;
      actions.openCharacterTab(makeCharacter('A'));
      actions.openCharacterTab(makeCharacter('B'));
      actions.openCharacterTab(makeCharacter('C'));
      actions.setActiveTab('B');

      const instB = getOrCreateInstance('B');
      const instA = getOrCreateInstance('A');

      actions.closeTab('B');
      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['A', 'C']);
      expect(useTabManagerStore.getState().activeTabId).toBe('C'); // right neighbour
      expect(getOrCreateInstance('B')).not.toBe(instB); // B disposed (re-created here)
      expect(getOrCreateInstance('A')).toBe(instA); // A kept alive
      disposeInstance('B'); // clean up the re-created stub

      actions.closeTab('C'); // active, rightmost -> left neighbour A
      expect(useTabManagerStore.getState().activeTabId).toBe('A');

      actions.closeTab('A'); // last tab -> menu fallback
      expect(useTabManagerStore.getState().openTabs).toEqual([]);
      expect(useTabManagerStore.getState().activeTabId).toBeNull();
      expect(getActiveCharacterStore()).toBe(getOrCreateInstance(SINGLE_ACTIVE_INSTANCE_ID));
   });

   it('closing a background tab leaves the active tab untouched', () => {
      const actions = useTabManagerStore.getState().actions;
      actions.openCharacterTab(makeCharacter('A'));
      actions.openCharacterTab(makeCharacter('B'));
      actions.setActiveTab('B');
      const instB = getOrCreateInstance('B');

      actions.closeTab('A'); // background

      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['B']);
      expect(useTabManagerStore.getState().activeTabId).toBe('B');
      expect(getOrCreateInstance('B')).toBe(instB);
   });
});

describe('closeTab deletes the working record', () => {
   it('removes the character record from storage when a tab is closed for good', async () => {
      await saveCharacter(makeCharacter('A', { name: 'Alpha' }));
      const actions = useTabManagerStore.getState().actions;
      actions.openCharacterTab(makeCharacter('A', { name: 'Alpha' }), 'drawer-1');

      expect(await getCharacter('A')).not.toBeUndefined();

      actions.closeTab('A');
      // The delete is fire-and-forget; let the microtask settle.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(await getCharacter('A')).toBeUndefined();
   });
});

describe('unsaved-changes tracking', () => {
   it('starts clean when opened from the drawer and dirty when imported (no link)', () => {
      const actions = useTabManagerStore.getState().actions;

      actions.openCharacterTab(makeCharacter('A'), 'drawer-1'); // from the drawer
      expect(getOrCreateInstance('A').getState().hasUnsavedChanges).toBe(false);

      actions.openCharacterTab(makeCharacter('B')); // import / new (no drawer link)
      expect(getOrCreateInstance('B').getState().hasUnsavedChanges).toBe(true);
   });

   it('marks a clean tab dirty on the first content change', () => {
      const actions = useTabManagerStore.getState().actions;
      actions.openCharacterTab(makeCharacter('A'), 'drawer-1');
      const instA = getOrCreateInstance('A');
      expect(instA.getState().hasUnsavedChanges).toBe(false);

      instA.getState().actions.updateCharacterName('Renamed');
      expect(instA.getState().hasUnsavedChanges).toBe(true);
   });

   it('marks clean after a save links the tab to a drawer item (beats the re-dirty subscription)', () => {
      const actions = useTabManagerStore.getState().actions;
      actions.openCharacterTab(makeCharacter('A')); // imported -> dirty
      const instA = getOrCreateInstance('A');
      instA.getState().actions.updateCharacterName('Edited');
      expect(instA.getState().hasUnsavedChanges).toBe(true);

      // The tab->drawer save pattern: relink, then assert clean. linkToDrawerItem swaps
      // the character reference, so the change subscription re-dirties synchronously;
      // the explicit clean must win.
      instA.getState().actions.linkToDrawerItem('drawer-9');
      instA.getState().actions.setHasUnsavedChanges(false);
      expect(instA.getState().hasUnsavedChanges).toBe(false);
   });
});

describe('focus-or-add', () => {
   it('focuses an already-open character without reloading it (state + undo preserved)', () => {
      const actions = useTabManagerStore.getState().actions;
      actions.openCharacterTab(makeCharacter('A', { name: 'Original' }));
      const instA = getOrCreateInstance('A');
      instA.getState().actions.updateCharacterName('Edited');
      const pastBefore = instA.temporal.getState().pastStates.length;

      // Re-open the same id with different content -> must focus, not rebuild.
      actions.openCharacterTab(makeCharacter('B'));
      actions.openCharacterTab(makeCharacter('A', { name: 'WOULD-CLOBBER' }));

      expect(getOrCreateInstance('A')).toBe(instA); // same instance
      expect(instA.getState().character?.name).toBe('Edited'); // not reloaded
      expect(instA.temporal.getState().pastStates.length).toBe(pastBefore); // undo intact
      expect(useTabManagerStore.getState().activeTabId).toBe('A'); // focused
   });
});

describe('workspace persistence + backward seed', () => {
   it('persists the workspace on every mutating action', () => {
      const actions = useTabManagerStore.getState().actions;
      actions.openCharacterTab(makeCharacter('A'));
      actions.openCharacterTab(makeCharacter('B'));

      const persisted = readWorkspace();
      expect(persisted.openTabs.map((t) => t.id)).toEqual(['A', 'B']);
      expect(persisted.activeId).toBe('B');
   });

   it('seeds the workspace from a lone legacy pointer and removes the old key', () => {
      localStorage.setItem(ACTIVE_CHARACTER_ID_KEY, 'old');

      const seeded = readWorkspace();

      expect(seeded).toEqual({ openTabs: [{ id: 'old', type: 'character' }], activeId: 'old' });
      expect(localStorage.getItem(WORKSPACE_KEY)).not.toBeNull();
      expect(localStorage.getItem(ACTIVE_CHARACTER_ID_KEY)).toBeNull();
   });
});

describe('boot restore-of-many', () => {
   it('opens every stored tab in order, prunes a stale one, activates the stored active, and lifts the gate', async () => {
      await saveCharacter(makeCharacter('A', { name: 'Alpha' }));
      await saveCharacter(makeCharacter('B', { name: 'Bravo' }));
      await saveCharacter(makeCharacter('C', { name: 'Charlie' }));
      writeWorkspace({
         openTabs: [
            { id: 'A', type: 'character' },
            { id: 'gone', type: 'character' }, // stale: no record
            { id: 'B', type: 'character' },
            { id: 'C', type: 'character' },
         ],
         activeId: 'B',
      });
      useCharacterBootStore.setState({ isBootHydrating: true });

      await runCharacterBoot();

      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['A', 'B', 'C']); // order preserved, 'gone' pruned
      expect(useTabManagerStore.getState().activeTabId).toBe('B');
      expect(getActiveCharacterStore()?.getState().character?.name).toBe('Bravo');
      expect(useCharacterBootStore.getState().isBootHydrating).toBe(false);
      // Pruned workspace persisted.
      expect(readWorkspace().openTabs.map((t) => t.id)).toEqual(['A', 'B', 'C']);
   });

   it('falls back to the menu and lifts the gate when no stored tab survives', async () => {
      writeWorkspace({ openTabs: [{ id: 'gone', type: 'character' }], activeId: 'gone' });
      useCharacterBootStore.setState({ isBootHydrating: true });

      await runCharacterBoot();

      expect(useTabManagerStore.getState().openTabs).toEqual([]);
      expect(useTabManagerStore.getState().activeTabId).toBeNull();
      expect(useCharacterBootStore.getState().isBootHydrating).toBe(false);
   });
});

describe('desktop deactivate (Return to Menu, keep tabs)', () => {
   it('clears the active id and points at the menu fallback while keeping tabs + the live instance', () => {
      const actions = useTabManagerStore.getState().actions;
      actions.openCharacterTab(makeCharacter('A'));
      actions.openCharacterTab(makeCharacter('B'));
      const instB = getOrCreateInstance('B');

      actions.deactivate();

      expect(useTabManagerStore.getState().activeTabId).toBeNull();
      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['A', 'B']); // tabs kept
      expect(getActiveCharacterStore()).toBe(getOrCreateInstance(SINGLE_ACTIVE_INSTANCE_ID)); // menu active
      expect(getOrCreateInstance('B')).toBe(instB); // previously-active instance still live
      expect(readWorkspace().activeId).toBeNull(); // persisted

      // Reactivating returns to the same live instance.
      actions.setActiveTab('B');
      expect(getActiveCharacterStore()).toBe(instB);
   });
});

describe('mobile keep-alive lifecycle', () => {
   it('mobileOpenCharacter keeps both characters live across opens (keep-alive), never pruning openTabs', () => {
      const actions = useTabManagerStore.getState().actions;

      actions.mobileOpenCharacter(makeCharacter('A'));
      expect(getCharacterInstanceIds()).toEqual(['A']);

      actions.mobileOpenCharacter(makeCharacter('B'));
      // Keep-alive: A stays live alongside B (within budget); both are in the shared openTabs.
      expect(getCharacterInstanceIds().sort()).toEqual(['A', 'B']);
      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['A', 'B']);
      expect(useTabManagerStore.getState().activeTabId).toBe('B');
   });

   it('mobileCreateCharacterTab opens a NEW resident tab and keeps the previous (keep-alive)', () => {
      const actions = useTabManagerStore.getState().actions;

      actions.mobileOpenCharacter(makeCharacter('A'));
      actions.mobileCreateCharacterTab('LEGENDS');
      const created = useTabManagerStore.getState().activeTabId!;

      expect(created).not.toBe('A');
      const ids = useTabManagerStore.getState().openTabs.map((t) => t.id);
      expect(ids).toContain('A'); // previous tab kept
      expect(ids).toContain(created);
      expect(getCharacterInstanceIds().sort()).toEqual(['A', created].sort());
   });

   it('mobileImportCharacterTab opens the import as a NEW resident tab under a fresh id, keeping the previous', () => {
      const actions = useTabManagerStore.getState().actions;

      actions.mobileOpenCharacter(makeCharacter('A'));
      actions.mobileImportCharacterTab(makeCharacter('B'));

      // A is kept; the import rides in on a FRESH id (an import is a new entity, never the file's id).
      const liveIds = getCharacterInstanceIds();
      expect(liveIds).toContain('A');
      const newId = liveIds.find((id) => id !== 'A')!;
      expect(newId).not.toBe('B'); // the file's id is re-minted
      expect(useTabManagerStore.getState().activeTabId).toBe(newId);
      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['A', newId]);
   });

   it('mobileReturnToMenu is a keep-alive no-op: active tab and live instances stay put', () => {
      const actions = useTabManagerStore.getState().actions;
      actions.mobileOpenCharacter(makeCharacter('A'));
      actions.mobileOpenCharacter(makeCharacter('B'));

      actions.mobileReturnToMenu();

      expect(getCharacterInstanceIds().sort()).toEqual(['A', 'B']); // instances stay live
      expect(useTabManagerStore.getState().activeTabId).toBe('B'); // active unchanged (the page shows the menu)
      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['A', 'B']); // kept
   });

   it('mobileCloseSheet destructively closes the active tab, dropping its working row and showing the menu', async () => {
      const actions = useTabManagerStore.getState().actions;
      await saveCharacter(makeCharacter('A'));
      actions.mobileOpenCharacter(makeCharacter('A'));
      expect(await getCharacter('A')).toBeDefined();

      actions.mobileCloseSheet(); // sole tab -> lands on the menu

      expect(getCharacterInstanceIds()).toEqual([]); // no live instance
      expect(useTabManagerStore.getState().activeTabId).toBeNull();
      expect(getActiveCharacterStore()).toBe(getOrCreateInstance(SINGLE_ACTIVE_INSTANCE_ID));
      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual([]);
      // The closed record is deleted (async delete settles on the next tick).
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(await getCharacter('A')).toBeUndefined();
   });
});

describe('platform-aware boot', () => {
   it('mobile boot hydrates only the active tab and keeps the full openTabs list', async () => {
      vi.spyOn(deviceTypeModule, 'getEffectiveDeviceType').mockReturnValue('mobile');
      await saveCharacter(makeCharacter('A', { name: 'Alpha' }));
      await saveCharacter(makeCharacter('B', { name: 'Bravo' }));
      await saveCharacter(makeCharacter('C', { name: 'Charlie' }));
      writeWorkspace({
         openTabs: [
            { id: 'A', type: 'character' },
            { id: 'B', type: 'character' },
            { id: 'C', type: 'character' },
         ],
         activeId: 'B',
      });
      useCharacterBootStore.setState({ isBootHydrating: true });

      await runCharacterBoot();

      // The whole list is preserved, but only the active instance is live.
      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['A', 'B', 'C']);
      expect(useTabManagerStore.getState().activeTabId).toBe('B');
      expect(getCharacterInstanceIds()).toEqual(['B']);
      expect(useCharacterBootStore.getState().isBootHydrating).toBe(false);
   });

   it('desktop boot hydrates all stored tabs', async () => {
      vi.spyOn(deviceTypeModule, 'getEffectiveDeviceType').mockReturnValue('desktop');
      await saveCharacter(makeCharacter('A'));
      await saveCharacter(makeCharacter('B'));
      await saveCharacter(makeCharacter('C'));
      writeWorkspace({
         openTabs: [
            { id: 'A', type: 'character' },
            { id: 'B', type: 'character' },
            { id: 'C', type: 'character' },
         ],
         activeId: 'A',
      });
      useCharacterBootStore.setState({ isBootHydrating: true });

      await runCharacterBoot();

      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['A', 'B', 'C']);
      expect(getCharacterInstanceIds().sort()).toEqual(['A', 'B', 'C']);
      expect(useTabManagerStore.getState().activeTabId).toBe('A');
   });

   it('desktop boot preserves a deactivated workspace (null active) as menu + all tabs hydrated', async () => {
      vi.spyOn(deviceTypeModule, 'getEffectiveDeviceType').mockReturnValue('desktop');
      await saveCharacter(makeCharacter('A'));
      await saveCharacter(makeCharacter('B'));
      // activeId null = the user hit "Return to Menu" (deactivated) before reloading.
      writeWorkspace({
         openTabs: [
            { id: 'A', type: 'character' },
            { id: 'B', type: 'character' },
         ],
         activeId: null,
      });
      useCharacterBootStore.setState({ isBootHydrating: true });

      await runCharacterBoot();

      expect(useTabManagerStore.getState().activeTabId).toBeNull(); // stayed at the menu
      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['A', 'B']); // tabs kept
      expect(getCharacterInstanceIds().sort()).toEqual(['A', 'B']); // all live (desktop keep-alive)
   });
});

describe('reorderTabs', () => {
   it('reorders openTabs and persists the new order, leaving the active tab unchanged', () => {
      const actions = useTabManagerStore.getState().actions;
      actions.openCharacterTab(makeCharacter('A'));
      actions.openCharacterTab(makeCharacter('B'));
      actions.openCharacterTab(makeCharacter('C'));
      actions.setActiveTab('A');

      actions.reorderTabs('A', 'C'); // move A to C's slot -> [B, C, A]

      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['B', 'C', 'A']);
      expect(useTabManagerStore.getState().activeTabId).toBe('A'); // unchanged by a reorder
      expect(readWorkspace().openTabs.map((t) => t.id)).toEqual(['B', 'C', 'A']); // persisted
   });

   it('is a no-op when the ids match', () => {
      const actions = useTabManagerStore.getState().actions;
      actions.openCharacterTab(makeCharacter('A'));
      actions.openCharacterTab(makeCharacter('B'));

      actions.reorderTabs('A', 'A');

      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['A', 'B']);
   });
});

describe('board tabs (plumbing, no UI)', () => {
   it('createBoardTab registers + activates a board instance and sets BOTH pointers', async () => {
      const actions = useTabManagerStore.getState().actions;
      await actions.createBoardTab();

      const boardId = useTabManagerStore.getState().activeTabId!;
      const tab = useTabManagerStore.getState().openTabs.find((t) => t.id === boardId)!;
      expect(tab.type).toBe('board');

      // Board pointer at the new board; character pointer parked on the menu fallback.
      expect(getActiveBoardStore()).toBe(getOrCreateBoardInstance(boardId));
      expect(getActiveCharacterStore()).toBe(getOrCreateInstance(SINGLE_ACTIVE_INSTANCE_ID));
      expect(getActiveCharacterStore()?.getState().character).toBeNull(); // no sheet under a board tab

      // The board record was created and the instance hydrated.
      expect(await getBoard(boardId)).toBeDefined();
      expect(getOrCreateBoardInstance(boardId).getState().boardId).toBe(boardId);
   });

   it('switching between a character and a board tab coordinates both pointers each way', async () => {
      const actions = useTabManagerStore.getState().actions;
      actions.openCharacterTab(makeCharacter('A'));
      expect(getActiveCharacterStore()).toBe(getOrCreateInstance('A'));
      expect(getActiveBoardStore()).toBeNull(); // a character tab clears the board pointer

      await actions.createBoardTab();
      const boardId = useTabManagerStore.getState().activeTabId!;
      expect(getActiveBoardStore()).toBe(getOrCreateBoardInstance(boardId));
      expect(getActiveCharacterStore()).toBe(getOrCreateInstance(SINGLE_ACTIVE_INSTANCE_ID)); // menu fallback

      actions.setActiveTab('A'); // back to the character
      expect(getActiveCharacterStore()).toBe(getOrCreateInstance('A'));
      expect(getActiveBoardStore()).toBeNull();

      actions.setActiveTab(boardId); // back to the board
      expect(getActiveBoardStore()).toBe(getOrCreateBoardInstance(boardId));
      expect(getActiveCharacterStore()?.getState().character).toBeNull();
   });

   it('closeTab on a board disposes its instance, deletes its record, and activates the neighbour', async () => {
      const actions = useTabManagerStore.getState().actions;
      actions.openCharacterTab(makeCharacter('A'));
      await actions.createBoardTab(); // openTabs = [A, board]; board active & rightmost
      const boardId = useTabManagerStore.getState().activeTabId!;
      const boardInstance = getOrCreateBoardInstance(boardId);
      expect(await getBoard(boardId)).toBeDefined();

      actions.closeTab(boardId);
      await new Promise((resolve) => setTimeout(resolve, 0)); // settle the fire-and-forget delete

      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['A']);
      expect(useTabManagerStore.getState().activeTabId).toBe('A'); // left neighbour (a character)
      expect(getOrCreateBoardInstance(boardId)).not.toBe(boardInstance); // disposed (re-created here)
      expect(await getBoard(boardId)).toBeUndefined(); // record deleted "for good"
      expect(getActiveBoardStore()).toBeNull(); // back on a character -> board pointer cleared
      expect(getActiveCharacterStore()).toBe(getOrCreateInstance('A'));
      disposeBoardInstance(boardId); // clean up the re-created stub
   });

   it('closing the only board tab lands on the menu with both pointers cleared', async () => {
      const actions = useTabManagerStore.getState().actions;
      await actions.createBoardTab();
      const boardId = useTabManagerStore.getState().activeTabId!;

      actions.closeTab(boardId);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(useTabManagerStore.getState().openTabs).toEqual([]);
      expect(useTabManagerStore.getState().activeTabId).toBeNull();
      expect(getActiveBoardStore()).toBeNull();
      expect(getActiveCharacterStore()).toBe(getOrCreateInstance(SINGLE_ACTIVE_INSTANCE_ID));
   });

   it('desktop boot restores board tabs and prunes a stale one', async () => {
      vi.spyOn(deviceTypeModule, 'getEffectiveDeviceType').mockReturnValue('desktop');
      await saveCharacter(makeCharacter('A'));
      const board = await createBoard('Board One');
      writeWorkspace({
         openTabs: [
            { id: 'A', type: 'character' },
            { id: board.id, type: 'board' },
            { id: 'ghost-board', type: 'board' }, // stale: no record
         ],
         activeId: board.id,
      });
      useCharacterBootStore.setState({ isBootHydrating: true });

      await runCharacterBoot();

      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['A', board.id]); // ghost pruned
      expect(useTabManagerStore.getState().activeTabId).toBe(board.id);
      // Intended-active board: hydrated + board pointer set, character parked on the fallback.
      expect(getOrCreateBoardInstance(board.id).getState().boardId).toBe(board.id);
      expect(getActiveBoardStore()).toBe(getOrCreateBoardInstance(board.id));
      expect(getActiveCharacterStore()).toBe(getOrCreateInstance(SINGLE_ACTIVE_INSTANCE_ID));
      expect(getCharacterInstanceIds()).toContain('A'); // background character still hydrated (keep-alive)
   });

   it('mobile boot skips board tabs and lands on the menu when the intended-active is a board', async () => {
      vi.spyOn(deviceTypeModule, 'getEffectiveDeviceType').mockReturnValue('mobile');
      await saveCharacter(makeCharacter('A'));
      const board = await createBoard('Board One');
      writeWorkspace({
         openTabs: [
            { id: 'A', type: 'character' },
            { id: board.id, type: 'board' },
         ],
         activeId: board.id, // a board is intended active
      });
      useCharacterBootStore.setState({ isBootHydrating: true });

      await runCharacterBoot();

      // The full list is preserved (the board id stays dormant), but no board is hydrated or active.
      expect(useTabManagerStore.getState().openTabs.map((t) => t.id)).toEqual(['A', board.id]);
      expect(useTabManagerStore.getState().activeTabId).toBeNull(); // mobile cannot show a board -> menu
      expect(getActiveBoardStore()).toBeNull();
      expect(getBoardInstanceIds()).toEqual([]); // no board instance hydrated
      expect(getActiveCharacterStore()).toBe(getOrCreateInstance(SINGLE_ACTIVE_INSTANCE_ID));
   });
});

describe('cross-tab undo isolation + routing', () => {
   it('undo on the active tab leaves the other tab untouched, and switching routes undo to the active tab', () => {
      const actions = useTabManagerStore.getState().actions;
      actions.openCharacterTab(makeCharacter('A', { name: 'A0' }));
      actions.openCharacterTab(makeCharacter('B', { name: 'B0' })); // B is active
      const instA = getOrCreateInstance('A');
      const instB = getOrCreateInstance('B');

      // Edit B, then undo via the registry-resolved ACTIVE instance (exactly what the
      // Ctrl+Z router does in useCharacterSheetUndoRedo).
      instB.getState().actions.updateCharacterName('B1');
      const aPastBefore = instA.temporal.getState().pastStates.length;
      getActiveCharacterStore()!.temporal.getState().undo();

      expect(instB.getState().character?.name).toBe('B0'); // B reverted
      expect(instA.getState().character?.name).toBe('A0'); // A untouched
      expect(instA.temporal.getState().pastStates.length).toBe(aPastBefore); // A's undo stack untouched

      // Switch to A -> undo now routes to A, not B.
      actions.setActiveTab('A');
      instA.getState().actions.updateCharacterName('A1');
      getActiveCharacterStore()!.temporal.getState().undo();

      expect(instA.getState().character?.name).toBe('A0'); // A reverted
      expect(instB.getState().character?.name).toBe('B0'); // B still unchanged
   });
});
