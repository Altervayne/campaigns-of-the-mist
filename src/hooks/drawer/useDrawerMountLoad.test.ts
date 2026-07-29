// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

// -- Hook Imports --
import { useDrawerMountLoad } from './useDrawerMountLoad';

/*
 * The three drawer surfaces share this mount load, so it is pinned once here and once per surface.
 * The action comes from the store's stable action bag: the effect must fire on mount and on a remount,
 * and never again on a re-render.
 */

const mocks = vi.hoisted(() => ({
   reloadCurrentFolder: vi.fn(),
}));

vi.mock('@/lib/stores/drawerStore', () => ({
   useDrawerActions: () => ({ reloadCurrentFolder: mocks.reloadCurrentFolder }),
}));

beforeEach(() => mocks.reloadCurrentFolder.mockClear());
afterEach(cleanup);

describe('useDrawerMountLoad', () => {
   it('loads the current folder once on mount', () => {
      renderHook(() => useDrawerMountLoad());

      expect(mocks.reloadCurrentFolder).toHaveBeenCalledTimes(1);
   });

   it('does not reload on a re-render', () => {
      const { rerender } = renderHook(() => useDrawerMountLoad());
      rerender();
      rerender();

      expect(mocks.reloadCurrentFolder).toHaveBeenCalledTimes(1);
   });

   it('reloads when the surface remounts', () => {
      const { unmount } = renderHook(() => useDrawerMountLoad());
      unmount();
      renderHook(() => useDrawerMountLoad());

      expect(mocks.reloadCurrentFolder).toHaveBeenCalledTimes(2);
   });
});
