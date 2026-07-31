// @vitest-environment jsdom

// -- Testing Imports --
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

// -- Type Imports --
import type { TouchEvent } from 'react';
import type { Character } from '@/lib/types/character';

/*
 * The edit-mode journal carve-out: over an editable journal body a horizontal drag is caret/selection, so the
 * card-area swipe must not step items - only the nav-bar arrows/dots do. A read-mode journal (or a card)
 * swipes normally. The swipe itself needs a device TouchSensor; this pins the branch downstream of the event.
 */

import { useMobileCardSheetGestures } from './useMobileCardSheetGestures';

const character = { id: 'c' } as unknown as Character;

const start = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] } as unknown as TouchEvent);
const end = (x: number, y: number) => ({ changedTouches: [{ clientX: x, clientY: y }] } as unknown as TouchEvent);

const mount = (overrides: Partial<Parameters<typeof useMobileCardSheetGestures>[0]> = {}) => {
   const setCurrentCardIndex = vi.fn();
   const view = renderHook(() =>
      useMobileCardSheetGestures({
         character,
         itemCount: 3,
         safeCardIndex: 1,
         isLeftHanded: false,
         isMobileFABMode: false,
         isToolbeltOpen: false,
         suppressCardAreaSwipe: false,
         setCurrentCardIndex,
         setIsToolbeltOpen: vi.fn(),
         onNavigateToTrackers: vi.fn(),
         onNavigateToCards: vi.fn(),
         ...overrides,
      }),
   );
   return { view, setCurrentCardIndex };
};

// A clearly horizontal left swipe (next item).
const swipeCardArea = (handlers: { onTouchStart: (e: TouchEvent) => void; onTouchEnd: (e: TouchEvent) => void }) => {
   handlers.onTouchStart(start(200, 100));
   handlers.onTouchEnd(end(100, 100));
};

beforeEach(cleanup);

describe('useMobileCardSheetGestures — journal swipe carve-out', () => {
   it('navigates on a card-area swipe when not suppressed (read-mode journal / card)', () => {
      const { view, setCurrentCardIndex } = mount({ suppressCardAreaSwipe: false });

      swipeCardArea(view.result.current.cardAreaHandlers);

      expect(setCurrentCardIndex).toHaveBeenCalledTimes(1);
   });

   it('does not navigate on a card-area swipe over an editable journal body', () => {
      const { view, setCurrentCardIndex } = mount({ suppressCardAreaSwipe: true });

      swipeCardArea(view.result.current.cardAreaHandlers);

      expect(setCurrentCardIndex).not.toHaveBeenCalled();
   });

   it('still steps items from the nav bar while the journal body swipe is suppressed', () => {
      const { view, setCurrentCardIndex } = mount({ suppressCardAreaSwipe: true });

      view.result.current.navBarHandlers.onTouchStart(start(200, 100));
      view.result.current.navBarHandlers.onTouchEnd(end(100, 100));

      expect(setCurrentCardIndex).toHaveBeenCalledTimes(1);
   });
});
