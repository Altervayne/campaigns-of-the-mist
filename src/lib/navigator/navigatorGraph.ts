// -- Type Imports --
import type { LinkTarget } from '@/lib/portals/linkTarget';

/*
 * The Navigator's pure graph model: canonical keys, tree-node instance ids, and the ancestor-path cycle
 * classification - no store, no DOM, no I/O, so it is fully unit-testable. The Navigator crawls the app's
 * outbound PORTAL graph: a board's portal items and a note's body links are edges to other targets. This
 * module owns the TWO identities the crawl keeps distinct (see below) and the rule that keeps a cyclic,
 * diamond-laden graph finite per branch. Edge targets reuse the shipped {@link LinkTarget} union verbatim -
 * there is deliberately NO parallel target type.
 *
 * Two identities, kept apart:
 *  - the ENTITY CANONICAL KEY (`${type}:${entityId}`) drives the children cache + cycle detection. It uses
 *    the target's ENTITY id (a board/note/character id, or a drawer-item id for an element), so two paths
 *    that reach the same target share one key and cache once.
 *  - the TREE-NODE INSTANCE ID (`parentInstanceId:ordinal`) drives expansion state. It is per-POSITION, so a
 *    diamond (two parents -> one target) is two tree nodes with one canonical key: it caches once but renders
 *    and expands under both parents. Conflating the two would collapse legitimate diamonds.
 */

/** A displayed/filterable target kind, derived from a {@link LinkTarget}. */
export type NavKind = 'board' | 'note' | 'character' | 'element' | 'external';

/**
 * One outbound edge the crawl found. `target` is the shipped {@link LinkTarget} (reused verbatim, not
 * re-modeled); `label` is the source-side caption (a board portal's `style.label`) used as the row's
 * preferred name, absent for a note-body link (its name resolves from the target instead).
 */
export interface PortalEdge {
   target: LinkTarget;
   label?: string;
}

/**
 * A materialized tree node. `ancestorKeys` is the canonical-key path from the root down to this node's
 * PARENT (self excluded); `seenAbove` is the back-edge classification against it. `crawlable` is whether the
 * node can hold its own outbound edges (a board/note branch) AND is not a terminated back-edge.
 */
export interface NavNode {
   /** Per-position identity (`parentInstanceId:ordinal`), the expansion-state key. */
   instanceId: string;
   /** The parent's instance id, or `null` for a forest root. */
   parentInstanceId: string | null;
   /** The edge target, reused from the shared resolver's union. */
   target: LinkTarget;
   /** The source-side caption (a board portal's `style.label`), the row's PREFERRED name; absent for a note link. */
   label?: string;
   /** `${type}:${entityId}` - the cache + cycle-detection key. */
   canonicalKey: string;
   /** The displayed/filterable kind. */
   navKind: NavKind;
   /** Depth from the roots (a root is 0). */
   depth: number;
   /** Canonical keys of the ancestors (root..parent), self excluded - the cycle path. */
   ancestorKeys: string[];
   /** The node's canonical key already appears among its ancestors: a terminal back-edge ("seen above"). */
   seenAbove: boolean;
   /** Whether this node exposes a crawl caret (a live board/note branch, not a back-edge). */
   crawlable: boolean;
   /** Set once an expand resolves to zero outbound edges: a crawlable branch that is really a leaf, so it drops its caret. */
   childless?: boolean;
}

/** The synthetic parent id the forest roots hang from; a root's own instance id is `root:<ordinal>`. */
export const NAV_ROOT_INSTANCE_ID = 'root';

/** Mints a child's per-position instance id from its parent's id and its ordinal among that parent's edges. */
export function makeChildInstanceId(parentInstanceId: string, ordinal: number): string {
   return `${parentInstanceId}:${ordinal}`;
}

/**
 * The entity canonical key for a target: `${type}:${entityId}` for an entity (board/note/character), and the
 * id-kind's own scheme for the leaves (`element:<drawerItemId>`, `external:<href>`). A section/unknown target
 * is not a Navigator edge, but is keyed defensively so the function stays total.
 */
