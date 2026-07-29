// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

// -- Component Imports --
import { Drawer } from './Drawer';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useDrawerStore } from '@/lib/stores/drawerStore';

// -- Utils Imports --
import { ACCEPT_DRAWER_IMPORT } from '@/lib/utils/fileAccept';

// -- Type Imports --
import type { DrawerItemSummary } from '@/lib/drawer/drawerRepository';

/*
 * The side panel's share of the drawer-surface wiring: the mount load, the browse-vs-results branch,
 * and a result's jump-to. All three are shared with the Library and the mobile drawer, so each surface
 * pins them separately - a break in the shared hook has to be visible from every adopter.
 *
 * Everything below the panel is mocked: this covers the panel's own wiring, not its children.
 */

const mocks = vi.hoisted(() => ({
   // Renders of the panel, counted from the header mock: an unmemoized direct child, so it renders
   // once per panel render.
   renders: 0,
   drawerActions: {
      reloadCurrentFolder: vi.fn(),
      setDrawerCurrentFolderId: vi.fn(),
      clearSearch: vi.fn(),
   },
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The store stays real so its selectors are genuinely subscribed; only the action bag is stubbed, so
// the mount load never reaches Dexie.
vi.mock('@/lib/stores/drawerStore', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@/lib/stores/drawerStore')>();
   return { ...actual, useDrawerActions: () => mocks.drawerActions };
});
vi.mock('@/hooks/drawer/useDrawerNavigation', () => ({
   useDrawerNavigation: () => ({
      currentFolderId: null,
      navigateToFolder: () => {},
      currentItems: [{ id: 'item-a', name: 'Item A' }],
      currentFolders: [],
      parentFolderId: null,
      breadcrumbPath: [],
      isContentLoading: false,
   }),
}));
vi.mock('@/hooks/drawer/useDrawerActionState', () => ({
   useDrawerActionState: () => ({ activeAction: null, setActiveAction: () => {}, inputRef: { current: null } }),
}));
vi.mock('@/hooks/drawer/useDrawerFileImport', () => ({
   useDrawerFileImport: () => ({
      getRootProps: () => ({}),
      isDragActive: false,
      formRef: { current: null },
      fileInputRef: { current: null },
   }),
}));

vi.mock('@/components/molecules/drawer/DrawerHeader', () => ({
   DrawerHeader: () => {
      mocks.renders += 1;
      return <div data-testid="header" />;
   },
}));
vi.mock('@/components/molecules/drawer/DrawerSortControl', () => ({ DrawerSortControl: () => <div /> }));
vi.mock('@/components/molecules/drawer/DrawerItemEntry', () => ({
   DrawerItemEntry: () => <div data-testid="item-row" />,
}));
vi.mock('@/components/molecules/drawer/DrawerCompactItemEntry', () => ({
   DrawerCompactItemEntry: () => <div data-testid="item-row" />,
}));
vi.mock('@/components/molecules/drawer/DrawerSearchResultCard', () => ({
   DrawerSearchResultCard: ({ onJumpTo }: { onJumpTo: () => void }) => (
      <button data-testid="result-row" onClick={onJumpTo} />
   ),
}));

const summary = (parentFolderId: string | null): DrawerItemSummary => ({
   id: 'result-a',
   name: 'Result A',
   type: 'CHARACTER_CARD',
   game: 'LEGENDS',
   parentFolderId,
   createdAt: 0,
   updatedAt: 0,
});

const searchFor = (results: DrawerItemSummary[]) => {
   useDrawerStore.setState({ searchCriteria: { text: 'a' }, searchResults: results });
};

const renderPanel = () => render(<Drawer isDragHovering={false} activeDragId={null} overDragId={null} />);

beforeEach(() => {
   mocks.renders = 0;
   mocks.drawerActions.reloadCurrentFolder.mockClear();
   mocks.drawerActions.setDrawerCurrentFolderId.mockClear();
   mocks.drawerActions.clearSearch.mockClear();
   useDrawerStore.setState({ searchCriteria: null, searchResults: null, isSearching: false });
   useAppSettingsStore.setState({ isCompactDrawer: false });
});
afterEach(cleanup);

describe('Drawer surface wiring', () => {
   it('loads the current folder once on mount', () => {
      renderPanel();

      expect(mocks.drawerActions.reloadCurrentFolder).toHaveBeenCalledTimes(1);
   });

   it('swaps the browse body for the results while a search is active', () => {
      renderPanel();
      expect(screen.getByTestId('item-row')).toBeTruthy();

      act(() => { searchFor([summary(null)]); });

      expect(screen.getByTestId('result-row')).toBeTruthy();
      expect(screen.queryByTestId('item-row')).toBeNull();
   });

   // Shared with the mobile toolbar, which feeds the same import handler and pins the same constant.
   it('offers the drawer import family on its import picker', () => {
      const { container } = renderPanel();

      expect(container.querySelector('input[type="file"]')?.getAttribute('accept')).toBe(ACCEPT_DRAWER_IMPORT);
   });

   it('jumps to a result folder, then clears the search', () => {
      searchFor([summary('folder-a')]);
      renderPanel();

      fireEvent.click(screen.getByTestId('result-row'));

      expect(mocks.drawerActions.setDrawerCurrentFolderId).toHaveBeenCalledWith('folder-a');
      expect(mocks.drawerActions.clearSearch).toHaveBeenCalledTimes(1);
      expect(mocks.drawerActions.setDrawerCurrentFolderId.mock.invocationCallOrder[0])
         .toBeLessThan(mocks.drawerActions.clearSearch.mock.invocationCallOrder[0]);
   });
});

// The search flag is a selector, so its shape is part of the contract: an object-literal selector
// throws on mount under zustand 5, but a whole-state one is silent and merely re-renders the panel on
// every unrelated drawer write. Only a render count catches that.
describe('Drawer store subscriptions', () => {
   it('does not re-render on a drawer write the panel does not read', () => {
      renderPanel();
      const before = mocks.renders;

      act(() => { useDrawerStore.setState({ isSearching: true, isLoading: true, highlightItemId: 'item-a' }); });

      expect(mocks.renders).toBe(before);
   });

   it('re-renders once when the search flag flips', () => {
      renderPanel();
      const before = mocks.renders;

      act(() => { searchFor([summary(null)]); });

      expect(mocks.renders).toBe(before + 1);
   });
});
