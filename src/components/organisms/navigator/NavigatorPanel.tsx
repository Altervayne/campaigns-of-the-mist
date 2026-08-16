// -- React Imports --
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion, useReducedMotion } from 'framer-motion';

// -- Icon Imports --
import { RefreshCw, Waypoints, X } from 'lucide-react';

// -- Component Imports --
import { NavigatorRow } from './NavigatorRow';
import { NavigatorFilterStrip } from './NavigatorFilterStrip';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Hook Imports --
import { useNavigatorJump } from '@/hooks/useNavigatorJump';

// -- Store / Context Imports --
import { useAppSettingsActions } from '@/lib/stores/appSettingsStore';
import { useActiveBoardInstance } from '@/lib/board/ActiveBoardStoreContext';
import { useActiveNoteInstance } from '@/lib/notes/ActiveNoteStoreContext';
import {
   NAV_TYPE_FILTER_KINDS,
   clearNavigatorChildrenCache,
   loadNavChildren,
   useNavigatorActions,
   useNavigatorStore,
} from '@/lib/navigator/navigatorStore';

// -- Navigator Core Imports --
import { buildChildNodes, buildRootNodes, flattenVisibleTree } from '@/lib/navigator/navigatorGraph';
import { boardPortalItemsToEdges, noteBodyToEdges } from '@/lib/navigator/navigatorEdges';
import { resolveAppWideRootEdges } from '@/lib/navigator/navigatorRoots';

// -- Type Imports --
import type { NavNode } from '@/lib/navigator/navigatorGraph';

/*
 * The Navigator: an in-flow LEFT panel that crawls the app's outbound PORTAL graph. It docks as a flex sibling
 * (like the Drawer, mirrored to the left) and SHRINKS the workspace when it takes its column - not an overlay.
 * It mounts at app-shell level (beside the trail + drawer), above the tab-switch boundary, so a future jump that
 * switches tabs cannot unmount it mid-crawl - its tree lives in the ephemeral `navigatorStore`, not in this
 * component. Header + filter strip ride the lighter `bg-card`, the tree body the slightly darker `bg-popover` -
 * the Sidebar's contrast-of-importance idiom. The tree grows lazily: roots materialize on open, and each deeper
 * level ONLY when its caret is clicked (via the N1 cache + in-flight dedup). App tokens only - a character branch
 * shows a plain muted glyph, never game-tinted.
 */

