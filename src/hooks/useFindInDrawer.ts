// -- React Imports --
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Library Imports --
import toast from 'react-hot-toast';

// -- Repository / Store Imports --
import { getItem } from '@/lib/drawer/drawerRepository';
import { useDrawerStore } from '@/lib/stores/drawerStore';

// -- Portals Imports --
import { revealDrawerItem } from '@/lib/portals/revealDrawerItem';

/*
 * Find-in-Drawer for a workspace: given the workspace's saved `drawerItemId`, reveals that row in the
 * drawer (open + navigate to its folder + pulse). One source of behaviour shared by the sidebar chrome, so
 * the entry points can't drift on what the action does. A deleted item toasts and no-ops.
 */

/**
 * Reactively resolves whether `drawerItemId` points at an item that ACTUALLY exists in the drawer. A first
 * save sets the workspace's id via `linkToDrawerItem` BEFORE its naming window is confirmed - and a cancel
 * leaves that id dangling - so gating on the id alone would show the affordance for an item that was never
 * committed. Re-checked while a naming window is open (`pendingItem`) and after the folder reloads (a commit
 * or a delete), so it settles to the truth on confirm OR cancel.
 */
function useDrawerItemExists(drawerItemId: string | null): boolean {
   const pendingItem = useDrawerStore((state) => state.pendingItem);
   const folderView = useDrawerStore((state) => state.currentFolderView);
   // The id last confirmed present in the drawer; comparing it to the current id derives existence with no
   // synchronous effect write (an unsaved / mid-save / dangling id simply doesn't match).
   const [confirmedId, setConfirmedId] = useState<string | null>(null);

   useEffect(() => {
      if (!drawerItemId) return;
      let cancelled = false;
      void getItem(drawerItemId).then((item) => {
         if (!cancelled) setConfirmedId(item ? drawerItemId : null);
      });
      return () => {
         cancelled = true;
      };
   }, [drawerItemId, pendingItem, folderView]);

   return drawerItemId != null && confirmedId === drawerItemId;
}

export function useFindInDrawer(drawerItemId: string | null | undefined): { canFindInDrawer: boolean; findInDrawer: () => void } {
   const { t } = useTranslation();
   // Gate on ACTUAL existence, not just a set id - a cancelled first save leaves the id dangling.
   const canFindInDrawer = useDrawerItemExists(drawerItemId ?? null);
   const findInDrawer = useCallback(() => {
      if (!drawerItemId) return;
      void revealDrawerItem(drawerItemId, { onMissing: () => toast.error(t('Notifications.drawer.itemNotInDrawer')) });
   }, [drawerItemId, t]);
   return { canFindInDrawer, findInDrawer };
}
