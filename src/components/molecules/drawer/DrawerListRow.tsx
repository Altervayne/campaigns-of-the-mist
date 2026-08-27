// -- React Imports --
import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { getItemTypeIconComponent, getItemIdentityAccent } from '@/lib/utils/drawer-icons';
import { GameBadge } from '@/components/molecules/drawer/GameBadge';

// -- Component Imports --
import { ItemDateLabel } from '@/components/molecules/drawer/ItemDateLabel';
import { IconTooltip } from '@/components/molecules/drawer/IconTooltip';

// -- Type Imports --
import type { GeneralItemType, GameSystem } from '@/lib/types/drawer';

/*
 * The shared List-view row, used by both the browse list and the search results so they read identically:
 * [type glyph] [name - owns the flexible space] [game glyph] [date - a right-aligned column]. The name
 * flexes and only truncates when genuinely too long; the date sits in its own right-aligned column so
 * dates scan straight down the list. The row is content-only: the whole row is the drag handle and the
 * actions menu floats as a hover overlay, both owned by {@link DrawerListRowFrame}, so the content reaches
 * both edges. Like the rich card, the type / game glyphs carry a styled tooltip naming them.
 */


interface DrawerListRowProps {
   type: GeneralItemType;
   name: string;
   game: GameSystem;
   createdAt?: number;
   updatedAt?: number;
   className?: string;
}

export function DrawerListRow({ type, name, game, createdAt, updatedAt, className }: DrawerListRowProps) {
   const { t } = useTranslation();
   const accent = getItemIdentityAccent(type, game);
   // A stable module-level lucide component; static-components is a false positive (same as the card meta).
   const Icon = getItemTypeIconComponent(type);
   return (
      <div className={cn('flex min-h-8 items-center gap-2 rounded p-1.5 pr-2', className)}>
         {/* A leading identity tile carries per-type recognition down a long list; tooltips name the
             otherwise-unlabelled indicator icons (type + game). */}
         <IconTooltip label={t(`Drawer.filters.itemType.${type}`)}>
            <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', accent.badge)}>
               {/* eslint-disable-next-line react-hooks/static-components */}
               <Icon className="h-4 w-4" />
            </span>
         </IconTooltip>
         <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
         {game !== 'NEUTRAL' && <IconTooltip label={t(`Drawer.Types.${game}`)}><GameBadge game={game} /></IconTooltip>}
         <ItemDateLabel
            type={type}
            createdAt={createdAt}
            updatedAt={updatedAt}
            className="min-w-16 shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground"
         />
      </div>
   );
}

/*
 * The row frame shared by both list surfaces: a `relative group/row` container that highlights on hover
 * and floats the actions menu as a sibling overlay at the right edge, vertically centered. The menu sits
 * OUTSIDE the drag-handle body (which each caller wires itself, wrapping the row in `cursor-grab` +
 * listeners), so clicking the menu never starts a drag. A non-draggable row (a search summary) just omits
 * the handle wiring. `containerRef` lets the search hook anchor its draggable node on the container.
 */
export function DrawerListRowFrame({
   children,
   menu,
   containerRef,
   className,
}: {
   children: ReactNode;
   menu?: ReactNode;
   containerRef?: Ref<HTMLDivElement>;
   className?: string;
}) {
   return (
      <div ref={containerRef} className={cn('group/row relative rounded hover:bg-muted data-[state=open]:bg-muted', className)}>
         {children}
         {menu && <div className="absolute inset-y-0 right-1 z-10 flex items-center">{menu}</div>}
      </div>
   );
}
