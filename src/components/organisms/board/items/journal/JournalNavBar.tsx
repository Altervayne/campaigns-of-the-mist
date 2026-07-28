// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

// -- Component Imports --
import { BookmarkPopover } from './BookmarkPopover';
import { JournalControlButton } from './JournalControlButton';
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

   // The page indicator's current number is click-to-edit: a typed page (1..M) jumps there on Enter/blur,
   // anything else is ignored. Ephemeral view state, so it lives here, not on the journal aggregate.
   const [pageNumEditing, setPageNumEditing] = useState(false);
   const [pageNumText, setPageNumText] = useState('');
   const startEditPageNum = () => { setPageNumText(String(pageIndex + 1)); setPageNumEditing(true); };
   const commitPageNum = () => {
      const target = Number.parseInt(pageNumText, 10);
      if (Number.isFinite(target) && target >= 1 && target <= pages.length) onGoToPageNumber(target);
      setPageNumEditing(false);
   };

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
            {pageNumEditing ? (
               <input
                  type="text"
                  inputMode="numeric"
                  value={pageNumText}
                  autoFocus
                  onChange={(event) => setPageNumText(event.target.value.replace(/[^0-9]/g, ''))}
                  onFocus={(event) => event.target.select()}
                  onKeyDown={(event) => { if (event.key === 'Enter') commitPageNum(); else if (event.key === 'Escape') setPageNumEditing(false); }}
                  onBlur={commitPageNum}
                  onPointerDown={stopDrag}
                  aria-label={t('BoardView.journalGoToPage')}
                  // The editable number reads as a small parchment inset on the header band (the current-page indicator).
                  className="w-7 rounded bg-paper-background px-1 text-center tabular-nums text-paper-foreground outline-none"
               />
            ) : (
               <button
                  type="button"
                  title={t('BoardView.journalGoToPage')}
                  aria-label={t('BoardView.journalGoToPage')}
                  onPointerDown={stopDrag}
                  onClick={startEditPageNum}
                  className="min-w-7 rounded px-1 text-center tabular-nums text-paper-primary-foreground/80 hover:bg-paper-primary-foreground/10 hover:text-paper-primary-foreground cursor-pointer"
               >
                  {pageIndex + 1}
               </button>
            )}
            <span className="text-paper-primary-foreground/70">/</span>
            <span className="min-w-7 px-1 text-center tabular-nums text-paper-primary-foreground/80">{pages.length}</span>
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
