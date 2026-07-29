// -- React Imports --
import { useEffect } from 'react';

// -- Utils Imports --
import { preventImageDragOut } from '@/lib/utils/imageDrag';

/*
 * Installs the app-wide native image drag-out guard, once, for the app's lifetime. `dragstart` bubbles, so a
 * single window listener covers every image on every surface - including images added later and ones built
 * imperatively (the CM6 note widgets) - where a per-`<img>` attribute leaks the moment a new one forgets it.
 */
export function useImageDragGuard(): void {
   useEffect(() => {
      window.addEventListener('dragstart', preventImageDragOut);
      return () => window.removeEventListener('dragstart', preventImageDragOut);
   }, []);
}
