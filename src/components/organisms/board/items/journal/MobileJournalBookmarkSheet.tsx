// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';
import { BookmarkListRow } from './BookmarkListRow';

// -- Type Imports --
import type { JournalBookmark } from '@/lib/types/board';

/**
 * The mobile stand-in for the journal's bookmark list: a bottom sheet of thumb-sized rows, each showing a
 * bookmark's page and label. Tapping a row jumps to its page and closes the sheet; while editing, the label
 * is renamable and the bookmark removable. Reuses {@link BookmarkListRow} (its label buffer + flush) at touch
 * size and the injected journal handlers, so no bookmark logic is duplicated here.
 */
export function MobileJournalBookmarkSheet({
   isOpen,
   onClose,
   tabs,
   pageIndex,
   editable,
   onJump,
   onRemove,
   onSetBookmarkLabel,
}: {
   isOpen: boolean;
   onClose: () => void;
   tabs: { bookmark: JournalBookmark; page: number }[];
   pageIndex: number;
   editable: boolean;
   onJump: (pageId: string) => void;
   onRemove: (id: string) => void;
   onSetBookmarkLabel: (id: string, label: string) => void;
}) {
   const { t } = useTranslation();

   const jumpAndClose = (pageId: string) => {
      onJump(pageId);
      onClose();
   };

   return (
      <MobileBottomSheet isOpen={isOpen} onClose={onClose}>
         <div className="p-4 pb-3 border-b border-border">
            <h2 className="text-lg font-semibold">{t('BoardView.journalBookmarks')}</h2>
         </div>

         <div className="max-h-[60dvh] overflow-y-auto p-2 pb-safe">
            {tabs.length === 0 ? (
               <div className="rounded-md border-2 border-dashed border-border bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
                  {t('BoardView.journalNoBookmarks')}
               </div>
            ) : (
               <div className="flex flex-col gap-1">
                  {tabs.map(({ bookmark, page }) => (
                     <BookmarkListRow
                        key={bookmark.id}
                        label={bookmark.label}
                        pageNumber={page + 1}
                        active={page === pageIndex}
                        editable={editable}
                        touch
                        placeholder={t('BoardView.journalBookmarkPlaceholder')}
                        removeLabel={t('BoardView.journalRemoveBookmark')}
                        onJump={() => jumpAndClose(bookmark.pageId)}
                        onRemove={() => onRemove(bookmark.id)}
                        onLabelCommit={(value) => onSetBookmarkLabel(bookmark.id, value)}
                     />
                  ))}
               </div>
            )}
         </div>
      </MobileBottomSheet>
   );
}
