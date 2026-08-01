// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// -- Board reference re-freeze (mocked: a drawer-less note close must call it before reaping the row) --
const { refreezeSpy } = vi.hoisted(() => ({ refreezeSpy: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/board/refreezeNoteReferences', () => ({
   refreezeDrawerlessNoteReferences: refreezeSpy,
   stampNoteReferencesDrawerSource: vi.fn().mockResolvedValue(undefined),
}));

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import {
   useTabManagerStore,
   runCharacterBoot,
   __setMobileResidentBudgetForTest,
   __resetMobileKeepAliveForTest,
} from './tabManagerStore';
import {
   SINGLE_ACTIVE_INSTANCE_ID,
   disposeInstance,
   getActiveCharacterStore,
   getCharacterInstanceIds,
   getOrCreateInstance,
} from './characterStoreRegistry';
import {
   disposeNoteInstance,
   getActiveNoteStore,
   getNoteInstanceIds,
   getOrCreateNoteInstance,
} from '@/lib/notes/noteStoreRegistry';
import { detachPersistenceHandle } from './characterPersistence';
import { saveCharacter, getCharacter } from './characterRepository';
import { createNote, getNote } from '@/lib/notes/noteRepository';
import { readWorkspace, writeWorkspace } from './workspaceSession';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { Character } from '@/lib/types/character';

