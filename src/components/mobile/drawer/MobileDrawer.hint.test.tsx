// @vitest-environment jsdom

// -- React Imports --
import { StrictMode } from 'react';

// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

// -- Component Imports --
import MobileDrawer from './MobileDrawer';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

/*
 * Locks the one-time long-press hint effect. Nothing it does is visible in a diff, and every failure
 * mode only shows on a first-run device:
 *   - it re-reads `hasSeenDrawerMenuHint` LIVE from the store, because StrictMode invokes effect setup
 *     twice against the same committed closure and a stale `false` toasts twice;
 *   - it writes the seen flag BEFORE toasting;
 *   - it checks `areGestureHintsEnabled` before the seen flag, so a drawer opened with hints off leaves
 *     the flag unburnt and the hint still fires the first time hints are turned on.
 *
 * Everything below the component is mocked: this covers the effect, not the drawer's children.
 */

const mocks = vi.hoisted(() => ({
   toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
   // Stable action bag: `reloadCurrentFolder` sits in a mount effect's dep array, so a fresh identity
   // per render would loop the effect.
   drawerActions: {
      addFolder: vi.fn(),
      reloadCurrentFolder: vi.fn(),
      clearSearch: vi.fn(),
      setDrawerCurrentFolderId: vi.fn(),
      undoDrawer: vi.fn(),
      redoDrawer: vi.fn(),
      reorderFolders: vi.fn(),
      reorderItems: vi.fn(),
      importDrawerAsFolder: vi.fn(),
      addImportedFolder: vi.fn(),
      addImportedItem: vi.fn(),
   },
}));

vi.mock('react-hot-toast', () => ({ default: mocks.toast }));
// Echo the i18n key instead of standing up a provider - the effect only reads one string.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The store itself stays real (the live `getState()` read is the thing under test); only the action bag
// is stubbed, so the mount reload never reaches Dexie.
vi.mock('@/lib/stores/drawerStore', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@/lib/stores/drawerStore')>();
   return { ...actual, useDrawerActions: () => mocks.drawerActions };
});
vi.mock('@/hooks/drawer/useDrawerNavigation', () => ({
   useDrawerNavigation: () => ({
      currentFolderId: null,
      navigateToFolder: () => {},
      currentItems: [],
      currentFolders: [],
      breadcrumbPath: [],
      childCounts: new Map(),
   }),
}));

// The drawer's children, none of which participate in the hint.
vi.mock('@/components/molecules/drawer/DrawerSearchBar', () => ({ DrawerSearchBar: () => null }));
vi.mock('@/components/molecules/drawer/DrawerListRow', () => ({ DrawerListRow: () => null }));
vi.mock('@/components/organisms/drawer/DrawerItemPreview', () => ({ DrawerItemPreview: () => null }));
vi.mock('@/components/mobile/drawer/MobileBreadcrumbs', () => ({ default: () => null }));
vi.mock('@/components/mobile/drawer/MobileFolderItem', () => ({ default: () => null }));
vi.mock('@/components/mobile/drawer/MobileDrawerItem', () => ({ default: () => null }));
vi.mock('@/components/mobile/drawer/MobileDrawerContextMenu', () => ({ default: () => null }));
vi.mock('@/components/mobile/drawer/MobileAddFolderSheet', () => ({ default: () => null }));

// Spies the real writer in place so the flag genuinely lands - a stub that skipped the write would make
// the second StrictMode invocation's live read `false` and pass the single-toast case for the wrong reason.
const setSeenSpy = () => vi.mocked(useAppSettingsStore.getState().actions.setHasSeenDrawerMenuHint);

const renderDrawer = () => render(<StrictMode><MobileDrawer /></StrictMode>);

beforeEach(() => {
   useAppSettingsStore.setState({ areGestureHintsEnabled: true, hasSeenDrawerMenuHint: false });
   vi.spyOn(useAppSettingsStore.getState().actions, 'setHasSeenDrawerMenuHint');
   mocks.toast.mockClear();
});
afterEach(() => {
   cleanup();
   vi.restoreAllMocks();
});

describe('MobileDrawer long-press hint', () => {
   it('toasts exactly once under StrictMode and marks the hint seen', () => {
      renderDrawer();

      expect(mocks.toast).toHaveBeenCalledTimes(1);
      expect(mocks.toast).toHaveBeenCalledWith('MobileGestureHints.drawerLongPress');
      expect(setSeenSpy()).toHaveBeenCalledWith(true);
      expect(useAppSettingsStore.getState().hasSeenDrawerMenuHint).toBe(true);
   });

   it('writes the seen flag before toasting', () => {
      renderDrawer();

      expect(setSeenSpy().mock.invocationCallOrder[0]).toBeLessThan(mocks.toast.mock.invocationCallOrder[0]);
   });

   it('does not toast, and does not burn the seen flag, when gesture hints are off', () => {
      useAppSettingsStore.setState({ areGestureHintsEnabled: false });

      renderDrawer();

      expect(mocks.toast).not.toHaveBeenCalled();
      expect(setSeenSpy()).not.toHaveBeenCalled();
      expect(useAppSettingsStore.getState().hasSeenDrawerMenuHint).toBe(false);
   });

   it('still shows the hint once when gesture hints are turned on after the drawer opened', () => {
      useAppSettingsStore.setState({ areGestureHintsEnabled: false });
      renderDrawer();

      act(() => { useAppSettingsStore.setState({ areGestureHintsEnabled: true }); });

      expect(mocks.toast).toHaveBeenCalledTimes(1);
   });

   it('does not toast when the hint was already seen', () => {
      useAppSettingsStore.setState({ hasSeenDrawerMenuHint: true });

      renderDrawer();

      expect(mocks.toast).not.toHaveBeenCalled();
      expect(setSeenSpy()).not.toHaveBeenCalled();
   });

   it('does not toast again when the drawer tab is left and re-entered', () => {
      const { unmount } = renderDrawer();
      expect(mocks.toast).toHaveBeenCalledTimes(1);

      unmount();
      renderDrawer();

      expect(mocks.toast).toHaveBeenCalledTimes(1);
   });
});
