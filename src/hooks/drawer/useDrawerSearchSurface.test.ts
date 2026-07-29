// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

// -- Hook Imports --
import { useIsDrawerSearchActive, useJumpToSearchResult } from './useDrawerSearchSurface';

// -- Store Imports --
import { useDrawerStore } from '@/lib/stores/drawerStore';

/*
 * The store stays real so the selector is genuinely subscribed - the shape is the point: a boolean
 * selector re-renders only when the browse-vs-results branch actually flips, while subscribing to the
 * criteria object would re-render on every filter edit.
 *
 * The jump's statement ORDER is the contract, so it is asserted by call order rather than by outcome:
 * both actions are synchronous store writes that React batches, so a reversed pair renders identically.
 */

const mocks = vi.hoisted(() => ({
   setDrawerCurrentFolderId: vi.fn(),
   clearSearch: vi.fn(),
}));

vi.mock('@/lib/stores/drawerStore', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@/lib/stores/drawerStore')>();
   return { ...actual, useDrawerActions: () => mocks };
});

beforeEach(() => {
   mocks.setDrawerCurrentFolderId.mockClear();
   mocks.clearSearch.mockClear();
   useDrawerStore.setState({ searchCriteria: null, searchResults: null, isSearching: false });
});
afterEach(cleanup);

describe('useIsDrawerSearchActive', () => {
   it('is false with no criteria and true once a filter is set', () => {
      const { result } = renderHook(() => useIsDrawerSearchActive());
      expect(result.current).toBe(false);

      act(() => { useDrawerStore.setState({ searchCriteria: { text: 'a' } }); });
      expect(result.current).toBe(true);
   });

   it('stays false for a sort-only criteria object', () => {
      useDrawerStore.setState({ searchCriteria: { sort: { by: 'name', direction: 'asc' } } });
      const { result } = renderHook(() => useIsDrawerSearchActive());

      expect(result.current).toBe(false);
   });

   it('does not re-render while the flag stays true across a filter edit', () => {
      let renders = 0;
      renderHook(() => { renders += 1; return useIsDrawerSearchActive(); });

      act(() => { useDrawerStore.setState({ searchCriteria: { text: 'a' } }); });
      const afterFlip = renders;
      act(() => { useDrawerStore.setState({ searchCriteria: { text: 'ab' } }); });
      act(() => { useDrawerStore.setState({ searchCriteria: { text: 'abc', games: ['LEGENDS'] } }); });

      expect(afterFlip).toBe(2);
      expect(renders).toBe(afterFlip);
   });

   it('does not re-render on a drawer write it does not read', () => {
      let renders = 0;
      renderHook(() => { renders += 1; return useIsDrawerSearchActive(); });
      const before = renders;

      act(() => { useDrawerStore.setState({ isSearching: true, searchResults: [] }); });

      expect(renders).toBe(before);
   });
});

describe('useJumpToSearchResult', () => {
   it('navigates to the result folder, then clears the search', () => {
      const { result } = renderHook(() => useJumpToSearchResult());

      act(() => result.current('folder-a'));

      expect(mocks.setDrawerCurrentFolderId).toHaveBeenCalledWith('folder-a');
      expect(mocks.clearSearch).toHaveBeenCalledTimes(1);
      // Reversing the two statements passes every assertion above and fails only this one.
      expect(mocks.setDrawerCurrentFolderId.mock.invocationCallOrder[0])
         .toBeLessThan(mocks.clearSearch.mock.invocationCallOrder[0]);
   });

   it('navigates to the root for a result whose folder is null', () => {
      const { result } = renderHook(() => useJumpToSearchResult());

      act(() => result.current(null));

      expect(mocks.setDrawerCurrentFolderId).toHaveBeenCalledWith(null);
   });
});