/*
 * Tests for mobile bounded keep-alive: a capped resident set of live character instances with safe,
 * weighted eviction of the least-recently-active tabs. Each assertion is written to FAIL if the
 * invariant it guards breaks (lossless switch, cold rehydrate, record/tab retention, active+previous
 * protection, denorm persistence, hydrate-before-flip ordering, latest-wins). Runs against
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

/** Lets fire-and-forget IndexedDB writes/deletes and eviction flushes settle. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const actions = () => useTabManagerStore.getState().actions;
const openIds = () => useTabManagerStore.getState().openTabs.map((tab) => tab.id);

beforeEach(async () => {
   installLocalStorageShim();
   await drawerDatabase.characters.clear();
   await drawerDatabase.notes.clear();
   await drawerDatabase.items.clear();
   await drawerDatabase.meta.clear();
   useTabManagerStore.setState({ openTabs: [], activeTabId: null });
   __resetMobileKeepAliveForTest();
   refreezeSpy.mockClear();
   refreezeSpy.mockResolvedValue(undefined);
});

afterEach(async () => {
   getCharacterInstanceIds().forEach((id) => {
      detachPersistenceHandle(id);
      disposeInstance(id);
   });
   getNoteInstanceIds().forEach((id) => disposeNoteInstance(id));
   detachPersistenceHandle(SINGLE_ACTIVE_INSTANCE_ID);
   disposeInstance(SINGLE_ACTIVE_INSTANCE_ID);
   useTabManagerStore.setState({ openTabs: [], activeTabId: null });
   useAppSettingsStore.setState({ deviceTypeOverride: undefined });
   __resetMobileKeepAliveForTest();
   await tick();
});

describe('lossless switch (keep-alive)', () => {
   it('switching away and back preserves the live instance and its unsaved edits (no reload)', async () => {
      __setMobileResidentBudgetForTest(5);
      actions().mobileOpenCharacter(makeCharacter('A', { name: 'Alpha' }));
      const instA = getOrCreateInstance('A');
      instA.getState().actions.updateCharacterName('Alpha-EDITED');

      actions().mobileOpenCharacter(makeCharacter('B', { name: 'Bravo' }));
      await actions().mobileSetActiveTab('A');

      expect(getOrCreateInstance('A')).toBe(instA); // same instance, never disposed
      expect(instA.getState().character?.name).toBe('Alpha-EDITED'); // not reverted to a saved copy
      expect(getCharacterInstanceIds()).toContain('A'); // still resident
      expect(useTabManagerStore.getState().activeTabId).toBe('A');
   });
});

describe('cold rehydrate', () => {
   it('an evicted tab reactivates with its persisted content', async () => {
      __setMobileResidentBudgetForTest(2);
      actions().mobileOpenCharacter(makeCharacter('A', { name: 'Alpha' }));
      getOrCreateInstance('A').getState().actions.updateCharacterName('Alpha-SAVED');
      actions().mobileOpenCharacter(makeCharacter('B'));
      actions().mobileOpenCharacter(makeCharacter('C')); // budget 2 -> A (LRU tail) evicted
      await tick(); // let the eviction flush's async write land

      expect(getCharacterInstanceIds()).not.toContain('A'); // instance gone (cold)
      expect(await getCharacter('A')).toBeDefined(); // record retained

      await actions().mobileSetActiveTab('A'); // rehydrate from storage
      expect(getCharacterInstanceIds()).toContain('A');
      expect(getOrCreateInstance('A').getState().character?.name).toBe('Alpha-SAVED');
   });
});

describe('eviction keeps the record and the tab', () => {
   it('drops only the live instance, retaining the openTabs entry and the durable record', async () => {
      __setMobileResidentBudgetForTest(2);
      await saveCharacter(makeCharacter('A', { name: 'Alpha' }));
      actions().mobileOpenCharacter(makeCharacter('A', { name: 'Alpha' }), 'drawer-A');
      actions().mobileOpenCharacter(makeCharacter('B'));
      actions().mobileOpenCharacter(makeCharacter('C')); // A evicted
      await tick();

      expect(openIds()).toContain('A'); // tab entry kept
      expect(await getCharacter('A')).toBeDefined(); // record kept
      expect(getCharacterInstanceIds()).not.toContain('A'); // only the instance is gone
   });
});

describe('active + previous are never evicted', () => {
   it('protects the active (idx 0) and immediately-previous (idx 1) tabs across switches', async () => {
      __setMobileResidentBudgetForTest(2);
      actions().mobileOpenCharacter(makeCharacter('A'));
      actions().mobileOpenCharacter(makeCharacter('B'));
      actions().mobileOpenCharacter(makeCharacter('C'));
      actions().mobileOpenCharacter(makeCharacter('D'));
      await tick();

      // Active D + previous C survive; the resident set is exactly those two.
      expect(getCharacterInstanceIds().sort()).toEqual(['C', 'D']);

      await actions().mobileSetActiveTab('A'); // A was evicted; rehydrates and becomes active
      await tick();
      // Now active A + previous D survive.
      expect(getCharacterInstanceIds().sort()).toEqual(['A', 'D']);
      expect(useTabManagerStore.getState().activeTabId).toBe('A');
   });
});

describe('denorm persisted for cold tabs', () => {
   it('an evicted tab still carries title + game in openTabs (and in the persisted workspace)', async () => {
      __setMobileResidentBudgetForTest(2);
      actions().mobileOpenCharacter(makeCharacter('A', { name: 'Alpha', game: 'CITY_OF_MIST' }));
      actions().mobileOpenCharacter(makeCharacter('B'));
      actions().mobileOpenCharacter(makeCharacter('C')); // A evicted
      await tick();

      const tabA = useTabManagerStore.getState().openTabs.find((tab) => tab.id === 'A')!;
      expect(tabA.title).toBe('Alpha');
      expect(tabA.game).toBe('CITY_OF_MIST');

      const persistedA = readWorkspace().openTabs.find((tab) => tab.id === 'A')!;
      expect(persistedA.title).toBe('Alpha');
      expect(persistedA.game).toBe('CITY_OF_MIST');
   });
});

describe('menu-bounce ordering (hydrate before flip)', () => {
   it('does not flip the active pointer until the cold tab has hydrated (character non-null)', async () => {
      __setMobileResidentBudgetForTest(5);
      await saveCharacter(makeCharacter('COLD', { name: 'Coldy' }));
      // A cold tab: present in openTabs, no live instance, menu active.
      useTabManagerStore.setState({ openTabs: [{ id: 'COLD', type: 'character' }], activeTabId: null });

      const pending = actions().mobileSetActiveTab('COLD');
      // Synchronously, before hydrate resolves, the pointer has NOT flipped.
      expect(useTabManagerStore.getState().activeTabId).toBeNull();

      await pending;
      // On resolve: the pointer is flipped AND the active store already has a non-null character.
      expect(useTabManagerStore.getState().activeTabId).toBe('COLD');
      expect(getActiveCharacterStore()?.getState().character).not.toBeNull();
      expect(getActiveCharacterStore()?.getState().character?.name).toBe('Coldy');
   });
});

describe('latest-wins', () => {
   it('two overlapping switches land on the second, without the first stealing the pointer', async () => {
      __setMobileResidentBudgetForTest(5);
      await saveCharacter(makeCharacter('X', { name: 'Xavier' }));
      await saveCharacter(makeCharacter('Y', { name: 'Yolanda' }));
      useTabManagerStore.setState({
         openTabs: [{ id: 'X', type: 'character' }, { id: 'Y', type: 'character' }],
         activeTabId: null,
      });

      const first = actions().mobileSetActiveTab('X');
      const second = actions().mobileSetActiveTab('Y');
      await Promise.all([first, second]);

      expect(useTabManagerStore.getState().activeTabId).toBe('Y'); // the later switch wins
      expect(getActiveCharacterStore()).toBe(getOrCreateInstance('Y'));
      expect(getActiveCharacterStore()?.getState().character?.name).toBe('Yolanda');
   });
});

describe('mobileCloseTab', () => {
   it('closing a background tab reaps its record and prunes its tab, leaving the active tab untouched', async () => {
      __setMobileResidentBudgetForTest(5);
      await saveCharacter(makeCharacter('A', { name: 'Alpha' }));
      actions().mobileOpenCharacter(makeCharacter('A', { name: 'Alpha' }), 'drawer-A');
      actions().mobileOpenCharacter(makeCharacter('B', { name: 'Bravo' })); // B active, A background
      expect(await getCharacter('A')).toBeDefined();

      await actions().mobileCloseTab('A');
      await tick(); // let the fire-and-forget delete land

      expect(openIds()).toEqual(['B']); // A's tab pruned
      expect(await getCharacter('A')).toBeUndefined(); // record reaped
      expect(useTabManagerStore.getState().activeTabId).toBe('B'); // active untouched
      expect(getCharacterInstanceIds()).toContain('B');
   });

   it('closing the active tab lands on a COLD neighbour, hydrated to a non-null character (no bounce)', async () => {
      __setMobileResidentBudgetForTest(2);
      actions().mobileOpenCharacter(makeCharacter('A', { name: 'Alpha' }));
      actions().mobileOpenCharacter(makeCharacter('B', { name: 'Bravo' }));
      actions().mobileOpenCharacter(makeCharacter('C', { name: 'Cara' }));
      await tick(); // let the eviction-flush saves (incl. cold A's) land so reactivation can rehydrate
      await actions().mobileSetActiveTab('A'); // A active; B is squeezed cold by the budget
      await tick();
      expect(getCharacterInstanceIds()).not.toContain('B'); // B cold (record was flushed on eviction)

      await actions().mobileCloseTab('A'); // right neighbour is B (cold): must hydrate BEFORE the pointer flips
      await tick();

      expect(useTabManagerStore.getState().activeTabId).toBe('B');
      const active = getActiveCharacterStore();
      expect(active?.getState().character).not.toBeNull(); // no null-character landing
      expect(active?.getState().character?.name).toBe('Bravo');
   });

   it('closing the last tab lands on the menu (null active, null character)', async () => {
      __setMobileResidentBudgetForTest(5);
      actions().mobileOpenCharacter(makeCharacter('A', { name: 'Alpha' }));

      await actions().mobileCloseTab('A');
      await tick();

      expect(openIds()).toEqual([]);
      expect(useTabManagerStore.getState().activeTabId).toBeNull();
      expect(getActiveCharacterStore()?.getState().character ?? null).toBeNull();
   });
});

describe('note keep-alive (lossless switch)', () => {
   it('switching away from and back to a note tab preserves the live instance and its edits', async () => {
      __setMobileResidentBudgetForTest(5);
      await actions().mobileCreateNoteTab();
      const noteId = useTabManagerStore.getState().activeTabId!;
      const inst = getOrCreateNoteInstance(noteId);
      inst.getState().actions.updateTitle('Edited-Note');

      actions().mobileOpenCharacter(makeCharacter('C', { name: 'Cara' }));
      await actions().mobileSetActiveTab(noteId);

      expect(getOrCreateNoteInstance(noteId)).toBe(inst); // same instance, never disposed
      expect(inst.getState().note?.title).toBe('Edited-Note'); // edits survived
      expect(getNoteInstanceIds()).toContain(noteId); // still resident
      expect(useTabManagerStore.getState().activeTabId).toBe(noteId);
      expect(getActiveNoteStore()).toBe(inst); // active note pointer follows the switch
   });
});

describe('note eviction', () => {
   it('evicts a note (flushing first), keeping its record and tab, dropping only the instance', async () => {
      __setMobileResidentBudgetForTest(2);
      await actions().mobileCreateNoteTab(); // note weighs 2
      const noteId = useTabManagerStore.getState().activeTabId!;
      const flushSpy = vi.spyOn(getOrCreateNoteInstance(noteId).getState().actions, 'flush');

      // Two characters squeeze the note past the active+previous protection (weight 1+1+2 over budget 2).
      actions().mobileOpenCharacter(makeCharacter('A'));
      actions().mobileOpenCharacter(makeCharacter('B'));
      await tick();

      expect(flushSpy).toHaveBeenCalled(); // eviction flushed before disposing
      expect(getNoteInstanceIds()).not.toContain(noteId); // instance gone (cold)
      expect(openIds()).toContain(noteId); // tab entry kept
      expect(await getNote(noteId)).toBeDefined(); // durable record kept
   });
});

describe('active + previous protection with a mix of character and note tabs', () => {
   it('protects a note tab as the active AND as the immediately-previous resident', async () => {
      __setMobileResidentBudgetForTest(2);
      actions().mobileOpenCharacter(makeCharacter('A'));
      actions().mobileOpenCharacter(makeCharacter('B'));
      await actions().mobileCreateNoteTab(); // note active (idx 0), B previous (idx 1); A evicted
      const noteId = useTabManagerStore.getState().activeTabId!;
      await tick();

      expect(getNoteInstanceIds()).toContain(noteId); // note protected as active
      expect(getCharacterInstanceIds()).toContain('B'); // previous protected
      expect(getCharacterInstanceIds()).not.toContain('A'); // tail evicted

      // Open a new character: the note slides to previous (idx 1) and must stay protected.
      actions().mobileOpenCharacter(makeCharacter('C'));
      await tick();
      expect(getNoteInstanceIds()).toContain(noteId); // note protected as previous
      expect(getCharacterInstanceIds()).toContain('C'); // new active protected
      expect(getCharacterInstanceIds()).not.toContain('B'); // pushed past protection, evicted
   });
});

describe('bootMobile restores a note active-tab', () => {
   it('hydrates and activates a note intended-active (not a menu bounce)', async () => {
      const record = await createNote();
      writeWorkspace({ openTabs: [{ id: record.id, type: 'note' }], activeId: record.id });
      useAppSettingsStore.setState({ deviceTypeOverride: 'mobile' });

      await runCharacterBoot();

      expect(useTabManagerStore.getState().activeTabId).toBe(record.id); // not bounced to menu
      expect(getNoteInstanceIds()).toContain(record.id); // instance resident
      expect(getActiveNoteStore()?.getState().note).not.toBeNull(); // hydrated
      expect(openIds()).toEqual([record.id]);
   });
});

describe('mobileCloseTab on a drawer-less note', () => {
   it('re-freezes board references BEFORE reaping the row, then lands on a valid neighbour', async () => {
      __setMobileResidentBudgetForTest(5);
      // The re-freeze must see the row still present (delete happens after it resolves).
      refreezeSpy.mockImplementation(async (id: string) => {
         expect(await getNote(id)).toBeDefined();
      });

      actions().mobileOpenCharacter(makeCharacter('A', { name: 'Alpha' }));
      await actions().mobileCreateNoteTab(); // drawer-less note (no drawer link), active
      const noteId = useTabManagerStore.getState().activeTabId!;
      getOrCreateNoteInstance(noteId).getState().actions.updateBody('DRAWERLESS-LATEST');

      await actions().mobileCloseTab(noteId);
      await tick();

      expect(refreezeSpy).toHaveBeenCalledTimes(1);
      expect(refreezeSpy).toHaveBeenCalledWith(noteId, expect.objectContaining({ body: 'DRAWERLESS-LATEST' }));
      expect(await getNote(noteId)).toBeUndefined(); // row reaped after the re-freeze
      expect(useTabManagerStore.getState().activeTabId).toBe('A'); // landed on the character neighbour
      expect(getActiveCharacterStore()?.getState().character?.name).toBe('Alpha'); // neighbour hydrated
      expect(getNoteInstanceIds()).not.toContain(noteId);
   });
});
