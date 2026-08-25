// -- Library Imports --
import { describe, expect, it, vi } from 'vitest';

// -- Local Imports --
import { createDebouncer } from './createDebouncer';

/*
 * Unit tests for the shared trailing-edge debouncer: it runs after the delay, coalesces to the
 * latest value, and `cancel` disarms a pending run. Uses fake timers so the delay is deterministic.
 */

describe('createDebouncer', () => {
   it('runs once after the delay with the latest value', () => {
      vi.useFakeTimers();
      const run = vi.fn<(value: number) => void>();
      const debouncer = createDebouncer(100, run);

      debouncer.run(1);
      debouncer.run(2);
      debouncer.run(3);
      expect(run).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(3);
      vi.useRealTimers();
   });

   it('cancel disarms a pending run', () => {
      vi.useFakeTimers();
      const run = vi.fn<(value: number) => void>();
      const debouncer = createDebouncer(100, run);

      debouncer.run(1);
      debouncer.cancel();
      vi.advanceTimersByTime(200);
      expect(run).not.toHaveBeenCalled();
      vi.useRealTimers();
   });
});
