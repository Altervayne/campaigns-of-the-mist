// -- Type Imports --
import type { LinkAction } from './linkTarget';

/*
 * The imperative Portals dispatch: runs a resolved {@link LinkAction} by delegating to injected services (no
 * baked store imports, so it stays a thin, swappable seam). It composes the "easy" actions - section scroll,
 * external open, and entity open-or-create-tab - plus the two context-dependent ELEMENT actions: spawn the
 * element beside the origin note tile on a board, or reveal it in the drawer from a standalone tab.
 */

/** The services the dispatch composes. `openExternal` defaults to `window.open`; the rest are always injected. */
export interface RunLinkActionDeps {
   /** Opens (or focuses) an entity's tab, resolving the aggregate and toasting on a dead target. `page` is pdf-only. */
   openEntityTab: (entity: 'note' | 'board' | 'character' | 'pdf', id: string, page?: number) => void | Promise<void>;
   /** Scrolls the calling surface to a same-note section slug (a dead slug is the surface's own no-op). */
   scrollToSection: (slug: string) => void;
   /**
    * Spawns the drawer element beside the origin note tile on its board. Only the board-embed host supplies
    * it (it owns the board context); a tab host omits it, and a `spawn-on-board` action never reaches a tab.
    */
   spawnBeside?: (drawerItemId: string) => void;
   /** Reveals the drawer element in the drawer (open + navigate + pulse). App-global, so always injected. */
   revealInDrawer: (drawerItemId: string) => void;
   /** Opens an external URL. Defaults to a `noopener,noreferrer` new tab. */
   openExternal?: (href: string) => void;
}

/** Runs `action` against the injected services. Fire-and-forget: entity opens are async but not awaited here. */
export function runLinkAction(action: LinkAction, deps: RunLinkActionDeps): void {
   switch (action.type) {
      case 'scroll-section':
         deps.scrollToSection(action.slug);
         return;
      case 'open-tab':
         void deps.openEntityTab(action.entity, action.id, action.page);
         return;
      case 'open-external':
         (deps.openExternal ?? defaultOpenExternal)(action.href);
         return;
      case 'spawn-on-board':
         deps.spawnBeside?.(action.drawerItemId);
         return;
      case 'reveal-in-drawer':
         deps.revealInDrawer(action.drawerItemId);
         return;
      case 'noop':
         return;
   }
}

/** The default external open: a new tab with the opener/referrer severed. */
function defaultOpenExternal(href: string): void {
   window.open(href, '_blank', 'noopener,noreferrer');
}
