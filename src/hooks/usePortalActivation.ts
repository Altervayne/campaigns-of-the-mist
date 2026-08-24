// -- React Imports --
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// -- Library Imports --
import toast from 'react-hot-toast';

// -- Portals Imports --
import { activateLinkTarget } from '@/lib/portals/activateLinkTarget';
import { portalTargetToLinkTarget } from '@/lib/portals/portalTarget';
import { getActiveBoardStore } from '@/lib/board/boardStoreRegistry';
import { useTabManagerActions } from '@/lib/character/tabManagerStore';
import { getEffectiveDeviceType } from '@/hooks/useDeviceType';

// -- Type Imports --
import type { PortalBoardContent } from '@/lib/types/board';

/*
 * The board-portal activation bridge, the portal-side sibling of `useNoteLinkActivation`. A portal wraps no note,
 * so it stamps a board-embed host WITHOUT a `noteId` and maps its structured target onto the shared resolver's
 * `LinkTarget` (no `cotm://` string round-trip), then hands off to the shared {@link activateLinkTarget} core -
 * the exact resolve -> dispatch -> trail path a Navigator jump also rides, so the two build one trail. The trail
 * `to` name prefers the resolved target name, else the author caption. The `board-element` variant has no 1a
 * action (its mapper returns `null`), so it is a graceful no-op.
 */

/** Builds the double-click/launch activation handler for a portal board item. */
export function usePortalActivation(itemId: string, content: PortalBoardContent): () => void {
   const { t } = useTranslation();
   const actions = useTabManagerActions();

   return useCallback(() => {
      const linkTarget = portalTargetToLinkTarget(content.target);
      if (!linkTarget) return; // board-element (same-board phase) or otherwise not activatable in 1a.

      // Pdf tabs are desktop-only (a board never renders on mobile, so this is a defensive stop).
      if (linkTarget.kind === 'entity' && linkTarget.entity === 'pdf' && getEffectiveDeviceType() === 'mobile') {
         toast.error(t('Notifications.link.pdfDesktopOnly'));
         return;
      }

      const boardId = getActiveBoardStore()?.getState().boardId ?? '';
      activateLinkTarget(linkTarget, {
         host: { kind: 'board-embed', boardId, itemId },
         actions,
         t,
         originItemId: itemId,
         toName: content.lastKnownName ?? content.style.label,
      });
   }, [itemId, content.target, content.lastKnownName, content.style.label, actions, t]);
}
