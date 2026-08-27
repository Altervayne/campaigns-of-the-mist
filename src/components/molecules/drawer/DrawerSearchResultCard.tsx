// -- React Imports --
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

// -- DnD Imports --
import { DragStaticWrapper } from '@/components/dnd';

// -- Hook Imports --
import { useInView } from '@/hooks/useInView';
import { useDrawerItemContent } from '@/hooks/drawer/useDrawerItemContent';
import { useResultDraggable } from '@/hooks/drawer/useResultDraggable';

// -- Utils Imports --
import { getItemTypeIcon } from '@/lib/utils/drawer-icons';
import { GameBadge } from '@/components/molecules/drawer/GameBadge';

// -- Component Imports --
import { DrawerItemPreview } from '@/components/organisms/drawer/DrawerItemPreview';
import { DrawerCardFrame } from '@/components/molecules/drawer/DrawerCardFrame';
import { ItemDateLabel } from '@/components/molecules/drawer/ItemDateLabel';
import { IconTooltip } from '@/components/molecules/drawer/IconTooltip';
import { DrawerResultMenu } from '@/components/molecules/drawer/DrawerResultMenu';

// -- Type Imports --
import type { DrawerItemRecord } from '@/lib/drawer/drawerRecords';
import type { DrawerItemSummary } from '@/lib/drawer/drawerRepository';
import type { DrawerSearchResultEntryProps } from '@/components/molecules/drawer/DrawerSearchResultEntry';

/*
 * The rich, lazy search result - where the content-free summary and the on-demand content loader meet.
 * The card stays a skeleton (its name/meta drawn from the summary, available immediately) until it
 * scrolls into view; only then does it mount the content fetch, so a 100-result search loads previews
 * only for what the user actually sees. A deleted item settles to an unavailable card, not a spinner.
 *
 * A LOADED card is draggable OUT to the workspace, carrying the same DRAWER_ITEM drag data a browse item
 * does (its content is in hand), so the existing cross-surface drop handlers embed it unchanged. A
 * skeleton / missing card is NOT draggable (no content to embed), and results never reorder among
 * themselves (a plain draggable, not a SortableContext member).
 */


/**
 * A card-footprint placeholder matching {@link DrawerItemPreview}: the preview area shimmers (or shows a
 * removed note), while the name + meta come from the summary - so loading only fills the preview area,
 * with no layout pop. The menu floats in the corner (as on a loaded card), so it doesn't shift on load.
 * Not draggable: a skeleton / missing card has no content to embed.
 */
function ResultCardShell({ summary, menu, removed = false }: { summary: DrawerItemSummary; menu: ReactNode; removed?: boolean }) {
   const { t } = useTranslation();
   const meta = (
      <>
         {/* Hover labels name the indicator icons (type + game), so they aren't a guess. */}
         <IconTooltip label={t(`Drawer.filters.itemType.${summary.type}`)}>{getItemTypeIcon(summary.type)}</IconTooltip>
         {summary.game !== 'NEUTRAL' && <IconTooltip label={t(`Drawer.Types.${summary.game}`)}><GameBadge game={summary.game} /></IconTooltip>}
         <ItemDateLabel type={summary.type} createdAt={summary.createdAt} updatedAt={summary.updatedAt} className="truncate" />
      </>
   );

   // Same frame as a loaded card, so nothing shifts on load: a shimmering stage while fetching, the
   // removed message once the item is gone. Name + meta are the summary's, available immediately. The
   // menu floats in the corner (a sibling overlay, as on a loaded card).
   return (
      <div className="relative">
         <DrawerCardFrame
            stageClassName={removed ? 'bg-popover/30' : 'animate-pulse bg-muted/40'}
            fit="contain"
            name={summary.name}
            meta={meta}
         >
            {removed
               ? <div className="flex h-45 w-45 items-center justify-center px-4 text-center text-xs text-muted-foreground">{t('Drawer.search.unavailable')}</div>
               : null}
         </DrawerCardFrame>
         <div className="absolute right-1 top-1 z-10">{menu}</div>
      </div>
   );
}

/**
 * The loaded card, draggable OUT to the workspace. A plain {@link useDraggable} (NOT in a
 * SortableContext, so no reorder); the data MATCHES a browse item's exactly, so the existing drop
 * handlers embed it onto a board/sheet with no change. The card body carries the drag listeners; the
 * menu is a sibling overlay (not a descendant), so the menu never starts a drag.
 */
function DraggableResultCard({ summary, item, menu }: { summary: DrawerItemSummary; item: DrawerItemRecord; menu: ReactNode }) {
   const { attributes, listeners, setNodeRef, isDragging } = useResultDraggable(summary, item);

   return (
      <DragStaticWrapper isBeingDragged={isDragging}>
         <div ref={setNodeRef} className="relative">
            <div {...attributes} {...listeners} className="cursor-grab">
               <DrawerItemPreview item={item} />
            </div>
            <div className="absolute right-1 top-1 z-10">{menu}</div>
         </div>
      </DragStaticWrapper>
   );
}

/** Mounted only once visible, so the content fetch never fires for an off-screen card. */
function LoadedResultCard({ summary, onJumpTo, onRename, onDelete, onMove }: DrawerSearchResultEntryProps) {
   const { item, isMissing } = useDrawerItemContent(summary.id);
   const menu = <DrawerResultMenu onJumpTo={onJumpTo} onRename={onRename} onMove={onMove} onDelete={onDelete} />;

   // Loaded -> the draggable rich card; loading -> shimmer; settled-missing -> the removed card.
   if (item) return <DraggableResultCard summary={summary} item={item} menu={menu} />;
   return <ResultCardShell summary={summary} menu={menu} removed={isMissing} />;
}

export function DrawerSearchResultCard(props: DrawerSearchResultEntryProps) {
   const { summary, onJumpTo, onRename, onDelete, onMove } = props;
   const { ref, hasBeenVisible } = useInView<HTMLDivElement>();
   const menu = <DrawerResultMenu onJumpTo={onJumpTo} onRename={onRename} onMove={onMove} onDelete={onDelete} />;

   return (
      <div ref={ref}>
         {hasBeenVisible
            ? <LoadedResultCard {...props} />
            : <ResultCardShell summary={summary} menu={menu} />}
      </div>
   );
}
