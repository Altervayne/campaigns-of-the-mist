// -- React Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';

// -- Library Imports --
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

// -- Icon Imports --
import { ListOrdered } from 'lucide-react';

// -- Utils Imports --
import { pageSnippet } from '@/lib/board/journalContent';
import { restrictToParentElement, restrictToVerticalAxis } from '@/lib/utils/dndModifiers';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Component Imports --
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Sortable, DragStaticWrapper } from '@/components/dnd';
import { PageReorderRow } from './PageReorderRow';

// -- Type Imports --
import type { DragEndEvent } from '@dnd-kit/core';
import type { JournalPage } from '@/lib/types/board';

/**
 * The pages overview: a bar button that opens a body-portaled popover listing every page (its number + a
 * first-line snippet) as a drag-to-reorder list. Reuses the app's list-reorder pattern (a LOCAL dnd-kit
 * context, `verticalListSortingStrategy`, the vertical/parent modifiers) - never the board's own DnD. A
 * row body clicks to jump to that page; the grip carries the drag. Chrome stays app-theme (the popover
 * lives outside the paper surface).
 */
export function PagesReorderPopover({
   pages,
   activePageId,
   triggerTitle,
   pageLabel,
   emptyPageLabel,
   reorderLabel,
   stopDrag,
   onReorder,
   onJump,
}: {
   pages: JournalPage[];
   activePageId: string;
   triggerTitle: string;
   pageLabel: (n: number) => string;
   emptyPageLabel: string;
   reorderLabel: string;
   stopDrag: (event: ReactPointerEvent) => void;
   onReorder: (activeId: string, overId: string) => void;
   onJump: (pageId: string) => void;
}) {
   // A small activation distance lets a plain click (jump) fire without starting a drag on the grip.
   const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
      useSensor(KeyboardSensor),
   );
   const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
   };

   return (
      <Popover>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={triggerTitle}
               aria-label={triggerTitle}
               onPointerDown={stopDrag}
               className="flex items-center justify-center rounded p-0.5 text-paper-primary-foreground/80 hover:bg-paper-primary-foreground/10 hover:text-paper-primary-foreground cursor-pointer"
            >
               <ListOrdered className="h-3.5 w-3.5" />
            </button>
         </PopoverTrigger>
         <PopoverContent align="end" className="w-64 p-1.5" onOpenAutoFocus={(event) => event.preventDefault()}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={handleDragEnd}>
               <SortableContext items={pages.map((page) => page.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                     {pages.map((page, index) => (
                        <Sortable key={page.id} id={page.id} data={{ type: DRAG_TYPES.JOURNAL_PAGE, item: page }}>
                           {({ dragAttributes, dragListeners, isBeingDragged }) => (
                              <DragStaticWrapper isBeingDragged={isBeingDragged}>
                                 <PageReorderRow
                                    label={pageLabel(index + 1)}
                                    snippet={pageSnippet(page.text)}
                                    emptyLabel={emptyPageLabel}
                                    reorderLabel={reorderLabel}
                                    active={page.id === activePageId}
                                    dragAttributes={dragAttributes}
                                    dragListeners={dragListeners}
                                    onJump={() => onJump(page.id)}
                                 />
                              </DragStaticWrapper>
                           )}
                        </Sortable>
                     ))}
                  </div>
               </SortableContext>
            </DndContext>
         </PopoverContent>
      </Popover>
   );
}
