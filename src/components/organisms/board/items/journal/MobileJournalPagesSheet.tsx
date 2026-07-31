// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Library Imports --
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

// -- Icon Imports --
import { GripVertical } from 'lucide-react';

// -- Component Imports --
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';
import { Sortable, DragStaticWrapper } from '@/components/dnd';

// -- Hook Imports --
import { useMobileDragSensors } from '@/hooks/mobile/useMobileDragSensors';
import { useMobileJournalPageReorder } from '@/hooks/mobile/useMobileJournalPageReorder';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { pageSnippet } from '@/lib/board/journalContent';
import { restrictToVerticalAxis } from '@/lib/utils/dndModifiers';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Type Imports --
import type { JournalPage } from '@/lib/types/board';

/**
 * The mobile page overview: a bottom sheet listing every page (its number + a first-line snippet) as a
 * thumb-sized row, the current page marked. Tapping a row jumps to that page and closes the sheet - useful
 * in read mode too, so it is not edit-gated. While editing, a >=44px grip drags to reorder (id-based, via
 * the injected `onReorder`); at rest the grip is absent so a page can only be jumped to. Reorder rides the
 * mobile touch-drag idiom (a dedicated grip + `useMobileDragSensors`, a held press arms the drag so a tap
 * still jumps), the same wiring the card overview uses.
 */
export function MobileJournalPagesSheet({
   isOpen,
   onClose,
   pages,
   activePageId,
   editable,
   isLeftHanded,
   onJump,
   onReorder,
}: {
   isOpen: boolean;
   onClose: () => void;
   pages: JournalPage[];
   activePageId: string;
   editable: boolean;
   isLeftHanded: boolean;
   onJump: (pageId: string) => void;
   onReorder: (activeId: string, overId: string) => void;
}) {
   const { t } = useTranslation();
   const sensors = useMobileDragSensors();
   const { pageIds, handleDragEnd } = useMobileJournalPageReorder(pages, onReorder);

   const jumpAndClose = (pageId: string) => {
      onJump(pageId);
      onClose();
   };

   return (
      <MobileBottomSheet isOpen={isOpen} onClose={onClose} fullHeight>
         <div className="p-4 pb-3 border-b border-border">
            <h2 className="text-lg font-semibold">{t('BoardView.journalPages')}</h2>
         </div>

         <div className="flex-1 overflow-y-auto p-2 pb-safe">
            <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
               <SortableContext items={pageIds} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-2">
                     {pages.map((page, index) => (
                        <Sortable key={page.id} id={page.id} data={{ type: DRAG_TYPES.JOURNAL_PAGE, item: page }}>
                           {({ dragAttributes, dragListeners, isBeingDragged }) => {
                              const snippet = pageSnippet(page.text);
                              return (
                                 <DragStaticWrapper isBeingDragged={isBeingDragged}>
                                    <div
                                       className={cn(
                                          'flex items-center gap-3 rounded-lg border p-3',
                                          isLeftHanded && 'flex-row-reverse',
                                          page.id === activePageId ? 'border-primary bg-accent text-accent-foreground' : 'border-border bg-card',
                                       )}
                                    >
                                       {/* Tap to jump to this page and leave the sheet. */}
                                       <button
                                          type="button"
                                          onClick={() => jumpAndClose(page.id)}
                                          className={cn('flex min-w-0 flex-1 items-center gap-2 cursor-pointer', isLeftHanded ? 'text-right' : 'text-left')}
                                       >
                                          <span className="shrink-0 text-sm font-medium tabular-nums">{t('BoardView.journalPageLabel', { number: index + 1 })}</span>
                                          <span className={cn('min-w-0 flex-1 truncate text-sm', snippet ? 'text-muted-foreground' : 'italic text-muted-foreground/60')}>
                                             {snippet || t('BoardView.journalEmptyPage')}
                                          </span>
                                       </button>

                                       {/* Drag handle (>=44px), edit-only; a held press arms the drag so a plain tap still jumps. */}
                                       {editable && (
                                          <button
                                             type="button"
                                             aria-label={t('BoardView.journalReorderPages')}
                                             className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground touch-none cursor-grab active:cursor-grabbing"
                                             {...dragAttributes}
                                             {...dragListeners}
                                          >
                                             <GripVertical className="h-6 w-6" />
                                          </button>
                                       )}
                                    </div>
                                 </DragStaticWrapper>
                              );
                           }}
                        </Sortable>
                     ))}
                  </div>
               </SortableContext>
            </DndContext>
         </div>
      </MobileBottomSheet>
   );
}
