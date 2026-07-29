// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

// -- Component Imports --
import { ExpandedDrawer } from './ExpandedDrawer';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useDrawerStore } from '@/lib/stores/drawerStore';

// -- Type Imports --
import type { DrawerItemSummary } from '@/lib/drawer/drawerRepository';

/*
 * The Library's share of the drawer-surface wiring: the mount load, the browse-vs-results branch, and a
 * result's jump-to. Same three the side panel and the mobile drawer pin, asserted here against this
 * surface so a break in the shared hook cannot hide behind another adopter's coverage.
 */

const mocks = vi.hoisted(() => ({
   // Renders of the Library, counted from the header mock: an unmemoized direct child, so it renders
   // once per Library render.
   renders: 0,
   drawerActions: {
      reloadCurrentFolder: vi.fn(),
      setDrawerCurrentFolderId: vi.fn(),
      clearSearch: vi.fn(),
   },
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

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

// The Library measures its parent to tween the entrance width; jsdom ships no ResizeObserver.
class ResizeObserverStub {
   observe() {}
   unobserve() {}
   disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

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

const renderLibrary = () => render(
   <ExpandedDrawer
      isItemDragActive={false}
      isFolderDragActive={false}
      workspaceDwellKey={null}
      activeDragId={null}
      overDragId={null}
   />,
);

beforeEach(() => {
   mocks.renders = 0;
   mocks.drawerActions.reloadCurrentFolder.mockClear();
   mocks.drawerActions.setDrawerCurrentFolderId.mockClear();
   mocks.drawerActions.clearSearch.mockClear();
   useDrawerStore.setState({ searchCriteria: null, searchResults: null, isSearching: false });
   useAppSettingsStore.setState({ isCompactDrawer: false });
});
afterEach(cleanup);

describe('ExpandedDrawer surface wiring', () => {
   it('loads the current folder once on mount', () => {
      renderLibrary();

      expect(mocks.drawerActions.reloadCurrentFolder).toHaveBeenCalledTimes(1);
   });

   it('swaps the browse grid for the results while a search is active', () => {
      renderLibrary();
      expect(screen.getByTestId('item-row')).toBeTruthy();

      act(() => { searchFor([summary(null)]); });

      expect(screen.getByTestId('result-row')).toBeTruthy();
      expect(screen.queryByTestId('item-row')).toBeNull();
   });

   it('jumps to a result folder, then clears the search', () => {
      searchFor([summary('folder-a')]);
      renderLibrary();

      fireEvent.click(screen.getByTestId('result-row'));

      expect(mocks.drawerActions.setDrawerCurrentFolderId).toHaveBeenCalledWith('folder-a');
      expect(mocks.drawerActions.clearSearch).toHaveBeenCalledTimes(1);
      expect(mocks.drawerActions.setDrawerCurrentFolderId.mock.invocationCallOrder[0])
         .toBeLessThan(mocks.drawerActions.clearSearch.mock.invocationCallOrder[0]);
   });
});

// Same selector-shape contract the side panel carries: a widened selector is silent and only a render
// count shows it re-rendering the Library on every unrelated drawer write.
describe('ExpandedDrawer store subscriptions', () => {
   it('does not re-render on a drawer write the Library does not read', () => {
      renderLibrary();
      const before = mocks.renders;

      act(() => { useDrawerStore.setState({ isSearching: true, isLoading: true, highlightItemId: 'item-a' }); });

      expect(mocks.renders).toBe(before);
   });

   it('re-renders once when the search flag flips', () => {
      renderLibrary();
      const before = mocks.renders;

      act(() => { searchFor([summary(null)]); });

      expect(mocks.renders).toBe(before + 1);
   });
});
