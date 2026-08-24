// -- React Imports --
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';

// -- Icon Imports --
import { ArrowLeft, ChevronRight, FileType, LayoutGrid, NotebookPen, User, X, type LucideIcon } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Portals Imports --
import { openEntityTab } from '@/lib/portals/openEntityTab';

// -- Store Imports --
import { useTabManagerActions, useTabManagerStore } from '@/lib/character/tabManagerStore';
import { deriveCurrentIndex } from '@/lib/character/journey';

// -- Type Imports --
import type { TabType } from '@/lib/character/tabManagerStore';

/*
 * The PORTAL TRAIL: a docked breadcrumb BAR that sits in its own row UNDER the tab strip and OVER the work
 * area, showing the back-stack of portal navigations so a GM can see where a dive took them and step back out.
 * It lives in the layout flow (never floats over a surface's chrome - a floating pill fought the board toolbar),
 * and it appears ONLY during a dive (>= 2 entries) - "shows up only on a journey" is the primary anti-conflation
 * signal - reading as directed HISTORY (a leading Back arrow, `>`-chevron crumbs, the current one highlighted,
 * not closeable), never as peer tabs. A long trail scrolls horizontally within the bar so it stays full.
 *
 * Navigation reactivates through `openEntityTab` (which reopens a closed-but-SAVED target by id - never a raw
 * `setActiveTab`, which no-ops off-strip), so its `openTabs`-first-then-drawer resolve is the liveness oracle.
 * A truly-dead entry (closed AND never-saved) is detected AT the pop: it toasts and drops, and Back keeps
 * stepping over it. Desktop-only (it mounts in the desktop workspace; boards/portals never render on mobile).
 */

/** The crumb glyph per tab kind (mirrors the tab strip's own icons). */
const KIND_ICON: Record<TabType, LucideIcon> = { board: LayoutGrid, note: NotebookPen, character: User, pdf: FileType };

/** The untitled fallback key per tab kind, for a crumb whose snapshot name was empty. */
const KIND_UNTITLED: Record<TabType, string> = {
   board: 'Tabs.untitledBoard',
   note: 'Common.untitledNote',
   character: 'Tabs.untitled',
   pdf: 'Tabs.untitledPdf',
};

export function PortalTrailBar() {
   const { t } = useTranslation();
   const reduce = useReducedMotion() ?? false;
   const actions = useTabManagerActions();

   const entries = useTabManagerStore((state) => state.journey.entries);
   const currentIndex = useTabManagerStore((state) => state.journey.currentIndex);
   const activeTabId = useTabManagerStore((state) => state.activeTabId);

   // The highlighted crumb: the active tab's entry when it is on-trail (the marker follows it), else none - the
   // dive is paused because the user wandered off it via the tab strip (owner-locked "intact-but-paused").
   const activeIndex = deriveCurrentIndex({ entries, currentIndex }, activeTabId);
   // Back / step-from position: the highlighted crumb when on-trail, else the stored marker (resume the dive).
   const effectiveIndex = activeIndex ?? currentIndex;

   /** Reactivates one entry; on a dead target toasts + drops it. Returns whether the tab opened. */
   const reactivate = useCallback(
      async (tabKind: TabType, entityId: string): Promise<boolean> => {
         // Pdfs aren't portal targets yet, so one never enters the trail; guard keeps `openEntityTab`'s
         // narrower kind honest until pdf portals land.
         if (tabKind === 'pdf') return false;
         let missed = false;
         await openEntityTab(tabKind, entityId, { actions, onMissing: () => { missed = true; } });
         if (missed) {
            toast.error(t('Notifications.link.targetNotFound'));
            actions.dropJourneyEntry(entityId);
            return false;
         }
         return true;
      },
      [actions, t],
   );

   /** Back: sync the marker to the effective position, then step back over any dead entries to the first live one. */
   const goBack = useCallback(async () => {
      actions.goToJourneyIndex(effectiveIndex);
      // Bounded by the trail length: each miss drops an entry, so the loop always terminates.
      for (let guard = useTabManagerStore.getState().journey.entries.length + 1; guard > 0; guard--) {
         const entry = actions.journeyBack();
         if (!entry) return;
         if (await reactivate(entry.tabKind, entry.entityId)) return;
      }
   }, [actions, effectiveIndex, reactivate]);

   /** Crumb click (including a forward crumb): jump the marker there and reactivate; a dead crumb toasts + drops. */
   const goToIndex = useCallback(
      async (index: number) => {
         const entry = actions.goToJourneyIndex(index);
         if (entry) await reactivate(entry.tabKind, entry.entityId);
      },
      [actions, reactivate],
   );

   // Shown ONLY during a dive: the appearance itself is the strongest "this is not the tab strip" tell.
   if (entries.length < 2) return null;

   return (
      <motion.nav
         data-tutorial="portal-trail"
         aria-label={t('Tabs.portalTrail')}
         initial={reduce ? false : { opacity: 0, y: -4 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ duration: reduce ? 0 : 0.18, ease: 'easeOut' }}
         className="flex w-full shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-sm"
      >
         <button
            type="button"
            onClick={goBack}
            disabled={effectiveIndex <= 0}
            aria-label={t('Tabs.portalTrailBack')}
            title={t('Tabs.portalTrailBack')}
            className="flex size-6 touch-target shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
         >
            <ArrowLeft className="h-4 w-4" />
         </button>

         {/* The full trail: crumbs never collapse away - the row scrolls horizontally if the dive runs long. */}
         <ol className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {entries.map((entry, index) => {
               const Icon = KIND_ICON[entry.tabKind];
               const label = entry.name.trim().length > 0 ? entry.name : t(KIND_UNTITLED[entry.tabKind]);
               const isCurrent = index === activeIndex;
               return (
                  <li key={index} className="flex shrink-0 items-center gap-0.5">
                     {index > 0 && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
                     <button
                        type="button"
                        onClick={() => void goToIndex(index)}
                        title={label}
                        aria-current={isCurrent ? 'true' : undefined}
                        className={cn(
                           'flex max-w-56 items-center gap-1 rounded px-2 py-0.5 cursor-pointer',
                           isCurrent
                              ? 'bg-primary text-primary-foreground font-medium'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                     >
                        <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 truncate">{label}</span>
                     </button>
                  </li>
               );
            })}
         </ol>

         {/* Dismiss: the trail is only worth its row while you're in the dive - this clears it and reclaims the space. */}
         <button
            type="button"
            onClick={actions.clearJourney}
            aria-label={t('Tabs.portalTrailDismiss')}
            title={t('Tabs.portalTrailDismiss')}
            className="flex size-6 touch-target shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
         >
            <X className="h-4 w-4" />
         </button>
      </motion.nav>
   );
}
