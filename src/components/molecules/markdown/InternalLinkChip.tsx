// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Hash, Link2, Link2Off, Wrench } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';

// -- Component Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// -- Portals Imports --
import { chooseLinkIcon } from '@/lib/portals/linkMetadata';
import { rePointableTargetId } from '@/lib/portals/rePoint';

// -- Hook Imports --
import { useLinkMetadata } from '@/hooks/useLinkMetadata';

// -- Type Imports --
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { LinkTarget } from '@/lib/portals/linkTarget';
import type { LinkIconChoice } from '@/lib/portals/linkMetadata';
import type { NoteHeading } from '@/lib/notes/noteOutline';

/*
 * The internal-link CHIP: a quiet inline pill for a note-body link that points somewhere inside the app
 * (a section, an entity tab, or a tabless element). The class-strings are EXPORTED so the CM6 live-editor
 * widget renders a byte-identical chip (Live == Reading), the same single-source trick the mention pill uses.
 *
 * Unlike a mention pill it carries NO saturated fill (the note body is paper, not chrome) - a `currentColor`
 * tint + a leading per-type icon is the whole affordance, so it never fights the parchment the way a
 * `--primary` fill would. External links are NOT chips: they stay the plain underlined link.
 *
 * The chip resolves its target's metadata (liveness + name + element type) to render three things: a DEAD
 * chip on a confirmed-missing target, the target's resolved NAME for an empty-label link, and an element's
 * REAL type icon. An unresolved target renders in the normal live state (never a false dead flash).
 */

/** The chip container classes, shared with the live widget so the two render paths cannot drift. */
export const INTERNAL_LINK_CHIP = 'inline-flex items-center gap-1 rounded bg-current/8 px-1 py-0.5 align-middle font-medium no-underline transition-colors hover:bg-current/15';
/** The leading icon sizing, shared with the live widget. */
export const INTERNAL_LINK_ICON = 'inline-block h-[0.95em] w-[0.95em] shrink-0 opacity-80';
/** Added to the chip CONTAINER when the target is a confirmed miss - dimmed. Shared with the live widget. */
export const INTERNAL_LINK_CHIP_DEAD = 'opacity-60';
/** Added to the chip TEXT when the target is a confirmed miss - a dotted strike. Shared with the live widget. */
export const INTERNAL_LINK_TEXT_DEAD = 'line-through decoration-dotted';

/** The lucide icon component for a shared {@link LinkIconChoice} - the Reading half of the single-sourced choice. */
export function iconForChoice(choice: LinkIconChoice): LucideIcon {
   switch (choice.kind) {
      case 'section':
         return Hash;
      case 'dead':
         return Link2Off;
      case 'itemType':
         return getItemTypeIconComponent(choice.itemType);
      case 'generic':
         return Link2;
   }
}

/** A fallback chip label for an empty-text link, from the target's own address (used until a name resolves). */
export function linkChipFallbackLabel(target: LinkTarget): string {
   if (target.kind === 'section') return `#${target.slug}`;
   if (target.kind === 'entity') return target.id;
   if (target.kind === 'element') return target.drawerItemId;
   return target.href;
}

/**
 * The Reading-side chip (react-markdown `a` override). Renders the link label behind a per-type icon on the
 * shared tint; a plain click resolves the link (never navigates the anchor) while the pointerdown guard keeps
 * a tap on a draggable surface (a board tile) from starting a drag. An empty label renders the target's
 * resolved name; a confirmed-missing target renders the dead chip with a "target not found" tooltip.
 *
 * When `onRePoint` is supplied and the dead target is re-pointable (an entity/element, not a section), the dead
 * chip becomes a "Broken link" popover trigger instead: its button re-points the note's links to that target.
 * Without `onRePoint` (the board tile, the mobile surface) a dead chip keeps the tooltip + activate behavior.
 */
export function InternalLinkChip({ target, href, headings, authorLabel, deadTooltip, onActivate, onRePoint, children }: {
   target: LinkTarget;
   href: string;
   headings: NoteHeading[];
   /** The author's link text (already trimmed); empty means "name it from the target". */
   authorLabel: string;
   /** The localized "target not found" tooltip for a dead chip. */
   deadTooltip: string;
   onActivate?: (href: string) => void;
   /** Opens the note re-point flow for a dead, re-pointable target; omit to keep the plain dead-chip behavior. */
   onRePoint?: (target: LinkTarget) => void;
   children: ReactNode;
}) {
   const metadata = useLinkMetadata(target, headings);
   const dead = metadata?.exists === false;
   // `iconForChoice` returns one of a handful of stable, module-level lucide components - it never constructs a
   // component - so static-components is a false positive here (same as `CardRenderer`).
   const Icon = iconForChoice(chooseLinkIcon(target, metadata));
   const inner = (
      <>
         {/* eslint-disable-next-line react-hooks/static-components */}
         <Icon className={INTERNAL_LINK_ICON} aria-hidden />
         <span className={cn(dead && INTERNAL_LINK_TEXT_DEAD)}>{authorLabel ? children : metadata?.displayName ?? linkChipFallbackLabel(target)}</span>
      </>
   );

   if (dead && onRePoint && rePointableTargetId(target) !== undefined) {
      return <BrokenLinkChip target={target} deadTooltip={deadTooltip} onRePoint={onRePoint}>{inner}</BrokenLinkChip>;
   }

   return (
      <a
         href={href}
         className={cn('pointer-events-auto cursor-pointer', INTERNAL_LINK_CHIP, dead && INTERNAL_LINK_CHIP_DEAD)}
         title={dead ? deadTooltip : undefined}
         onPointerDown={(event) => event.stopPropagation()}
         onClick={(event) => {
            event.preventDefault();
            onActivate?.(href);
         }}
      >
         {inner}
      </a>
   );
}

/**
 * A dead chip that re-points instead of dead-ending: the exact dead visual as a Radix popover trigger, opening a
 * small "Broken link" card with a Re-point action. Chrome on app-theme tokens; the pointerdown guard on BOTH the
 * trigger and the content keeps a board tile from treating the interaction as a drag/deselect.
 */
function BrokenLinkChip({ target, deadTooltip, onRePoint, children }: {
   target: LinkTarget;
   deadTooltip: string;
   onRePoint: (target: LinkTarget) => void;
   children: ReactNode;
}) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);
   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <button
               type="button"
               className={cn('pointer-events-auto cursor-pointer', INTERNAL_LINK_CHIP, INTERNAL_LINK_CHIP_DEAD)}
               title={deadTooltip}
               onPointerDown={(event) => event.stopPropagation()}
            >
               {children}
            </button>
         </PopoverTrigger>
         <PopoverContent
            align="start"
            sideOffset={6}
            className="w-64 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md"
            onPointerDown={(event) => event.stopPropagation()}
         >
            <p className="text-sm font-medium">{t('NoteView.linkRepair.brokenTitle')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('NoteView.linkRepair.brokenBody')}</p>
            <button
               type="button"
               onClick={() => { setOpen(false); onRePoint(target); }}
               className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
               <Wrench className="h-3.5 w-3.5" aria-hidden />
               {t('NoteView.linkRepair.rePoint')}
            </button>
         </PopoverContent>
      </Popover>
   );
}
