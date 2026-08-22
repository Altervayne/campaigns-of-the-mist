// -- React Imports --
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { ArrowUpRight, ChevronDown, ChevronRight, CornerLeftUp, Link, Link2Off, Loader2 } from 'lucide-react';

// -- Hook Imports --
import { useLinkMetadata } from '@/hooks/useLinkMetadata';
import { useBreakpoint } from '@/hooks/useAdaptive';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';
import { chooseLinkIcon } from '@/lib/portals/linkMetadata';

// -- Type Imports --
import type { LucideIcon } from 'lucide-react';
import type { NavNode } from '@/lib/navigator/navigatorGraph';
import type { NoteHeading } from '@/lib/notes/noteOutline';

/*
 * One Navigator tree row: [indent guides] [twisty] [kind glyph] [name] [trailing marker]. The twisty is a
 * SEPARATE hit target that triggers the lazy crawl (stop-prop so it never also selects); the body single-clicks
 * to select (or, on a "seen above" back-edge, scroll-pulses the canonical occurrence) and double-clicks to jump
 * (a no-op placeholder until N3). Name + liveness come from the shared `linkMetadata` cache, so a portal wears
 * the same badge here as in the trail and the link chip. Two special rows read as OPPOSITES: a cyclic back-edge
 * (CornerLeftUp, italic, normal color - a loop that points somewhere) and a broken portal (Link2Off, dotted
 * strike, muted - never red). App tokens only; a character branch shows a plain muted glyph, never game-tinted.
 */

/** The Navigator crawls the portal graph, not a note's sections, so link metadata resolves against no headings. */
const NO_HEADINGS: NoteHeading[] = [];

/** Indent guides clamp after this many levels, so a deep dive never pushes the name off-panel. */
const MAX_GUIDES = 6;

interface NavigatorRowProps {
   node: NavNode;
   /** Visible indent depth (hidden intermediates don't add a level). */
   depth: number;
   isExpanded: boolean;
   /** Its caret is resolving children right now (show the spinner + skeleton child). */
   isLoading: boolean;
   /** User-selected (single-click) - the soft ring. */
   isSelected: boolean;
   /** Its target is the active tab (current location) - the same soft ring. */
   isCurrentLocation: boolean;
   /** A "seen above" pulse is pointing at this (canonical) row - scroll it in + flash. */
   isPulsing: boolean;
   onToggleExpand: (node: NavNode) => void;
   onSelect: (node: NavNode) => void;
   onActivate: (node: NavNode) => void;
   onPulseCanonical: (node: NavNode) => void;
}

/** The kind glyph for a row, from the shared link-icon decision (dead -> broken glyph, else the target's type icon). */
function rowGlyph(node: NavNode, dead: boolean): LucideIcon {
   if (dead) return Link2Off;
   const choice = chooseLinkIcon(node.target, undefined);
   if (choice.kind === 'itemType') return getItemTypeIconComponent(choice.itemType);
   // element (type not yet known) + external both fall here: a generic link glyph.
   return Link;
}

