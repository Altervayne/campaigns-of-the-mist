// -- React Imports --
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// -- Library Imports --
import toast from 'react-hot-toast';

// -- Portals Imports --
import { parseLinkHref, resolveLinkAction } from '@/lib/portals/linkTarget';
import { runLinkAction } from '@/lib/portals/runLinkAction';
import { openEntityTab } from '@/lib/portals/openEntityTab';
import { revealDrawerItem } from '@/lib/portals/revealDrawerItem';
import { useTabManagerActions } from '@/lib/character/tabManagerStore';
import { getEffectiveDeviceType } from '@/hooks/useDeviceType';

// -- Type Imports --
import type { NoteHostContext } from '@/lib/portals/linkTarget';

/*
 * The note-link click bridge shared by every render surface (the tab's Reading + Live editor, and the board
 * note tile): given the surface's host context and its section-scroll, it returns one `onLinkActivate(href)`
 * that classifies -> resolves -> dispatches. Keeping it here means the two render sites can't drift on how a
 * link behaves, only on WHICH host they stamp and HOW they scroll a same-note section.
 *
 * The two element actions split by host: spawn-beside is board-only, so the board tile passes its
 * `onSpawnBeside` (it owns the board context); reveal-in-drawer is app-global, so it wires straight through
 * `revealDrawerItem` here, reachable from the tab host with no render-site callback.
 */

/** Per-surface capabilities the bridge can't build itself. `onSpawnBeside` is board-embed only. */
export interface NoteLinkActivationOptions {
   /** Spawns a drawer element beside the origin note tile; supplied only by the board-embed host. */
   onSpawnBeside?: (drawerItemId: string) => void;
}

/**
 * Builds the link-activation handler for a note render surface.
 * @param host           The render host (a tab, or a board embed) - decides the context-dependent element action.
 * @param scrollToSection How this surface scrolls to a same-note `#slug` (a dead slug is a no-op).
 * @param opts           Per-surface capabilities: the board-embed host's `onSpawnBeside`.
 */
export function useNoteLinkActivation(host: NoteHostContext, scrollToSection: (slug: string) => void, opts: NoteLinkActivationOptions = {}): (href: string) => void {
   const { t } = useTranslation();
   const actions = useTabManagerActions();
   const onSpawnBeside = opts.onSpawnBeside;

   return useCallback(
      (href: string) => {
         const target = parseLinkHref(href);
         // Pdf tabs are desktop-only; a pdf link tapped on mobile would open a tab the mobile workspace can't
         // host, so surface a toast and stop before dispatch rather than stranding a dead tab.
         if (target.kind === 'entity' && target.entity === 'pdf' && getEffectiveDeviceType() === 'mobile') {
            toast.error(t('Notifications.link.pdfDesktopOnly'));
            return;
         }
         const action = resolveLinkAction(target, host);
         const onMissing = () => toast.error(t('Notifications.link.targetNotFound'));
         runLinkAction(action, {
            openEntityTab: (entity, id, page) => openEntityTab(entity, id, { actions, onMissing }, page),
            scrollToSection,
            spawnBeside: onSpawnBeside,
            revealInDrawer: (drawerItemId) => void revealDrawerItem(drawerItemId, { onMissing }),
         });
      },
      [host, scrollToSection, onSpawnBeside, actions, t],
   );
}
