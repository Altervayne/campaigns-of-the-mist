// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { BookMarked } from 'lucide-react';

// -- Component Imports --
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { BookmarkListRow } from './BookmarkListRow';

// -- Type Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { JournalBookmark } from '@/lib/types/board';

/**
 * The bookmark LIST as a nav-row button, the sheet's stand-in for the side tabs - those are a reading
 * affordance, so their replacement stays visible too. A body-portaled popover floats above flex-wrap
 * neighbours (no z-fighting). Always clickable, so the empty state is reachable. Chrome stays app-theme
 * (the popover lives outside the paper surface).
 */
export function BookmarkPopover({
   tabs,
   pageIndex,
   editable,
   stopDrag,
   onJump,
   onRemove,
   onLabelCommit,
}: {
   tabs: { bookmark: JournalBookmark; page: number }[];
   pageIndex: number;
   editable: boolean;
   stopDrag: (event: ReactPointerEvent) => void;
   onJump: (pageId: string) => void;
   onRemove: (id: string) => void;
   onLabelCommit: (id: string, label: string) => void;
}) {
   const { t } = useTranslation();

   return (
      <Popover>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={t('BoardView.journalBookmarks')}
               aria-label={t('BoardView.journalBookmarks')}
               onPointerDown={stopDrag}
               className="flex items-center justify-center rounded p-0.5 text-paper-primary-foreground/80 hover:bg-paper-primary-foreground/10 hover:text-paper-primary-foreground cursor-pointer"
            >
               <BookMarked className="h-3.5 w-3.5" />
            </button>
         </PopoverTrigger>
         <PopoverContent align="end" className="w-60 p-1.5" onOpenAutoFocus={(event) => event.preventDefault()}>
            {tabs.length === 0 ? (
               <div className="rounded-md border-2 border-dashed border-border bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
                  {t('BoardView.journalNoBookmarks')}
               </div>
            ) : (
            <div className="flex flex-col gap-0.5">
               {tabs.map(({ bookmark, page }) => (
                  <BookmarkListRow
                     key={bookmark.id}
                     label={bookmark.label}
                     pageNumber={page + 1}
                     active={page === pageIndex}
                     editable={editable}
                     placeholder={t('BoardView.journalBookmarkPlaceholder')}
                     removeLabel={t('BoardView.journalRemoveBookmark')}
                     onJump={() => onJump(bookmark.pageId)}
                     onRemove={() => onRemove(bookmark.id)}
                     onLabelCommit={(value) => onLabelCommit(bookmark.id, value)}
                  />
               ))}
            </div>
            )}
         </PopoverContent>
      </Popover>
   );
}
