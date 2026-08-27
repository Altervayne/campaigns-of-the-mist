// -- React Imports --
import { useEffect, useState, useSyncExternalStore } from 'react';

// -- Drawer Data Layer Imports --
import { getChildCountsForFolders } from '@/lib/drawer/drawerRepository';

// -- Invalidation Imports --
import { subscribeDrawerContentVersion, getDrawerContentVersion } from './useDrawerItemContent';

/*
 * Resolves the direct-child count of many folders at once, for the folder rows that read as enterable
 * containers (the side panel + the Expanded Library side-nav). Counts are DIRECT children only, matching
 * `getChildCountsForFolders` - not recursive.
 *
 * Invalidation rides the same content-version signal as useDrawerItemContent (one engine subscription ->
 * a module version), so ANY drawer mutation re-runs the batched fetch and the counts stay live. One
 * batched read per folder list, never an N+1 of single-count calls.
 */

/** Direct-child counts for one folder: `folderCount` subfolders + `itemCount` items. */
export interface FolderChildCounts {
   folderCount: number;
   itemCount: number;
}

// ==================
//  Fetch (framework-free, so the behavior is unit-testable without rendering)
// ==================

/** A stable key over an id list, so an effect re-runs only when the SET of ids changes. */
export function folderIdsKey(folderIds: string[]): string {
   return folderIds.join(' ');
}

/**
 * Fetches direct-child counts for `folderIds` in one batched read. An empty list settles to an empty
 * map without touching the repository; a read error settles to an empty map (no counts, no crash).
 */
export async function fetchFolderChildCounts(folderIds: string[]): Promise<Map<string, FolderChildCounts>> {
   if (folderIds.length === 0) return new Map();
   try {
      return await getChildCountsForFolders(folderIds);
   } catch {
      return new Map();
   }
}

/**
 * Runs a counts fetch and hands the result to `onSettle` ONLY while `isCurrent()` still holds - the
 * stale-resolve guard, so a slow fetch for an old id-set/version never paints over a newer one.
 */
export async function runFolderChildCountsFetch(
   folderIds: string[],
   isCurrent: () => boolean,
   onSettle: (result: Map<string, FolderChildCounts>) => void,
): Promise<void> {
   const result = await fetchFolderChildCounts(folderIds);
   if (isCurrent()) onSettle(result);
}

// ==================
//  The hook
// ==================

/**
 * Resolves the direct-child counts of a folder list, re-fetching on any drawer mutation.
 *
 * @param folderIds - The folder ids whose rows are on screen.
 * @returns A map keyed by folder id (empty while the first fetch for the current id-set/version settles).
 */
export function useFolderChildCounts(folderIds: string[]): Map<string, FolderChildCounts> {
   const version = useSyncExternalStore(subscribeDrawerContentVersion, getDrawerContentVersion);
   // The request the state must reflect; settling for a stale key reads as still-loading (empty map).
   const requestKey = `${folderIdsKey(folderIds)} ${version}`;
   const [settled, setSettled] = useState<{ key: string; counts: Map<string, FolderChildCounts> } | null>(null);

   useEffect(() => {
      let cancelled = false;
      // setState lands only in the async settle (a microtask) - never synchronously in the effect.
      void runFolderChildCountsFetch(folderIds, () => !cancelled, (counts) => setSettled({ key: requestKey, counts }));
      return () => {
         cancelled = true;
      };
   }, [folderIds, requestKey]);

   return settled?.key === requestKey ? settled.counts : new Map();
}
