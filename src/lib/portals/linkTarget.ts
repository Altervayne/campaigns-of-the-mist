/*
 * The Portals link substrate: a PURE classify + resolve, with no store, DOM, or repository imports so it is
 * fully unit-testable and reusable. A note-body link is ordinary markdown (`[text](href)`); `parseLinkHref`
 * classifies the `href` into a {@link LinkTarget}, and `resolveLinkAction` turns a target + its render host into
 * a {@link LinkAction} the imperative dispatch executes. The context-dependence lives here: a tabless ELEMENT
 * link means "spawn beside" on a board tile but "reveal in drawer" in a standalone tab.
 *
 * Token grammar (see `docs/note-links-study.md`):
 *   - Same-note section:  `#<slug>`
 *   - Entity (owns a tab): `cotm://note|board|character/<entityId>`
 *   - Tabless element:     `cotm://<type>/<drawerItemId>` (any other `cotm://` type, e.g. `item`)
 *   - External:            `http(s)://...`
 * Id-kind rule: entity links carry an ENTITY id; element links carry a DRAWER ITEM id - the `type` segment
 * decides, so the resolver never mis-opens one for the other.
 */

/**
 * The render host that owns the clicked link, stamped by the rendering component (never stored on the note).
 * `noteId` is OPTIONAL on BOTH variants: a note tile / a note tab stamps it, but a board PORTAL (which wraps no
 * note) and a Navigator jump (which is not on a note at all) omit it - no host-dependent branch reads `noteId`
 * (the element -> spawn-on-board branch needs `boardId`/`itemId`), so one `resolveLinkAction` serves every surface.
 */
export type NoteHostContext =
   | { kind: 'tab'; noteId?: string }
   | { kind: 'board-embed'; boardId: string; itemId: string; noteId?: string };

/** The classified destination of a note-body link. */
export type LinkTarget =
   | { kind: 'section'; slug: string }
   | { kind: 'entity'; entity: 'note' | 'board' | 'character'; id: string }
   | { kind: 'element'; drawerItemId: string }
   | { kind: 'external'; href: string }
   | { kind: 'unknown'; href: string };

/** The action a link resolves to, given its host. `spawn-on-board`/`reveal-in-drawer` are Phase 3 (deferred). */
export type LinkAction =
   | { type: 'scroll-section'; slug: string }
   | { type: 'open-tab'; entity: 'note' | 'board' | 'character'; id: string }
   | { type: 'spawn-on-board'; drawerItemId: string; host: Extract<NoteHostContext, { kind: 'board-embed' }> }
   | { type: 'reveal-in-drawer'; drawerItemId: string }
   | { type: 'open-external'; href: string }
   | { type: 'noop' };

/** The `cotm://` scheme prefix and the entity type segments that own a tab. */
const COTM_PREFIX = 'cotm://';
const ENTITY_TYPES = new Set(['note', 'board', 'character']);

/**
 * Classifies a link `href` into a {@link LinkTarget}. Unrecognised shapes fall to `unknown` (a graceful no-op
 * downstream). A `cotm://note/<id>#<slug>` cross-note-section grammar is allowed but its fragment is DROPPED in
 * this phase (opens the note tab; cross-note-section scroll is a later phase).
 */
export function parseLinkHref(href: string): LinkTarget {
   if (href.startsWith('#')) return { kind: 'section', slug: decodeFragment(href.slice(1)) };
   if (/^https?:\/\//i.test(href)) return { kind: 'external', href };

   if (href.startsWith(COTM_PREFIX)) {
      const rest = href.slice(COTM_PREFIX.length);
      const slash = rest.indexOf('/');
      if (slash > 0) {
         const type = rest.slice(0, slash);
         // Drop any trailing `#slug` fragment (deferred cross-note section) so the id stays clean.
         const idPart = rest.slice(slash + 1);
         const hash = idPart.indexOf('#');
         const id = hash >= 0 ? idPart.slice(0, hash) : idPart;
         if (id) {
            if (ENTITY_TYPES.has(type)) return { kind: 'entity', entity: type as 'note' | 'board' | 'character', id };
            return { kind: 'element', drawerItemId: id };
         }
      }
   }
   return { kind: 'unknown', href };
}

/**
 * Resolves a {@link LinkTarget} to the {@link LinkAction} its host should run. Only the ELEMENT branch is
 * host-dependent: on a board tile it spawns the element beside the note; in a standalone tab it reveals the
 * item in the drawer. Everything else resolves the same in every host.
 */
export function resolveLinkAction(target: LinkTarget, host: NoteHostContext): LinkAction {
   switch (target.kind) {
      case 'section':
         return { type: 'scroll-section', slug: target.slug };
      case 'entity':
         return { type: 'open-tab', entity: target.entity, id: target.id };
      case 'element':
         return host.kind === 'board-embed'
            ? { type: 'spawn-on-board', drawerItemId: target.drawerItemId, host }
            : { type: 'reveal-in-drawer', drawerItemId: target.drawerItemId };
      case 'external':
         return { type: 'open-external', href: target.href };
      case 'unknown':
         return { type: 'noop' };
   }
}

/** Decodes a `#`-fragment slug, tolerating a non-encoded value (a malformed escape falls back to the raw text). */
function decodeFragment(slug: string): string {
   try {
      return decodeURIComponent(slug);
   } catch {
      return slug;
   }
}
