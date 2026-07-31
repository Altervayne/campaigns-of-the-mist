// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

// -- Component Imports --
import { BookmarkPopover } from './BookmarkPopover';
import { JournalControlButton } from './JournalControlButton';
import { JournalPageIndicator } from './JournalPageIndicator';
import { PagesReorderPopover } from './PagesReorderPopover';

// -- Type Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { JournalBookmark, JournalPage } from '@/lib/types/board';

/**
 * Page navigation (bottom): the prev/next arrows sit at the far edges; a middle cluster carries the
 * insert-before/after glyphs (edit-only) around the click-to-edit page number. The right cluster holds the
 * pages overview and, in popover mode, the bookmark list.
 */
export function JournalNavBar({
   pages,
   activePageId,
   pageIndex,
   isSelected,
   bookmarkMode,
   tabs,
   stopDrag,
   onPrev,
   onNext,
   onInsertPage,
   onGoToPageNumber,
   onReorderPages,
   onJumpToPage,
   onRemoveBookmark,
   onSetBookmarkLabel,
}: {
   pages: JournalPage[];
   activePageId: string;
   pageIndex: number;
   isSelected: boolean;
   bookmarkMode: 'side-tabs' | 'popover';
   tabs: { bookmark: JournalBookmark; page: number }[];
   stopDrag: (event: ReactPointerEvent) => void;
   onPrev: () => void;
   onNext: () => void;
   onInsertPage: (at: number) => void;
   /** Jump to a validated 1..M page number. */
   onGoToPageNumber: (pageNumber: number) => void;
   onReorderPages: (activeId: string, overId: string) => void;
   onJumpToPage: (pageId: string) => void;
   onRemoveBookmark: (id: string) => void;
   onSetBookmarkLabel: (id: string, label: string) => void;
}) {
   const { t } = useTranslation();

   return (
      <div className="flex shrink-0 items-center justify-between gap-0.5 border-t border-paper-border bg-paper-primary text-paper-primary-foreground px-1.5 py-1 text-xs">
         <JournalControlButton title={t('BoardView.prevPage')} disabled={pageIndex === 0} onPointerDown={stopDrag} onClick={onPrev}>
            <ChevronLeft className="h-3.5 w-3.5" />
         </JournalControlButton>

         <div className="flex items-center gap-0.5">
            {isSelected && (
               <JournalControlButton title={t('BoardView.journalInsertPageBefore')} onPointerDown={stopDrag} onClick={() => onInsertPage(pageIndex)}>
                  <Plus className="h-3 w-3" />
               </JournalControlButton>
            )}
            {/* The current page number is click-to-edit; the total stays static. Both numbers carry the
                same width / centering / weight so `N / M` reads as a balanced pair. */}
            <JournalPageIndicator pageIndex={pageIndex} pageCount={pages.length} stopDrag={stopDrag} onGoToPageNumber={onGoToPageNumber} />
            {isSelected && (
               <JournalControlButton title={t('BoardView.journalInsertPageAfter')} onPointerDown={stopDrag} onClick={() => onInsertPage(pageIndex + 1)}>
                  <Plus className="h-3 w-3" />
               </JournalControlButton>
            )}
         </div>

         <div className="flex items-center gap-0.5">
            {/* Pages overview (edit-only): a body-portaled popover listing every page (number + a first-line
                snippet) that drags to reorder. Reordering shuffles the pages array; page ids stay stable so
                bookmarks never strand and the reader follows the current page by id. */}
            {isSelected && (
               <PagesReorderPopover
                  pages={pages}
                  activePageId={activePageId}
                  triggerTitle={t('BoardView.journalReorderPages')}
                  pageLabel={(n) => t('BoardView.journalPageLabel', { number: n })}
                  emptyPageLabel={t('BoardView.journalEmptyPage')}
                  reorderLabel={t('BoardView.journalReorderPages')}
                  stopDrag={stopDrag}
                  onReorder={onReorderPages}
                  onJump={onJumpToPage}
               />
            )}
            {/* Popover-mode (the sheet) puts the bookmark LIST in the always-visible nav row. */}
            {bookmarkMode === 'popover' && (
               <BookmarkPopover
                  tabs={tabs}
                  pageIndex={pageIndex}
                  editable={isSelected}
                  stopDrag={stopDrag}
                  onJump={onJumpToPage}
                  onRemove={onRemoveBookmark}
                  onLabelCommit={onSetBookmarkLabel}
               />
            )}
            <JournalControlButton title={t('BoardView.nextPage')} disabled={pageIndex === pages.length - 1} onPointerDown={stopDrag} onClick={onNext}>
               <ChevronRight className="h-3.5 w-3.5" />
            </JournalControlButton>
         </div>
      </div>
   );
}
