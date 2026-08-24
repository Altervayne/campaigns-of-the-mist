/*
 * The Portals link-METADATA layer: liveness + naming for a {@link LinkTarget}, kept SEPARATE from the pure
 * classify/resolve in `linkTarget.ts`. Where `parseLinkHref` decides WHAT a link points at, this decides
 * whether that target still EXISTS and what to call it - the data behind the reading/live chip's dead state,
 * its resolved name (for an empty-label link), and an element's real type icon.
 *
 * Two resolution paths share ONE contract:
 *  - LOCAL + SYNCHRONOUS (`resolveLocalLinkMetadata`): a same-note `#section` (against the note's headings) and
 *    an `external` URL resolve with no I/O, so they are known at first paint - no flash, no cache.
 *  - DRAWER + ASYNC (the cache below): an `entity` (note/board/character id) or a tabless `element` (drawer item
 *    id) needs a Dexie lookup. The result is cached by a stable key so BOTH render surfaces read it: the Reading
 *    chip subscribes via a hook that loads-then-caches; the Live CM6 widget reads the cache synchronously and
 *    patches itself when the load settles. CRITICAL: an unresolved target reads as `undefined` (UNKNOWN), which
 *    the surfaces render in the normal LIVE state - "dead" shows ONLY on a confirmed miss, never while in flight.
 */

// -- Repository Imports --
import { getItem, findEntityDrawerItem } from '@/lib/drawer/drawerRepository';
import { getBoard } from '@/lib/board/boardRepository';
import { getNote } from '@/lib/notes/noteRepository';
import { drawerCommandEngine } from '@/lib/drawer/drawerCommandEngine';
import { isDemoId } from '@/lib/tutorial/demo/demoSentinels';

// -- Type Imports --
import type { LinkTarget } from './linkTarget';
import type { NoteHeading } from '@/lib/notes/noteOutline';
import type { GeneralItemType } from '@/lib/types/drawer';

/** A link target's liveness + naming: whether it still exists, its display name, and (for an element) its type. */
export interface LinkMetadata {
   /** Whether the target still exists. A confirmed miss (`false`) is what shows the dead chip. */
   exists: boolean;
   /** The target's name for an empty-label link (a heading's text, an item's name, or the raw URL). */
   displayName?: string;
   /** A tabless element's concrete type, so the chip can show its real drawer icon instead of the generic link glyph. */
   itemType?: GeneralItemType;
}

/** Maps a linkable entity to the drawer item type that represents it, so a chip matches its drawer glyph. */
const ENTITY_ITEM_TYPE = { note: 'NOTE', board: 'FULL_BOARD', character: 'FULL_CHARACTER_SHEET', pdf: 'PDF' } as const;

/**
 * Resolves the metadata that needs NO I/O - a same-note `#section` (against `headings`) and an `external` URL -
 * so those chips are correct at first paint. Returns `null` for an `entity`/`element` target (resolved via the
 * async drawer cache instead) and for `unknown`.
 */
export function resolveLocalLinkMetadata(target: LinkTarget, headings: NoteHeading[]): LinkMetadata | null {
   if (target.kind === 'section') {
      const heading = headings.find((entry) => entry.slug === target.slug);
      return heading ? { exists: true, displayName: heading.text } : { exists: false };
   }
   if (target.kind === 'external') return { exists: true, displayName: target.href };
   return null;
}

// ==================
//  The async drawer-metadata cache (shared by both render surfaces)
// ==================

const cache = new Map<string, LinkMetadata>();
const inFlight = new Map<string, Promise<LinkMetadata>>();
const listeners = new Set<() => void>();
let invalidationWired = false;

/** The cache key for a drawer-resolved target, or `null` for a target resolved locally (section/external/unknown). */
function cacheKey(target: LinkTarget): string | null {
   if (target.kind === 'entity') return `entity:${target.entity}:${target.id}`;
   if (target.kind === 'element') return `element:${target.drawerItemId}`;
   return null;
}

/**
 * A demo target lives only in the in-memory repository backend (routed by the sentinel prefix), never the
 * drawer, so a drawer lookup would read a miss and paint the row dead. Resolve its name from the backend
 * (the demo-routed `getBoard`/`getNote`) so a demo portal reads LIVE with its fixture name. Returns `null`
 * for a non-demo target, or an absent demo record, so the caller falls through to the drawer path.
 */
