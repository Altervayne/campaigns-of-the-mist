/**
 * A trailing-edge debouncer with an explicit `cancel`, so `flush` can write-now AND disarm the pending
 * timer. Without the cancel, an evicted-then-revisited instance could let a stale late write clobber a fresh
 * edit. At most one timer in flight. No new dependency.
 */
export function createDebouncer<T>(delay: number, run: (value: T) => void): { run: (value: T) => void; cancel: () => void } {
   let timer: ReturnType<typeof setTimeout> | null = null;
   return {
      run: (value: T) => {
         if (timer) clearTimeout(timer);
         timer = setTimeout(() => {
            timer = null;
            run(value);
         }, delay);
      },
      cancel: () => {
         if (timer) {
            clearTimeout(timer);
            timer = null;
         }
      },
   };
}