export function NavigatorPanel() {
   const { t } = useTranslation();
   const reduce = useReducedMotion() ?? false;
   const { setNavigatorOpen } = useAppSettingsActions();

   const boardStore = useActiveBoardInstance();
   const noteStore = useActiveNoteInstance();

   const rootScope = useNavigatorStore((state) => state.rootScope);
   const typeFilter = useNavigatorStore((state) => state.typeFilter);
   const nodes = useNavigatorStore((state) => state.nodes);
   const expandedIds = useNavigatorStore((state) => state.expandedIds);
   const actions = useNavigatorActions();

   // Which carets are resolving right now (drives their spinner + the skeleton child row).
   const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
   // The single-click selection (highlight only, no nav).
   const [selectedId, setSelectedId] = useState<string | null>(null);
   // The canonical row a "seen above" click is pulsing (one-shot, auto-clears).
   const [pulseId, setPulseId] = useState<string | null>(null);
   // The app-wide forest sweep is in flight (the one non-lazy read).
   const [appWideLoading, setAppWideLoading] = useState(false);
   // Bumped by the refresh control to re-seed after clearing the children cache.
   const [refreshNonce, setRefreshNonce] = useState(0);

   // The active tab's canonical key, so its row wears the "current location" ring.
   const activeWorkspaceKey = useMemo(() => {
      if (boardStore) {
         const { boardId } = boardStore.getState();
         return boardId ? `board:${boardId}` : null;
      }
      if (noteStore) {
         const { noteId } = noteStore.getState();
         return noteId ? `note:${noteId}` : null;
      }
      return null;
   }, [boardStore, noteStore]);

   // Seed the roots on open / scope flip / workspace switch / refresh. Current-workspace reads its first level
   // LIVE off the in-memory store (zero Dexie, always fresh) and shows it expanded; app-wide sweeps the forest.
   useEffect(() => {
      let cancelled = false;

      if (rootScope === 'app-wide') {
         // eslint-disable-next-line react-hooks/set-state-in-effect -- flag the forest sweep as loading before it awaits
         setAppWideLoading(true);
         resolveAppWideRootEdges()
            .then((edges) => {
               if (cancelled) return;
               setAppWideLoading(false);
               actions.setRoots(buildRootNodes(edges));
            })
            .catch(() => { if (!cancelled) setAppWideLoading(false); });
         return () => { cancelled = true; };
      }

      const boardState = boardStore?.getState();
      const noteState = noteStore?.getState();
      if (boardState?.boardId) {
         const [root] = buildRootNodes([{ target: { kind: 'entity', entity: 'board', id: boardState.boardId } }]);
         actions.setRoots([root]);
         actions.expand(root.instanceId, buildChildNodes(root, boardPortalItemsToEdges(Object.values(boardState.items))));
      } else if (noteState?.noteId && noteState.note) {
         const [root] = buildRootNodes([{ target: { kind: 'entity', entity: 'note', id: noteState.noteId } }]);
         actions.setRoots([root]);
         actions.expand(root.instanceId, buildChildNodes(root, noteBodyToEdges(noteState.note.body)));
      } else {
         actions.reset();
      }

      return () => { cancelled = true; };
   }, [rootScope, boardStore, noteStore, refreshNonce, actions]);

   const rows = useMemo(() => flattenVisibleTree(nodes, expandedIds, typeFilter), [nodes, expandedIds, typeFilter]);

   // Root count + materialized-child count, to tell the empty variants apart.
   const { rootCount, childCount } = useMemo(() => {
      let roots = 0;
      for (const node of nodes.values()) if (node.parentInstanceId === null) roots += 1;
      return { rootCount: roots, childCount: nodes.size - roots };
   }, [nodes]);

   const handleToggleExpand = useCallback(
      (node: NavNode) => {
         if (!node.crawlable) return;
         if (expandedIds.has(node.instanceId)) { actions.collapse(node.instanceId); return; }
         setLoadingIds((prev) => new Set(prev).add(node.instanceId));
         void loadNavChildren(node.target).then((edges) => {
            // A branch that resolves to no outbound portals is a dead end: drop its caret (treat it as a leaf)
            // rather than leave a twisty that expands to nothing.
            if (edges.length === 0) actions.markChildless(node.instanceId);
            else actions.expand(node.instanceId, buildChildNodes(node, edges));
            setLoadingIds((prev) => { const next = new Set(prev); next.delete(node.instanceId); return next; });
         });
      },
      [expandedIds, actions],
   );

   // A "seen above" click scroll-pulses the FIRST (canonical, non-back-edge) occurrence of the same target.
   const handlePulseCanonical = useCallback(
      (node: NavNode) => {
         const canonical = rows.find((row) => row.node.canonicalKey === node.canonicalKey && !row.node.seenAbove);
         if (!canonical) return;
         const id = canonical.node.instanceId;
         setPulseId(id);
         window.setTimeout(() => setPulseId((current) => (current === id ? null : current)), 1500);
      },
      [rows],
   );

   // Jump (double-click): routes through the shared portal trail, the same core a canvas portal activates. A
   // "seen above" back-edge still jumps here - the cycle mark suppresses only expansion, never the jump.
   const handleActivate = useNavigatorJump();

   // Refresh: drop the session children cache, then re-seed the active scope from live truth.
   const handleRefresh = useCallback(() => {
      clearNavigatorChildrenCache();
      setRefreshNonce((n) => n + 1);
   }, []);

   const filterActive = typeFilter.size < NAV_TYPE_FILTER_KINDS.length;
   const hasMaterial = rootScope === 'current-workspace' ? childCount > 0 : rootCount > 0;
   // A current-workspace root with no edges is a degenerate tree (a lone dangling header) - show the empty
   // state instead, so an edgeless workspace reads as "no portals here" rather than a bare row.
   const showEmpty = rows.length === 0 || (rootScope === 'current-workspace' && childCount === 0);

   // Take/release the column by animating WIDTH (not an x-transform), so the workspace reflows and shrinks
   // beside it - the Drawer's docking model, mirrored to the left. The inner content is fixed-width so it
   // never squishes mid-animation; `overflow-hidden` on the outer clips it while the column grows.
   const slide = { type: 'tween' as const, duration: reduce ? 0 : 0.2, ease: 'easeOut' as const };

   return (
      <motion.aside
         data-tutorial="navigator-panel"
         aria-label={t('Common.navigator')}
         initial={{ width: 0 }}
         animate={{ width: '18rem' }}
         exit={{ width: 0 }}
         transition={slide}
         onPointerDown={(event) => event.stopPropagation()}
         className="flex h-full shrink-0 flex-col overflow-hidden border-r-2 border-border bg-card shadow-sm"
      >
       <div className="flex h-full w-72 flex-col">
         {/* Header: the lighter `bg-card` chrome (the Sidebar's header treatment). */}
         <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2.5">
            <Waypoints className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-sm font-semibold text-foreground">{t('Common.navigator')}</span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">{showEmpty ? 0 : rows.length}</span>
            <button
               type="button"
               onClick={handleRefresh}
               title={t('Navigator.refresh')}
               aria-label={t('Navigator.refresh')}
               className="flex shrink-0 cursor-pointer items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
               <RefreshCw className="size-4" />
            </button>
            <button
               type="button"
               onClick={() => setNavigatorOpen(false)}
               title={t('Navigator.close')}
               aria-label={t('Navigator.close')}
               className="flex shrink-0 cursor-pointer items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
               <X className="size-4" />
            </button>
         </div>

         <NavigatorFilterStrip />

         {/* Tree body: the slightly darker `bg-popover` (the Sidebar's content treatment). A small symmetric
             inset keeps the rows' rounded hover off the panel edges; each row carries its own left padding so
             the chevron sits inset within the row, not flush against it. */}
         {!showEmpty ? (
            <div role="tree" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-popover px-1.5 py-1.5">
               {rows.map((row) => (
                  <NavigatorRow
                     key={row.node.instanceId}
                     node={row.node}
                     depth={row.depth}
                     isExpanded={expandedIds.has(row.node.instanceId)}
                     isLoading={loadingIds.has(row.node.instanceId)}
                     isSelected={selectedId === row.node.instanceId}
                     isCurrentLocation={activeWorkspaceKey !== null && row.node.canonicalKey === activeWorkspaceKey}
                     isPulsing={pulseId === row.node.instanceId}
                     onToggleExpand={handleToggleExpand}
                     onSelect={(node) => setSelectedId(node.instanceId)}
                     onActivate={handleActivate}
                     onPulseCanonical={handlePulseCanonical}
                  />
               ))}
            </div>
         ) : (
            <NavigatorEmptyState
               loading={appWideLoading}
               variant={filterActive && hasMaterial ? 'filtered' : rootScope === 'app-wide' ? 'firstRun' : 'workspace'}
            />
         )}
       </div>
      </motion.aside>
   );
}

/** The empty-body states: a forest-sweep spinner, a filtered-to-nothing hint, a first-run explainer, or an empty workspace. */
function NavigatorEmptyState({ loading, variant }: { loading: boolean; variant: 'filtered' | 'firstRun' | 'workspace' }) {
   const { t } = useTranslation();

   if (loading) {
      return (
         <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-popover px-4 text-center text-muted-foreground">
            <Waypoints className="size-8 animate-pulse opacity-40" aria-hidden />
            <p className="text-xs">{t('Navigator.loading')}</p>
         </div>
      );
   }

   const message = variant === 'firstRun' ? t('Navigator.firstRun') : t('Navigator.empty');
   const hint = variant === 'filtered'
      ? t('Navigator.emptyFilterHint')
      : variant === 'workspace'
        ? t('Navigator.emptyWorkspaceHint')
        : null;

   return (
      <div className={cn('flex flex-1 flex-col items-center justify-center gap-2 bg-popover px-6 text-center text-muted-foreground')}>
         <Waypoints className="size-8 opacity-40" aria-hidden />
         <p className="text-xs">{message}</p>
         {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
      </div>
   );
}
