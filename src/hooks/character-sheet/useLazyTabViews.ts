// -- React Imports --
import { useEffect } from 'react';

// The note and board surfaces are deferred: each pulls in a heavy stack (the
// note editor drags in the whole markdown/inspector chain incl. the ~500 KiB CodeMirror
// vendor, the board its canvas engine) that only the matching tab needs. Splitting them
// off keeps the sheet's first paint lean; the async chunks are still glob-precached, so
// both stay fully offline. The thunks are named so the on-idle prefetch below warms the
// SAME module cache Vite dedupes, and the first board/note open never blocks on a cold fetch.
export const importNoteView = () => import('@/components/organisms/note/NoteView');
export const importBoardView = () => import('@/components/organisms/board/BoardView');

/**
 * Prefetches the note + board lazy chunks once the app is idle after boot, so the first open of either
 * tab paints instantly instead of waiting 3-4s on a cold fetch of its chunk (CodeMirror is the heavy one).
 * `requestIdleCallback` so it never contends with boot; a `setTimeout` fallback for browsers without it
 * (Safari). Fire-and-forget - a failed prefetch just leaves the normal lazy-load to fetch on first open.
 */
export function usePrefetchTabChunks(): void {
   useEffect(() => {
      const prefetch = () => { void importNoteView(); void importBoardView(); };
      const w = window as Window & {
         requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
         cancelIdleCallback?: (id: number) => void;
      };
      if (typeof w.requestIdleCallback === 'function') {
         const id = w.requestIdleCallback(prefetch, { timeout: 3000 });
         return () => w.cancelIdleCallback?.(id);
      }
      const id = window.setTimeout(prefetch, 1500);
      return () => window.clearTimeout(id);
   }, []);
}
