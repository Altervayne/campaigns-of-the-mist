// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

// -- Component Imports --
import MobileDrawer from './MobileDrawer';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useDrawerStore } from '@/lib/stores/drawerStore';

// -- Type Imports --
import type { DrawerItemSummary } from '@/lib/drawer/drawerRepository';

/*
 * Locks the drawer's structure: the browse-vs-results ternary (one JSX position, so the outgoing branch
 * unmounts outright), the three tutorial anchors it owns, the toolbar sitting OUTSIDE the ternary, which
 * context menu carries `onJumpTo`, and the forwarding of both host callbacks to both menus.
 *
 * The last describe pins the subscription shape. One `useStore(selector)` call per value is the whole
 * contract: an object-literal selector throws on mount under zustand 5, but a whole-state selector is
 * silent and merely re-renders the drawer on every unrelated store write. Only a render count catches it.
 *
 * Everything below the component is mocked: this covers the drawer's own wiring, not its children.
 */

interface MenuProps {
   isOpen: boolean;
   onJumpTo?: () => void;
   onAddToCharacter?: (item: unknown) => void;
   onLoadCharacter?: (item: unknown) => void;
}

const mocks = vi.hoisted(() => ({
   // Renders of the drawer, counted from the search-bar mock: an unmemoized direct child, so it renders
   // once per drawer render.
   renders: 0,
   // Only the fields the drawer itself reads - the rows are mocked, so the records need no content.
   folders: [] as { id: string; name: string }[],
   items: [] as { id: string; name: string }[],
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

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
// Echo the i18n key instead of standing up a provider - the branch copy is asserted by key.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The store stays real so its selectors are genuinely subscribed; only the action bag is stubbed, so the
// mount reload never reaches Dexie.
vi.mock('@/lib/stores/drawerStore', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@/lib/stores/drawerStore')>();
   return { ...actual, useDrawerActions: () => mocks.drawerActions };
});
vi.mock('@/hooks/drawer/useDrawerNavigation', () => ({
   useDrawerNavigation: () => ({
      currentFolderId: null,
      navigateToFolder: () => {},
      currentItems: mocks.items,
      currentFolders: mocks.folders,
      breadcrumbPath: [],
      childCounts: new Map(),
   }),
}));

vi.mock('@/components/molecules/drawer/DrawerSearchBar', () => ({
   DrawerSearchBar: () => {
      mocks.renders += 1;
      return <div data-testid="search-bar" />;
   },
}));
vi.mock('@/components/molecules/drawer/DrawerListRow', () => ({
   DrawerListRow: ({ name }: { name: string }) => <span data-testid="result-row">{name}</span>,
}));
vi.mock('@/components/organisms/drawer/DrawerItemPreview', () => ({ DrawerItemPreview: () => null }));
vi.mock('@/components/mobile/drawer/MobileBreadcrumbs', () => ({ default: () => <div data-testid="breadcrumbs" /> }));
vi.mock('@/components/mobile/drawer/MobileFolderItem', () => ({ default: () => <div data-testid="folder-row" /> }));
vi.mock('@/components/mobile/drawer/MobileDrawerItem', () => ({ default: () => <div data-testid="item-row" /> }));
vi.mock('@/components/mobile/drawer/MobileAddFolderSheet', () => ({ default: () => <div data-testid="add-folder-sheet" /> }));
vi.mock('@/components/mobile/drawer/MobileDrawerContextMenu', () => ({
   default: ({ isOpen, onJumpTo, onAddToCharacter, onLoadCharacter }: MenuProps) => (
      <div
         data-testid="context-menu"
         data-open={String(isOpen)}
         data-has-jump={String(onJumpTo != null)}
         data-has-add={String(onAddToCharacter != null)}
         data-has-load={String(onLoadCharacter != null)}
      />
   ),
}));

const summary = (id: string, name: string): DrawerItemSummary => ({
   id,
   name,
   type: 'CHARACTER_CARD',
   game: 'LEGENDS',
   parentFolderId: null,
   createdAt: 0,
   updatedAt: 0,
});

const anchors = (name: string) => document.querySelectorAll(`[data-tutorial="${name}"]`);
const menus = () => screen.getAllByTestId('context-menu');
const searchFor = (text: string, results: DrawerItemSummary[] | null, isSearching = false) => {
   useDrawerStore.setState({ searchCriteria: { text }, searchResults: results, isSearching });
};

beforeEach(() => {
   mocks.renders = 0;
   mocks.folders = [{ id: 'folder-a', name: 'Folder A' }];
   mocks.items = [{ id: 'item-a', name: 'Item A' }];
   useDrawerStore.setState({
      searchCriteria: null,
      searchResults: null,
      isSearching: false,
      isLoading: false,
      canUndo: false,
      canRedo: false,
      highlightItemId: null,
   });
   useAppSettingsStore.setState({
      mobileHandedness: 'right',
      isMobileFABMode: false,
      areGestureHintsEnabled: false,
      hasSeenDrawerMenuHint: true,
      layersPanelOpen: false,
      isNoteOutlineOpen: false,
   });
});
afterEach(cleanup);

describe('MobileDrawer body branch', () => {
   it('renders the browse tree and the breadcrumbs when no search is active', () => {
      render(<MobileDrawer />);

      expect(screen.getByTestId('folder-row')).toBeTruthy();
      expect(screen.getByTestId('item-row')).toBeTruthy();
      expect(screen.getByTestId('breadcrumbs')).toBeTruthy();
      expect(screen.queryByTestId('result-row')).toBeNull();
   });

   it('swaps the browse tree for the results and drops the breadcrumbs when a search is active', () => {
      searchFor('a', [summary('result-a', 'Result A')]);
      render(<MobileDrawer />);

      expect(screen.getByTestId('result-row')).toBeTruthy();
      expect(screen.queryByTestId('folder-row')).toBeNull();
      expect(screen.queryByTestId('item-row')).toBeNull();
      expect(screen.queryByTestId('breadcrumbs')).toBeNull();
   });

   it('unmounts the browse tree when a search starts', () => {
      const { rerender } = render(<MobileDrawer />);
      expect(screen.getByTestId('folder-row')).toBeTruthy();

      act(() => { searchFor('a', [summary('result-a', 'Result A')]); });
      rerender(<MobileDrawer />);

      expect(screen.queryByTestId('folder-row')).toBeNull();
   });

   it('shows the searching message while a search is in flight', () => {
      searchFor('a', null, true);
      render(<MobileDrawer />);

      expect(screen.getByText('Drawer.search.searching')).toBeTruthy();
      expect(screen.queryByTestId('result-row')).toBeNull();
   });

   it('shows the no-matches message for an empty result set', () => {
      searchFor('a', []);
      render(<MobileDrawer />);

      expect(screen.getByText('Drawer.search.noMatches')).toBeTruthy();
   });

   it('shows the empty-drawer copy at the root of an empty drawer', () => {
      mocks.folders = [];
      mocks.items = [];
      render(<MobileDrawer />);

      expect(screen.getByText('Drawer.emptyDrawer')).toBeTruthy();
   });
});

describe('MobileDrawer tutorial anchors and toolbar', () => {
   it('carries each owned anchor exactly once while browsing', () => {
      render(<MobileDrawer />);

      expect(anchors('drawer-content').length).toBe(1);
      expect(anchors('drawer-toolbar').length).toBe(1);
      expect(anchors('drawer-view-toggle').length).toBe(1);
   });

   // The tutorial resolves anchors by global querySelector and MEASURES their rects, so an anchor moved
   // onto a wrapper still resolves but positions the step against the wrong box.
   it('keeps each anchor on its own element, not on a wrapper', () => {
      const { container } = render(<MobileDrawer />);

      expect(anchors('drawer-content')[0]).toBe(container.firstElementChild);
      expect(anchors('drawer-view-toggle')[0].tagName).toBe('BUTTON');
      expect(anchors('drawer-toolbar')[0].contains(anchors('drawer-view-toggle')[0])).toBe(true);
   });

   it('keeps the toolbar and its anchors mounted while a search is active', () => {
      searchFor('a', [summary('result-a', 'Result A')]);
      render(<MobileDrawer />);

      expect(anchors('drawer-content').length).toBe(1);
      expect(anchors('drawer-toolbar').length).toBe(1);
      expect(anchors('drawer-view-toggle').length).toBe(1);
   });

   it('keeps the hidden import form and its file input inside the toolbar', () => {
      render(<MobileDrawer />);

      const form = anchors('drawer-toolbar')[0].querySelector('form');
      expect(form).not.toBeNull();
      expect(form?.querySelector('input[type="file"]')).not.toBeNull();
   });
});

describe('MobileDrawer context menus', () => {
   it('mounts both menus closed, with only the result menu carrying onJumpTo', () => {
      render(<MobileDrawer />);

      const [browse, result] = menus();
      expect(browse.getAttribute('data-open')).toBe('false');
      expect(result.getAttribute('data-open')).toBe('false');
      expect(browse.getAttribute('data-has-jump')).toBe('false');
      expect(result.getAttribute('data-has-jump')).toBe('false');
   });

   it('opens the result menu with onJumpTo when a result row is tapped', () => {
      searchFor('a', [summary('result-a', 'Result A')]);
      render(<MobileDrawer />);

      fireEvent.click(screen.getByTestId('result-row').closest('button')!);

      const [browse, result] = menus();
      expect(result.getAttribute('data-open')).toBe('true');
      expect(result.getAttribute('data-has-jump')).toBe('true');
      expect(browse.getAttribute('data-open')).toBe('false');
      expect(browse.getAttribute('data-has-jump')).toBe('false');
   });

   it('forwards both host callbacks to both menus', () => {
      render(<MobileDrawer onAddToCharacter={() => {}} onLoadCharacter={() => {}} />);

      for (const menu of menus()) {
         expect(menu.getAttribute('data-has-add')).toBe('true');
         expect(menu.getAttribute('data-has-load')).toBe('true');
      }
   });
});

describe('MobileDrawer store subscriptions', () => {
   const renderDrawer = () => {
      render(<MobileDrawer />);
      return mocks.renders;
   };

   it('does not re-render on an app-settings write the drawer does not read', () => {
      const before = renderDrawer();

      act(() => { useAppSettingsStore.setState({ layersPanelOpen: true, isNoteOutlineOpen: true }); });

      expect(mocks.renders).toBe(before);
   });

   it('does not re-render on a drawer write the drawer does not read', () => {
      const before = renderDrawer();

      act(() => { useDrawerStore.setState({ isLoading: true, highlightItemId: 'item-a' }); });

      expect(mocks.renders).toBe(before);
   });

   it('re-renders once on a setting the drawer does read', () => {
      const before = renderDrawer();

      act(() => { useAppSettingsStore.setState({ mobileHandedness: 'left' }); });

      expect(mocks.renders).toBe(before + 1);
   });

   it('re-renders once on a drawer field the drawer does read', () => {
      const before = renderDrawer();

      act(() => { useDrawerStore.setState({ canUndo: true }); });

      expect(mocks.renders).toBe(before + 1);
   });
});
