// @vitest-environment jsdom

// -- React Imports --
import { createElement } from 'react';
import type { ReactNode } from 'react';

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

// -- Hook Imports --
import { useCharacterSheetDnD } from '../useCharacterSheetDnD';

// -- Store Imports --
import { ActiveCharacterStoreContext } from '@/lib/character/ActiveCharacterStoreContext';
import { getOrCreateInstance } from '@/lib/character/characterStoreRegistry';
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useDrawerStore } from '@/lib/stores/drawerStore';

/*
 * Pins the hook's store subscriptions to one selector per value, against the real stores. Widening them -
 * a selector returning the whole state, or one action bag folded into another - lints clean and typechecks
 * clean; it just re-renders the drag engine (and the workspace shell under it) on every unrelated settings
 * write, which is felt only as jank mid-drag. The negative cases are the only thing that catches it; the
 * positive case proves the probe counts.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(cleanup);

describe('useCharacterSheetDnD store subscriptions', () => {
   // The character store resolves through context, so the probe supplies a bare isolated instance - no
   // character is loaded into it, and none of the cases below write to it.
   const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(ActiveCharacterStoreContext.Provider, { value: getOrCreateInstance('dnd-subscription-probe') }, children);

   const mountDnD = () => {
      let renders = 0;
      renderHook(() => { renders += 1; return useCharacterSheetDnD(); }, { wrapper });
      return { at: () => renders, settled: renders };
   };

   it('does not re-render on an app-settings write it never reads', () => {
      const probe = mountDnD();

      act(() => { useAppSettingsStore.setState({ layersPanelOpen: true, isNoteOutlineOpen: true }); });

      expect(probe.at()).toBe(probe.settled);
   });

   it('does not re-render on a general-state write it never reads', () => {
      const probe = mountDnD();

      act(() => { useAppGeneralStateStore.setState({ isDrawerReceded: true, lastModifiedStore: 'board' }); });

      expect(probe.at()).toBe(probe.settled);
   });

   it('does not re-render on a drawer write outside the loaded folder view', () => {
      const probe = mountDnD();

      act(() => { useDrawerStore.setState({ isSearching: true }); });

      expect(probe.at()).toBe(probe.settled);
   });

   it('re-renders once when the loaded folder view changes', () => {
      const probe = mountDnD();

      act(() => { useDrawerStore.setState({ currentFolderView: { items: [], childCounts: new Map() } }); });

      expect(probe.at()).toBe(probe.settled + 1);
   });
});
