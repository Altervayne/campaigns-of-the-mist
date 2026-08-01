// -- Library Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// -- Mocked persistence boundary --
const { patchNoteSpy } = vi.hoisted(() => ({ patchNoteSpy: vi.fn() }));
vi.mock('@/lib/notes/noteRepository', () => ({
   getNote: vi.fn(),
   patchNote: patchNoteSpy,
   linkNoteToDrawerItem: vi.fn(),
   saveNoteToLinkedDrawerItem: vi.fn(),
}));

// -- Local Imports --
import { createNoteStore } from './noteStore';

/*
 * Guards the note-store data-loss fix: `flush` must write NOW and disarm the pending debounce timer, so an
 * evicted-then-revisited note can't let a stale late write clobber a fresher edit. The assertion FAILS if the
 * cancel is dropped from `flush` (the timer would fire a second, stale write after the flush).
 */

describe('noteStore flush cancels the pending debounce', () => {
   beforeEach(() => {
      vi.useFakeTimers();
      patchNoteSpy.mockReset();
      patchNoteSpy.mockResolvedValue(undefined);
   });
   afterEach(() => {
      vi.useRealTimers();
   });

   it('writes immediately AND disarms the armed timer, so no stale late write fires', () => {
      const useStore = createNoteStore({ saveDebounceMs: 400 });
      useStore.getState().actions.loadNote({ id: 'N', title: 'T', body: 'v0' });

      useStore.getState().actions.updateBody('STALE'); // arms a 400ms write of 'STALE'
      expect(patchNoteSpy).not.toHaveBeenCalled();

      useStore.getState().actions.flush(); // writes now + cancels the armed timer
      expect(patchNoteSpy).toHaveBeenCalledTimes(1);
      expect(patchNoteSpy).toHaveBeenLastCalledWith('N', expect.objectContaining({ body: 'STALE' }));

      // The cancelled timer must NOT fire a second, stale write once its delay elapses.
      vi.advanceTimersByTime(2000);
      expect(patchNoteSpy).toHaveBeenCalledTimes(1);
   });

   it('a normal debounced edit still writes once when NOT flushed (the timer is live)', () => {
      const useStore = createNoteStore({ saveDebounceMs: 400 });
      useStore.getState().actions.loadNote({ id: 'N', title: 'T', body: 'v0' });

      useStore.getState().actions.updateBody('LIVE');
      expect(patchNoteSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(400);
      expect(patchNoteSpy).toHaveBeenCalledTimes(1);
      expect(patchNoteSpy).toHaveBeenLastCalledWith('N', expect.objectContaining({ body: 'LIVE' }));
   });
});
