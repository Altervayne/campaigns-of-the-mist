// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

// Hoisted so the module-mock factories (which run above the imports) can close over them without a TDZ hit.
const { mobileCloseSheet, saveCharacterAsToDrawer, saveCharacterToLinkedDrawerItem } = vi.hoisted(() => ({
   mobileCloseSheet: vi.fn(),
   saveCharacterAsToDrawer: vi.fn(),
   saveCharacterToLinkedDrawerItem: vi.fn(async (_character?: unknown) => ({ linkedItemUpdated: true })),
}));

const characterState = {
   character: null as { id: string; drawerItemId?: string } | null,
   hasUnsavedChanges: false,
};

vi.mock('@/lib/character/tabManagerStore', () => ({
   useTabManagerActions: () => ({ mobileCloseSheet }),
}));
vi.mock('@/lib/stores/characterStore', () => ({
   useCharacterStore: (selector: (state: typeof characterState) => unknown) => selector(characterState),
}));
vi.mock('@/hooks/useSaveToDrawer', () => ({
   useSaveToDrawer: () => ({ saveCharacterAsToDrawer }),
}));
vi.mock('@/lib/character/characterRepository', () => ({
   saveCharacterToLinkedDrawerItem,
}));

import { useCloseSheet } from './useCloseSheet';

beforeEach(() => {
   characterState.character = null;
   characterState.hasUnsavedChanges = false;
   saveCharacterToLinkedDrawerItem.mockResolvedValue({ linkedItemUpdated: true });
});

afterEach(() => {
   cleanup();
   mobileCloseSheet.mockClear();
   saveCharacterAsToDrawer.mockClear();
   saveCharacterToLinkedDrawerItem.mockClear();
});

describe('useCloseSheet variant selection', () => {
   it('is clean when there are no unsaved changes', () => {
      characterState.character = { id: 'x', drawerItemId: 'item-1' };
      characterState.hasUnsavedChanges = false;

      expect(renderHook(() => useCloseSheet()).result.current.variant).toBe('clean');
   });

   it('is dirty-linked when dirty and linked to a drawer item', () => {
      characterState.character = { id: 'x', drawerItemId: 'item-1' };
      characterState.hasUnsavedChanges = true;

      expect(renderHook(() => useCloseSheet()).result.current.variant).toBe('dirty-linked');
   });

   it('is dirty-unlinked when dirty and never saved', () => {
      characterState.character = { id: 'x' };
      characterState.hasUnsavedChanges = true;

      expect(renderHook(() => useCloseSheet()).result.current.variant).toBe('dirty-unlinked');
   });
});

describe('useCloseSheet request/cancel', () => {
   it('stages a confirm on request without tearing down', () => {
      const { result } = renderHook(() => useCloseSheet());

      expect(result.current.pendingClose).toBe(false);
      act(() => result.current.requestClose());

      expect(result.current.pendingClose).toBe(true);
      expect(mobileCloseSheet).not.toHaveBeenCalled();
   });

   it('cancel dismisses without tearing down or saving', () => {
      const { result } = renderHook(() => useCloseSheet());

      act(() => result.current.requestClose());
      act(() => result.current.cancelClose());

      expect(result.current.pendingClose).toBe(false);
      expect(mobileCloseSheet).not.toHaveBeenCalled();
      expect(saveCharacterToLinkedDrawerItem).not.toHaveBeenCalled();
      expect(saveCharacterAsToDrawer).not.toHaveBeenCalled();
   });
});

describe('useCloseSheet clean close', () => {
   it('tears down without saving', () => {
      characterState.character = { id: 'x', drawerItemId: 'item-1' };
      const { result } = renderHook(() => useCloseSheet());

      act(() => result.current.requestClose());
      act(() => result.current.close());

      expect(mobileCloseSheet).toHaveBeenCalledTimes(1);
      expect(saveCharacterToLinkedDrawerItem).not.toHaveBeenCalled();
      expect(saveCharacterAsToDrawer).not.toHaveBeenCalled();
      expect(result.current.pendingClose).toBe(false);
   });
});

describe('useCloseSheet dirty + linked', () => {
   beforeEach(() => {
      characterState.character = { id: 'x', drawerItemId: 'item-1' };
      characterState.hasUnsavedChanges = true;
   });

   it('Save & Close awaits the save BEFORE tearing down', async () => {
      let resolveSave: (value: { linkedItemUpdated: boolean }) => void = () => {};
      saveCharacterToLinkedDrawerItem.mockReturnValue(
         new Promise((resolve) => { resolveSave = resolve; }),
      );
      const { result } = renderHook(() => useCloseSheet());

      let done!: Promise<void>;
      act(() => { done = result.current.saveAndClose(); });

      // Save is in flight; the working row must NOT be dropped yet.
      expect(saveCharacterToLinkedDrawerItem).toHaveBeenCalledTimes(1);
      expect(mobileCloseSheet).not.toHaveBeenCalled();

      await act(async () => { resolveSave({ linkedItemUpdated: true }); await done; });
      expect(mobileCloseSheet).toHaveBeenCalledTimes(1);
   });

   it('Close Without Saving tears down with no save', () => {
      const { result } = renderHook(() => useCloseSheet());

      act(() => result.current.close());

      expect(mobileCloseSheet).toHaveBeenCalledTimes(1);
      expect(saveCharacterToLinkedDrawerItem).not.toHaveBeenCalled();
   });

   it('Save & Close over a dangling link falls back to the naming flow and does NOT tear down', async () => {
      saveCharacterToLinkedDrawerItem.mockResolvedValue({ linkedItemUpdated: false });
      const { result } = renderHook(() => useCloseSheet());

      await act(async () => { await result.current.saveAndClose(); });

      expect(saveCharacterAsToDrawer).toHaveBeenCalledTimes(1);
      expect(mobileCloseSheet).not.toHaveBeenCalled();
   });
});

describe('useCloseSheet dirty + unlinked (never saved)', () => {
   beforeEach(() => {
      characterState.character = { id: 'x' };
      characterState.hasUnsavedChanges = true;
   });

   it('Save to Drawer opens the naming flow and does NOT tear down', () => {
      const { result } = renderHook(() => useCloseSheet());

      act(() => result.current.requestClose());
      act(() => result.current.saveToDrawer());

      expect(saveCharacterAsToDrawer).toHaveBeenCalledTimes(1);
      expect(mobileCloseSheet).not.toHaveBeenCalled();
      expect(result.current.pendingClose).toBe(false); // confirm dismissed so it isn't stacked under the naming window
   });

   it('Close Without Saving loses the never-saved character with no save', () => {
      const { result } = renderHook(() => useCloseSheet());

      act(() => result.current.close());

      expect(mobileCloseSheet).toHaveBeenCalledTimes(1);
      expect(saveCharacterAsToDrawer).not.toHaveBeenCalled();
      expect(saveCharacterToLinkedDrawerItem).not.toHaveBeenCalled();
   });
});
