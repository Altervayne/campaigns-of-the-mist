// -- Library Imports --
import toast from 'react-hot-toast';

// -- Portals Imports --
import { resolveLinkAction } from './linkTarget';
import { runLinkAction } from './runLinkAction';
import { openEntityTab } from './openEntityTab';
import { revealDrawerItem } from './revealDrawerItem';
import { spawnDrawerItemBeside } from '@/lib/board/spawnBesideItem';
import { getActiveTabJourneyEntry } from '@/lib/character/tabManagerStore';

// -- Type Imports --
import type { LinkTarget, NoteHostContext } from './linkTarget';
import type { useTabManagerActions } from '@/lib/character/tabManagerStore';
import type { JourneyEntry } from '@/lib/character/journey';

/*
 * The headless activation core shared by every launch surface for a resolved {@link LinkTarget}: it resolves the
 * target against its host, dispatches through `runLinkAction`, and records the portal-trail edge. It is the ONE
 * place the trail ordering lives - capture the origin tab SYNCHRONOUSLY before the async open flips the active
 * pointer, then wire `onNavigated` so the edge is pushed on the success path only. A board portal (board-embed
 * host) and a Navigator jump (tab host) both ride this, so they build the SAME trail from two surfaces.
 *
 * The two host-dependent element actions split here exactly as they do in `resolveLinkAction`: a board-embed
 * host spawns the element beside its origin tile; a tab host reveals it in the drawer (no board to spawn onto).
 */

// Reentrancy guard: `openEntityTab` has a double-open race (two rapid activations both pass the not-open check
// before the first async resolve settles). The guard collapses a mashed launch / double-click into one open; it
// releases when the async open settles (or immediately for a sync action). Keyed by the origin (a portal tile or
// a Navigator row) when given, else the target itself.
const inFlight = new Set<string>();

/** The context an activation needs: the render host, the tab actions, a translator, and the trail's `to` name. */
export interface ActivateLinkTargetContext {
   /** The render host - decides the context-dependent element action (board spawn vs. drawer reveal). */
   host: NoteHostContext;
   /** The tab manager actions (open-or-focus a tab, push a trail edge). */
   actions: ReturnType<typeof useTabManagerActions>;
   /** Resolves the dead-target toast copy. */
   t: (key: string) => string;
   /** The origin's stable id (a portal tile id, a Navigator row id) - the reentrancy guard key. */
   originItemId?: string;
   /** The trail crumb name for an entity target (the resolved name, else its caption); empty falls back to untitled. */
   toName?: string;
}

/** A stable guard key for a target, used when no origin id is supplied. */
function targetGuardKey(target: LinkTarget): string {
   switch (target.kind) {
      case 'entity':
         return `${target.entity}:${target.id}`;
      case 'element':
         return `element:${target.drawerItemId}`;
      case 'external':
         return `external:${target.href}`;
      case 'section':
         return `section:${target.slug}`;
      case 'unknown':
         return `unknown:${target.href}`;
   }
}

/** Resolves + dispatches a link target and records its trail edge, guarding against a double-fire. */
export function activateLinkTarget(linkTarget: LinkTarget, { host, actions, t, originItemId, toName }: ActivateLinkTargetContext): void {
   const guardKey = originItemId ?? targetGuardKey(linkTarget);
   if (inFlight.has(guardKey)) return;
   inFlight.add(guardKey);
   const clear = () => inFlight.delete(guardKey);

   const action = resolveLinkAction(linkTarget, host);
   const onMissing = () => toast.error(t('Notifications.link.targetNotFound'));

   // Portal trail: capture the origin tab SYNCHRONOUSLY (before the async open flips the active pointer) and the
   // target from the link itself. Only an entity open is a navigation-away that records a trail edge; `onNavigated`
   // fires on `openEntityTab`'s success path (never on a dead target), keyed to the guard so a double-activation is
   // one edge. A self-edge (a link onto the tab you are already on) resolves `onNavigated` to undefined - it still
   // focuses the tab but pushes nothing.
   const from = getActiveTabJourneyEntry();
   const to: JourneyEntry | null =
      linkTarget.kind === 'entity'
         ? { tabKind: linkTarget.entity, entityId: linkTarget.id, name: toName ?? '' }
         : null;
   const onNavigated = from && to && from.entityId !== to.entityId ? () => actions.pushJourney(from, to) : undefined;

   // Spawn-beside only exists on a board (the host owns the board context + origin tile); a tab host omits it, and
   // a `spawn-on-board` action never reaches a tab host anyway.
   const spawnBeside = host.kind === 'board-embed'
      ? (drawerItemId: string) => void spawnDrawerItemBeside(drawerItemId, host.itemId, onMissing)
      : undefined;

   // An entity open is async (its guard releases when the promise settles); the other actions complete
   // synchronously, so they release the guard right after dispatch.
   let async = false;
   runLinkAction(action, {
      openEntityTab: (entity, id, page) => {
         async = true;
         return openEntityTab(entity, id, { actions, onMissing, onNavigated }, page).finally(clear);
      },
      scrollToSection: () => {},
      spawnBeside,
      revealInDrawer: (drawerItemId) => void revealDrawerItem(drawerItemId, { onMissing }),
   });
   if (!async) clear();
}
