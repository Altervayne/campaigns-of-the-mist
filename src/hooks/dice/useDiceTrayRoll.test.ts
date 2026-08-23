// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

// -- Local Imports --
import { useDiceTrayRoll } from './useDiceTrayRoll';
import type { DiceTrayContent } from '@/lib/dice/diceTrayTypes';

/*
 * The reveal's settle path: a roll animates over rAF, then settles into lastRoll + a history entry. Two
 * interruptions must not lose or corrupt data - an unmount mid-reveal (panel closed / tab switched) still
 * records the roll, and a tray edit made during the reveal survives the settle instead of being clobbered by
 * the snapshot the roll started from. rAF is driven manually so the reveal can be paused mid-flight.
 */

let rafCallbacks: FrameRequestCallback[] = [];
beforeEach(() => {
   rafCallbacks = [];
   vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => rafCallbacks.push(cb));
   vi.stubGlobal('cancelAnimationFrame', () => {});
   vi.stubGlobal('matchMedia', () => ({ matches: false }) as MediaQueryList); // not reduced-motion, so it animates
});
afterEach(() => {
   cleanup();
   vi.unstubAllGlobals();
});

/** Run the queued rAF callbacks at timestamp `now` (a large value settles every die at once). */
const runFrame = (now: number) => {
   const due = rafCallbacks;
   rafCallbacks = [];
   for (const cb of due) cb(now);
};

const tray = (over: Partial<DiceTrayContent> = {}): DiceTrayContent => ({ dice: [{ id: 'd1', sides: 6 }], modifiers: [], ...over });

const setup = (initial: DiceTrayContent, onCacheRoll = vi.fn()) => {
   const view = renderHook(({ content }: { content: DiceTrayContent }) =>
      useDiceTrayRoll({ tray: content, dice: content.dice, modifiers: content.modifiers, modifierTotal: 0, onCacheRoll, pendingRoll: false }),
      { initialProps: { content: initial } },
   );
   return { view, onCacheRoll };
};

describe('useDiceTrayRoll reveal interruptions', () => {
   it('records the roll when the tray unmounts mid-reveal (does not drop it)', () => {
      const { view, onCacheRoll } = setup(tray());
      act(() => view.result.current.roll());
      expect(onCacheRoll).not.toHaveBeenCalled(); // still animating, not settled

      act(() => view.unmount()); // panel closed / tab switched before the reveal finishes

      expect(onCacheRoll).toHaveBeenCalledTimes(1);
      const cached = onCacheRoll.mock.calls[0][0] as DiceTrayContent;
      expect(cached.lastRoll).toBeTruthy();
      expect(cached.history).toHaveLength(1);
   });

   it('settles onto edits made during the reveal instead of the roll-time snapshot', () => {
      const { view, onCacheRoll } = setup(tray({ title: 'before' }));
      act(() => view.result.current.roll());
      act(() => view.rerender({ content: tray({ title: 'after' }) })); // user renames the tray mid-reveal
      act(() => runFrame(10_000)); // large elapsed -> every die settles -> settle fires

      expect(onCacheRoll).toHaveBeenCalled();
      const cached = onCacheRoll.mock.calls.at(-1)![0] as DiceTrayContent;
      expect(cached.title).toBe('after'); // the edit is preserved, not clobbered back to 'before'
      expect(cached.lastRoll).toBeTruthy();
   });

   it('does not fire a settle on unmount when nothing is animating', () => {
      const { view, onCacheRoll } = setup(tray());
      act(() => view.unmount()); // never rolled
      expect(onCacheRoll).not.toHaveBeenCalled();
   });
});
