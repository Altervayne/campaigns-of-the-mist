// -- React Imports --
import type { ReactNode } from 'react';

// -- DnD Imports --
import { DragStaticWrapper } from '@/components/dnd';

// -- Hook Imports --
import { useInView } from '@/hooks/useInView';
import { useDrawerItemContent } from '@/hooks/drawer/useDrawerItemContent';
import { useResultDraggable } from '@/hooks/drawer/useResultDraggable';

// -- Component Imports --
import { DrawerListRow, DrawerListRowFrame } from '@/components/molecules/drawer/DrawerListRow';
import { DrawerResultMenu } from '@/components/molecules/drawer/DrawerResultMenu';

// -- Type Imports --
import type { DrawerItemRecord } from '@/lib/drawer/drawerRecords';
import type { DrawerItemSummary } from '@/lib/drawer/drawerRepository';

/*
 * A flat search-result row, driven by a content-FREE {@link DrawerItemSummary}. Shares the exact List
 * layout with the browse row ({@link DrawerListRow}) - type glyph, flexible name, game glyph, right-
 * aligned date column - and, like the Rich result card, lazy-loads its content once the row scrolls into
 * view and then becomes DRAGGABLE OUT from anywhere on the row. Results don't reorder among themselves, so
 * it is a plain draggable, not a Sortable; the payload matches a browse item exactly, so the board / sheet
 * / tab drop handlers embed it unchanged. A not-yet-loaded / missing row shows the same content with no
 * drag wiring (nothing to drag) - identical layout, so loading -> loaded never shifts.
 */

export interface DrawerSearchResultEntryProps {
   summary: DrawerItemSummary;
   onJumpTo: () => void;
   onRename: () => void;
   onDelete: () => void;
   onMove: () => void;
}

/** The hover-revealed result menu (Jump-to / rename / move / delete), built once and floated as the row overlay. */
function resultMenu({ onJumpTo, onRename, onDelete, onMove }: DrawerSearchResultEntryProps): ReactNode {
   return (
      <DrawerResultMenu
         onJumpTo={onJumpTo}
         onRename={onRename}
         onMove={onMove}
         onDelete={onDelete}
         triggerClassName="opacity-0 transition-opacity group-hover/row:opacity-100"
      />
   );
}

/**
 * The summary row - not draggable. Used before the content loads and when it is missing: the display is
 * the same as a loaded row (name/type/game/date all live on the summary), only the drag wiring is absent.
 * No drag handle, no shift on load.
 */
function SummaryRow({ summary, menu }: { summary: DrawerItemSummary; menu: ReactNode }) {
   return (
      <DrawerListRowFrame menu={menu}>
         <DrawerListRow
            type={summary.type}
            name={summary.name}
            game={summary.game}
            createdAt={summary.createdAt}
            updatedAt={summary.updatedAt}
            cardTypeClass={summary.cardTypeClass}
         />
      </DrawerListRowFrame>
   );
}

/**
 * A loaded result row, draggable OUT from anywhere on the row. Display still comes from the summary
 * (identical to the summary row, so loading -> loaded never shifts); the loaded record only feeds the drag
 * payload. The menu stays a sibling overlay (outside the drag-handle body), so a menu click never drags.
 */
function DraggableResultRow({ summary, item, menu }: { summary: DrawerItemSummary; item: DrawerItemRecord; menu: ReactNode }) {
   const { attributes, listeners, setNodeRef, isDragging } = useResultDraggable(summary, item);
   return (
      <DragStaticWrapper isBeingDragged={isDragging}>
         <DrawerListRowFrame containerRef={setNodeRef} menu={menu}>
            <div {...attributes} {...listeners} className="cursor-grab">
               <DrawerListRow
                  type={summary.type}
                  name={summary.name}
                  game={summary.game}
                  createdAt={summary.createdAt}
                  updatedAt={summary.updatedAt}
                  cardTypeClass={summary.cardTypeClass}
               />
            </div>
         </DrawerListRowFrame>
      </DragStaticWrapper>
   );
}

/** Mounted only once visible, so the content fetch never fires for an off-screen row. */
function LoadedResultRow(props: DrawerSearchResultEntryProps) {
   const { item } = useDrawerItemContent(props.summary.id);
   const menu = resultMenu(props);
   // Loaded -> the draggable row; loading / missing -> the plain summary row (nothing to drag).
   if (item) return <DraggableResultRow summary={props.summary} item={item} menu={menu} />;
   return <SummaryRow summary={props.summary} menu={menu} />;
}

export function DrawerSearchResultEntry(props: DrawerSearchResultEntryProps) {
   const { ref, hasBeenVisible } = useInView<HTMLDivElement>();
   return (
      <div ref={ref}>
         {hasBeenVisible ? <LoadedResultRow {...props} /> : <SummaryRow summary={props.summary} menu={resultMenu(props)} />}
      </div>
   );
}