async function resolveDemoEntity(target: Extract<LinkTarget, { kind: 'entity' }>): Promise<LinkMetadata | null> {
   if (!isDemoId(target.id)) return null;
   if (target.entity === 'board') {
      const record = await getBoard(target.id);
      return record ? { exists: true, displayName: record.name, itemType: ENTITY_ITEM_TYPE.board } : null;
   }
   if (target.entity === 'note') {
      const record = await getNote(target.id);
      return record ? { exists: true, displayName: record.title, itemType: ENTITY_ITEM_TYPE.note } : null;
   }
   return null;
}

/** Reads the drawer to build an entity/element target's metadata; a missing row resolves to a confirmed miss. */
async function loadFromDrawer(target: LinkTarget): Promise<LinkMetadata> {
   if (target.kind === 'element') {
      const record = await getItem(target.drawerItemId);
      return record ? { exists: true, displayName: record.name, itemType: record.type } : { exists: false };
   }
   if (target.kind === 'entity') {
      const demo = await resolveDemoEntity(target);
      if (demo) return demo;
      const record = await findEntityDrawerItem(target.entity, target.id);
      return record ? { exists: true, displayName: record.name, itemType: ENTITY_ITEM_TYPE[target.entity] } : { exists: false };
   }
   return { exists: false };
}

/**
 * Wires a one-time invalidation: any drawer command clears the cache and notifies subscribers, so a renamed or
 * deleted target re-resolves (a delete flips a live chip to dead, a rename refreshes its name). Cleared entries
 * read as UNKNOWN until reloaded, so the surfaces fall back to the LIVE state - never a false dead flash. Wired
 * lazily on first load so a bare import of the pure helpers stays side-effect-free.
 */
function wireInvalidation(): void {
   if (invalidationWired) return;
   invalidationWired = true;
   drawerCommandEngine.subscribe(() => {
      if (cache.size === 0) return;
      cache.clear();
      for (const listener of listeners) listener();
   });
}

/** Subscribes to cache changes (a load settling, or an invalidation). Returns an unsubscribe. */
export function subscribeLinkMetadata(listener: () => void): () => void {
   listeners.add(listener);
   return () => listeners.delete(listener);
}

/** The cached metadata for a drawer-resolved target, or `undefined` when not yet loaded (UNKNOWN = render live). */
export function getCachedLinkMetadata(target: LinkTarget): LinkMetadata | undefined {
   const key = cacheKey(target);
   return key ? cache.get(key) : undefined;
}

/**
 * Ensures the drawer metadata for an entity/element target is loaded and cached, returning it. A cache hit
 * resolves immediately; a concurrent request for the same key shares one in-flight promise. A local target
 * (section/external/unknown) resolves to a confirmed miss and is never cached (those resolve synchronously).
 */
export function loadLinkMetadata(target: LinkTarget): Promise<LinkMetadata> {
   const key = cacheKey(target);
   if (!key) return Promise.resolve({ exists: false });
   const cached = cache.get(key);
   if (cached) return Promise.resolve(cached);
   const existing = inFlight.get(key);
   if (existing) return existing;
   wireInvalidation();
   const load = loadFromDrawer(target).then((metadata) => {
      cache.set(key, metadata);
      inFlight.delete(key);
      for (const listener of listeners) listener();
      return metadata;
   });
   inFlight.set(key, load);
   return load;
}

// ==================
//  Icon selection (shared by the Reading chip + the Live widget)
// ==================

/**
 * Which icon a chip shows, given its target + metadata - the ONE decision both render surfaces read (the
 * Reading chip maps it to a lucide component, the Live widget to inline SVG), so they can't drift. A confirmed
 * miss shows the broken-link glyph; a section its hash; an entity/element its drawer type icon (an element only
 * once its type is known, else the generic link glyph).
 */
export type LinkIconChoice =
   | { kind: 'section' }
   | { kind: 'dead' }
   | { kind: 'itemType'; itemType: GeneralItemType }
   | { kind: 'generic' };

export function chooseLinkIcon(target: LinkTarget, metadata: LinkMetadata | undefined): LinkIconChoice {
   if (metadata && !metadata.exists) return { kind: 'dead' };
   switch (target.kind) {
      case 'section':
         return { kind: 'section' };
      case 'entity':
         return { kind: 'itemType', itemType: ENTITY_ITEM_TYPE[target.entity] };
      case 'element':
         return metadata?.itemType ? { kind: 'itemType', itemType: metadata.itemType } : { kind: 'generic' };
      default:
         return { kind: 'generic' };
   }
}