export function canonicalKeyForTarget(target: LinkTarget): string {
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

/** The displayed/filterable kind for a target (a section/unknown target - never an edge - reads as element). */
export function navKindForTarget(target: LinkTarget): NavKind {
   switch (target.kind) {
      case 'entity':
         // A pdf is a leaf: always-visible `element` kind (never crawled, no filter chip of its own).
         return target.entity === 'pdf' ? 'element' : target.entity;
      case 'external':
         return 'external';
      default:
         return 'element';
   }
}

/** Whether a target can hold outbound edges: only a board or note entity is a branch; all else is a leaf. */
export function isCrawlableTarget(target: LinkTarget): boolean {
   return target.kind === 'entity' && (target.entity === 'board' || target.entity === 'note');
}

/**
 * Classifies a node as a "seen above" back-edge: its canonical key already appears on its ancestor PATH (not
 * a global visited set). This terminates any repeat down a branch - guaranteeing finite per-branch depth -
 * while still expanding the FIRST occurrence, so a diamond's two arrivals both crawl (only a true loop stops).
 */
export function classifySeenAbove(canonicalKey: string, ancestorKeys: readonly string[]): boolean {
   return ancestorKeys.includes(canonicalKey);
}

/** Assembles a node from its edge + position. Shared by the root and child builders. */
function buildNode(edge: PortalEdge, instanceId: string, parentInstanceId: string | null, depth: number, ancestorKeys: string[]): NavNode {
   const canonicalKey = canonicalKeyForTarget(edge.target);
   const seenAbove = classifySeenAbove(canonicalKey, ancestorKeys);
   return {
      instanceId,
      parentInstanceId,
      target: edge.target,
      label: edge.label,
      canonicalKey,
      navKind: navKindForTarget(edge.target),
      depth,
      ancestorKeys,
      // A back-edge is terminal: it shows but never re-crawls.
      seenAbove,
      crawlable: isCrawlableTarget(edge.target) && !seenAbove,
   };
}

/** Builds the forest-root nodes from the top-level edge set (roots have no ancestors, so none is a back-edge). */
export function buildRootNodes(edges: PortalEdge[]): NavNode[] {
   return edges.map((edge, ordinal) =>
      buildNode(edge, makeChildInstanceId(NAV_ROOT_INSTANCE_ID, ordinal), null, 0, []),
   );
}

/**
 * Builds a parent's child nodes from its resolved edges: each child's ancestor path is the parent's path plus
 * the parent's own canonical key, so the back-edge check sees the full chain above it.
 */
export function buildChildNodes(parent: NavNode, edges: PortalEdge[]): NavNode[] {
   const ancestorKeys = [...parent.ancestorKeys, parent.canonicalKey];
   return edges.map((edge, ordinal) =>
      buildNode(edge, makeChildInstanceId(parent.instanceId, ordinal), parent.instanceId, parent.depth + 1, ancestorKeys),
   );
}

// ==================
//  Visible-tree flattening (pure; consumed by the panel's render list)
// ==================

/** One row the panel renders: the node plus its VISIBLE depth (hidden intermediates don't consume a level). */
export interface NavVisibleRow {
   node: NavNode;
   /** Indent depth counting only the visible ancestors above it, so a filtered-out parent collapses the indent. */
   depth: number;
}

/** The trailing ordinal of an instance id (`root:0:2` -> 2), the child order within a parent. */
function instanceOrdinal(instanceId: string): number {
   return Number(instanceId.slice(instanceId.lastIndexOf(':') + 1));
}

/** A parent's materialized children, in edge order (a forest root's parent id is `null`). */
function childrenOf(nodes: Map<string, NavNode>, parentInstanceId: string | null): NavNode[] {
   const out: NavNode[] = [];
   for (const node of nodes.values()) if (node.parentInstanceId === parentInstanceId) out.push(node);
   return out.sort((a, b) => instanceOrdinal(a.instanceId) - instanceOrdinal(b.instanceId));
}

/**
 * Flattens the materialized tree into the ordered, filtered row list the panel renders. Depth-first from the
 * forest roots, descending into a node only when it is expanded. The type filter hides a row whose kind is
 * off, but the WALK is never filtered: a hidden-yet-expanded intermediate still surfaces its lit descendants
 * (they promote to its visible depth), so a filtered branch stays traversable to a matching leaf below it.
 */
export function flattenVisibleTree(
   nodes: Map<string, NavNode>,
   expandedIds: Set<string>,
   typeFilter: ReadonlySet<NavKind>,
): NavVisibleRow[] {
   const rows: NavVisibleRow[] = [];
   const walk = (parentInstanceId: string | null, depth: number): void => {
      for (const node of childrenOf(nodes, parentInstanceId)) {
         // `element` leaves carry no filter chip, so they are never hidden; only the four chip kinds toggle.
         const visible = node.navKind === 'element' || typeFilter.has(node.navKind);
         if (visible) rows.push({ node, depth });
         // Descend into an expanded node regardless of its own visibility; a hidden node keeps the same depth
         // so its promoted descendants don't gain a phantom indent level.
         if (expandedIds.has(node.instanceId)) walk(node.instanceId, visible ? depth + 1 : depth);
      }
   };
   walk(null, 0);
   return rows;
}
