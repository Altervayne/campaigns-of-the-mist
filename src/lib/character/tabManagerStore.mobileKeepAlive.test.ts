// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import {
   useTabManagerStore,
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
import { detachPersistenceHandle } from './characterPersistence';
import { saveCharacter, getCharacter } from './characterRepository';
import { readWorkspace } from './workspaceSession';

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
   await drawerDatabase.meta.clear();
   useTabManagerStore.setState({ openTabs: [], activeTabId: null });
   __resetMobileKeepAliveForTest();
});

afterEach(async () => {
   getCharacterInstanceIds().forEach((id) => {
      detachPersistenceHandle(id);
      disposeInstance(id);
   });
   detachPersistenceHandle(SINGLE_ACTIVE_INSTANCE_ID);
   disposeInstance(SINGLE_ACTIVE_INSTANCE_ID);
   useTabManagerStore.setState({ openTabs: [], activeTabId: null });
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