export function NavigatorRow({
   node,
   depth,
   isExpanded,
   isLoading,
   isSelected,
   isCurrentLocation,
   isPulsing,
   onToggleExpand,
   onSelect,
   onActivate,
   onPulseCanonical,
}: NavigatorRowProps) {
   const { t } = useTranslation();
   const { isCoarse } = useBreakpoint();
   const rowRef = useRef<HTMLDivElement>(null);
   const metadata = useLinkMetadata(node.target, NO_HEADINGS);

   // Dead ONLY on a confirmed miss; an unresolved (undefined) target reads live, so a resolving row never flashes dead.
   const dead = metadata?.exists === false;
   const seenAbove = node.seenAbove;
   // No caret on a leaf, a dead target, or a branch that already resolved to zero children (a dead end).
   const showTwisty = node.crawlable && !dead && !node.childless;

   // A "seen above" pulse scrolls the canonical row into view and flashes it (the drawer-reveal idiom).
   useEffect(() => {
      if (!isPulsing) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      rowRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
   }, [isPulsing]);

   // `rowGlyph` returns a stable module-level lucide component; static-components is a false positive here
   // (same as `LinkTargetList`/`InternalLinkChip`).
   const Glyph = rowGlyph(node, dead);
   const name = node.label ?? metadata?.displayName;
   const untitled = !name;
   const displayName = name ?? t('Common.untitled');

   // The row's hover title: the dead reason, the cycle hint, else the (possibly-truncated) name.
   const title = dead ? t('Notifications.link.targetNotFound') : seenAbove ? t('Navigator.seenAboveHint') : displayName;

   // A coarse pointer has no reliable double-tap, so the primary tap jumps (the navigator's purpose);
   // fine keeps single-click select / double-click jump. Back-edges still jump on coarse (activate handles them).
   const handleClick = () => {
      if (isCoarse) { onActivate(node); return; }
      if (seenAbove) { onPulseCanonical(node); return; }
      onSelect(node);
   };

   return (
      <div
         ref={rowRef}
         role="treeitem"
         aria-expanded={showTwisty ? isExpanded : undefined}
         title={title}
         onClick={handleClick}
         onDoubleClick={() => onActivate(node)}
         className={cn(
            'group flex min-h-8 cursor-pointer select-none items-center rounded pl-2 pr-1.5 text-sm',
            'hover:bg-muted/60',
            (isSelected || isCurrentLocation) && 'bg-muted ring-1 ring-inset ring-primary/40',
            isPulsing && 'motion-safe:animate-drawer-reveal',
         )}
      >
         {/* Indent guides: one faint vertical rail per nesting level, centered in its column so the line threads
             down through the parent's chevron and reads as a connector. Clamped so a deep branch never scrolls
             the name sideways. */}
         {Array.from({ length: Math.min(depth, MAX_GUIDES) }).map((_, i) => (
            <span key={i} aria-hidden className="flex h-8 w-5 shrink-0 justify-center">
               <span className="h-full border-l border-border/60" />
            </span>
         ))}

         {/* Twisty slot (a separate hit target): the crawl caret, the cycle marker, or an empty aligner. */}
         <span className="flex size-5 shrink-0 items-center justify-center">
            {seenAbove ? (
               <CornerLeftUp className="size-3.5 text-muted-foreground" aria-hidden />
            ) : showTwisty ? (
               <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleExpand(node); }}
                  aria-label={isExpanded ? t('Navigator.collapse') : t('Navigator.expand')}
                  className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
               >
                  {isLoading ? (
                     <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : isExpanded ? (
                     <ChevronDown className="size-3.5" aria-hidden />
                  ) : (
                     <ChevronRight className="size-3.5" aria-hidden />
                  )}
               </button>
            ) : null}
         </span>

         {/* Kind glyph: the same vocabulary the trail + link chip use; muted, never game-tinted. */}
         {/* eslint-disable-next-line react-hooks/static-components */}
         <Glyph className={cn('mx-1 size-4 shrink-0 text-muted-foreground', dead && 'opacity-60')} aria-hidden />

         {/* Name: author label wins, else the resolved target name, else an italic untitled key. */}
         <span
            className={cn(
               'min-w-0 flex-1 truncate',
               dead && 'text-muted-foreground line-through decoration-dotted opacity-60',
               seenAbove && 'italic',
               untitled && !dead && 'italic text-muted-foreground',
            )}
         >
            {displayName}
         </span>

         {/* One trailing marker at most: the cycle label, or an external-link hint. */}
         {seenAbove ? (
            <span className="ml-1.5 shrink-0 text-xs italic text-muted-foreground">{t('Navigator.seenAbove')}</span>
         ) : node.navKind === 'external' && !dead ? (
            <ArrowUpRight className="ml-1.5 size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
         ) : null}
      </div>
   );
}
