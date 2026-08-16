// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

// -- Local Imports --
import { useRollTableRoll } from './useRollTableRoll';

// -- Type Imports --
import type { BoardItem, RollTableBoardContent } from '@/lib/types/board';

/*
 * The roll hook's settle path on the reduced-motion (instant) branch: a roll caches a lastRoll plus one
 * history entry, the pick is a real table member, and the write only ever rides the non-undoable cache
 * (the hook has no undoable channel to reach). The animated branch is cursor-confirmed on the board.
 */

const item = { id: 'table-1' } as unknown as BoardItem;
const content = (overrides: Partial<RollTableBoardContent> = {}): RollTableBoardContent => ({
   kind: 'roll-table',
   title: 'Loot',
   entries: [
      { id: 'a', weight: 1, text: 'a sword' },
      { id: 'b', weight: 1, text: 'a shield' },
   ],
   ...overrides,
});

// Force the instant-settle branch: report reduced-motion so no animation frame runs.
beforeEach(() => {
   window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe('useRollTableRoll', () => {
   it('caches a lastRoll and one history entry, landing on a real member', () => {
      const onCacheLastKnown = vi.fn();
      const { result } = renderHook(() => useRollTableRoll({ item, content: content(), onCacheLastKnown }));

      act(() => result.current.roll());

      expect(onCacheLastKnown).toHaveBeenCalledTimes(1);
      const [id, next] = onCacheLastKnown.mock.calls[0] as [string, RollTableBoardContent];
      expect(id).toBe('table-1');
      expect(next.lastRoll).toBeTruthy();
      expect(['a', 'b']).toContain(next.lastRoll!.entryId);
      expect(next.lastRoll!.text).toBe(next.lastRoll!.entryId === 'a' ? 'a sword' : 'a shield');
      expect(next.history).toHaveLength(1);
      expect(next.history![0].entryId).toBe(next.lastRoll!.entryId);
   });

   it('appends onto existing history newest-first', () => {
      const prior = { id: 'r0', entryId: 'a', text: 'a sword' };
      const onCacheLastKnown = vi.fn();
      const { result } = renderHook(() => useRollTableRoll({ item, content: content({ history: [prior] }), onCacheLastKnown }));

      act(() => result.current.roll());

      const [, next] = onCacheLastKnown.mock.calls[0] as [string, RollTableBoardContent];
      expect(next.history).toHaveLength(2);
      expect(next.history![1]).toEqual(prior);
   });

   it('no-ops on an empty table and stays at rest', () => {
      const onCacheLastKnown = vi.fn();
      const { result } = renderHook(() => useRollTableRoll({ item, content: content({ entries: [] }), onCacheLastKnown }));

      act(() => result.current.roll());

      expect(onCacheLastKnown).not.toHaveBeenCalled();
      expect(result.current.isRolling).toBe(false);
      expect(result.current.liveIndex).toBeNull();
   });

   it('preserves the display mode through a settled roll', () => {
      const onCacheLastKnown = vi.fn();
      const { result } = renderHook(() => useRollTableRoll({ item, content: content({ display: 'percent' }), onCacheLastKnown }));

      act(() => result.current.roll());

      const [, next] = onCacheLastKnown.mock.calls[0] as [string, RollTableBoardContent];
      expect(next.display).toBe('percent');
   });
});
