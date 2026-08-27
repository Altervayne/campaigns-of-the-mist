// -- Library Imports --
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// The repository read + the engine signal are mocked so the loader's logic is exercised in isolation.
// `getItem` is stubbed too: importing the version signal pulls in useDrawerItemContent, which binds it.
vi.mock('@/lib/drawer/drawerRepository', () => ({ getChildCountsForFolders: vi.fn(), getItem: vi.fn() }));
vi.mock('@/lib/drawer/drawerCommandEngine', () => ({ drawerCommandEngine: { subscribe: vi.fn() } }));

// -- Local Imports (after the mocks so the module binds the mocked deps at import) --
import { getChildCountsForFolders } from '@/lib/drawer/drawerRepository';
import { drawerCommandEngine } from '@/lib/drawer/drawerCommandEngine';
import { getDrawerContentVersion } from './useDrawerItemContent';
import {
   fetchFolderChildCounts,
   runFolderChildCountsFetch,
   folderIdsKey,
} from './useFolderChildCounts';

/*
 * The batched folder-child-count loader. Rendering isn't available in this node env, so the loader's
 * logic is factored into framework-free pieces (fetch, stale-guard runner, the id-set key) and tested
 * directly; the hook is a thin wrapper that drives a fetch off `[folderIds, version]`.
 */

describe('useFolderChildCounts loader', () => {
   beforeEach(() => {
      (getChildCountsForFolders as Mock).mockReset();
   });

   it('fetches counts for the given ids (one batched read)', async () => {
      const counts = new Map([['f1', { folderCount: 1, itemCount: 2 }]]);
      (getChildCountsForFolders as Mock).mockResolvedValueOnce(counts);

      expect(await fetchFolderChildCounts(['f1', 'f2'])).toBe(counts);
      expect(getChildCountsForFolders).toHaveBeenCalledWith(['f1', 'f2']);
   });

   it('an empty id list settles to an empty map without touching the repository', async () => {
      expect(await fetchFolderChildCounts([])).toEqual(new Map());
      expect(getChildCountsForFolders).not.toHaveBeenCalled();
   });

   it('settles to an empty map when the read throws', async () => {
      (getChildCountsForFolders as Mock).mockRejectedValueOnce(new Error('read failed'));
      expect(await fetchFolderChildCounts(['f1'])).toEqual(new Map());
   });

   it('stale-resolve guard: a result is dropped when no longer current, applied when current', async () => {
      const counts = new Map([['f1', { folderCount: 0, itemCount: 3 }]]);
      (getChildCountsForFolders as Mock).mockResolvedValue(counts);

      const onStale = vi.fn();
      await runFolderChildCountsFetch(['f1'], () => false, onStale); // id-set/version moved on mid-fetch
      expect(onStale).not.toHaveBeenCalled();

      const onCurrent = vi.fn();
      await runFolderChildCountsFetch(['f1'], () => true, onCurrent);
      expect(onCurrent).toHaveBeenCalledWith(counts);
   });

   it('the request key changes when the version bumps, so the effect re-fetches for the same ids', () => {
      // The module registered ONE engine subscription at import; grab that callback (via useDrawerItemContent).
      const engineFire = (drawerCommandEngine.subscribe as Mock).mock.calls[0][0] as () => void;
      const ids = ['f1', 'f2'];

      const before = `${folderIdsKey(ids)} ${getDrawerContentVersion()}`;
      engineFire(); // e.g. a createItem command landed under one of these folders
      const after = `${folderIdsKey(ids)} ${getDrawerContentVersion()}`;

      expect(after).not.toBe(before);
   });

   it('the request key changes when the id set changes, so a new folder list re-fetches', () => {
      expect(folderIdsKey(['f1', 'f2'])).not.toBe(folderIdsKey(['f1', 'f2', 'f3']));
   });
});
