// -- React Imports --
import { useEffect } from 'react';

// -- Store Imports --
import { useDrawerActions } from '@/lib/stores/drawerStore';

/**
 * Loads the current-folder view when a drawer surface mounts.
 *
 * The store loads the view on demand (it is not auto-loaded on import), so each surface that shows
 * folder contents triggers the initial load itself; reopening a drawer remounts and refreshes it.
 */
export function useDrawerMountLoad() {
   const { reloadCurrentFolder } = useDrawerActions();

   useEffect(() => {
      void reloadCurrentFolder();
   }, [reloadCurrentFolder]);
}
