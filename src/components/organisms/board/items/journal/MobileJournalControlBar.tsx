// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Bookmark, BookmarkMinus, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';

// -- Component Imports --
import { BookmarkPopover } from './BookmarkPopover';
import { JournalControlButton } from './JournalControlButton';
import { JournalPageIndicator } from './JournalPageIndicator';

// -- Type Imports --
import type { CSSProperties } from 'react';
import type { JournalControlsContext } from '@/components/organisms/board/items/JournalItem';

interface MobileJournalControlBarProps extends JournalControlsContext {
   /** The corner FAB rests on the handedness-leading edge; reserve a slot there so its band never covers a control. */
   isMobileFABMode: boolean;
   isLeftHanded: boolean;
}

/**
 * The journal's mobile control surface, on `--paper` tokens so it reads as part of the notebook (not app
 * chrome). Two strata: a read strip (prev · N/M · bookmarks · next) and, while editing, an edit strip above
 * it (add page · remove page · bookmark this page). Every target is a >=44px paper-band button with a 24px
 * glyph. Page turns happen only here - a swipe navigates sheet items, never pages. In FAB mode a leading-edge
 * slot is reserved so the floating navigation FAB clears the controls; side-panel mode is a flush full-width bar.
 */
export function MobileJournalControlBar({
   pageIndex,
   pageCount,
   isEditing,
   tabs,
   isBookmarked,
   removeDisabled,
   stopDrag,
   onPrev,
   onNext,
   onGoToPageNumber,
   onAddPage,
   onRemovePage,
   onToggleBookmark,
   onJumpToPage,
   onRemoveBookmark,
   onSetBookmarkLabel,
   isMobileFABMode,
   isLeftHanded,
}: MobileJournalControlBarProps) {
   const { t } = useTranslation();

   // The FAB (handedness-leading corner) rides above the sheet's card-nav bar, so its band overlaps this bar's
   // leading edge; reserve its footprint (44px + inset + gap = 4rem) there so no control sits under it. The
   // reservation lives on each colored strip (not the wrapper) so the strip's paper fill runs under the FAB
   // rather than leaving an uncolored notch. Side-panel mode has no floating FAB.
   const fabSlot: CSSProperties | undefined = isMobileFABMode
      ? (isLeftHanded ? { paddingLeft: '4rem' } : { paddingRight: '4rem' })
      : undefined;

   return (
      <div className="shrink-0 border-t border-paper-border text-sm">
         {isEditing && (
            <div style={fabSlot} className="flex items-center justify-center gap-2 border-b border-paper-border/40 bg-paper-primary px-1.5 py-1 text-paper-primary-foreground">
               <JournalControlButton title={t('BoardView.addPage')} touch onPointerDown={stopDrag} onClick={onAddPage}>
                  <Plus className="h-6 w-6" />
               </JournalControlButton>
               <JournalControlButton title={t('BoardView.removePage')} disabled={removeDisabled} touch onPointerDown={stopDrag} onClick={onRemovePage}>
                  <Minus className="h-6 w-6" />
               </JournalControlButton>
               <JournalControlButton title={isBookmarked ? t('BoardView.journalRemoveBookmark') : t('BoardView.journalBookmark')} touch onPointerDown={stopDrag} onClick={onToggleBookmark}>
                  {isBookmarked ? <BookmarkMinus className="h-6 w-6" /> : <Bookmark className="h-6 w-6" />}
               </JournalControlButton>
            </div>
         )}

         <div style={fabSlot} className="flex items-center justify-between gap-1 bg-paper-primary px-1.5 py-1 text-paper-primary-foreground">
            <JournalControlButton title={t('BoardView.prevPage')} disabled={pageIndex === 0} touch onPointerDown={stopDrag} onClick={onPrev}>
               <ChevronLeft className="h-6 w-6" />
            </JournalControlButton>

            <div className="flex items-center gap-1">
               <div className="flex items-center gap-0.5">
                  <JournalPageIndicator pageIndex={pageIndex} pageCount={pageCount} touch stopDrag={stopDrag} onGoToPageNumber={onGoToPageNumber} />
               </div>
               <BookmarkPopover
                  tabs={tabs}
                  pageIndex={pageIndex}
                  editable={isEditing}
                  touch
                  stopDrag={stopDrag}
                  onJump={onJumpToPage}
                  onRemove={onRemoveBookmark}
                  onLabelCommit={onSetBookmarkLabel}
               />
            </div>

            <JournalControlButton title={t('BoardView.nextPage')} disabled={pageIndex === pageCount - 1} touch onPointerDown={stopDrag} onClick={onNext}>
               <ChevronRight className="h-6 w-6" />
            </JournalControlButton>
         </div>
      </div>
   );
}
