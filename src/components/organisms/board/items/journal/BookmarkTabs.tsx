// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { BookmarkTab } from './BookmarkTab';

// -- Type Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { JournalBookmark } from '@/lib/types/board';

/**
 * The bookmark tab column: body-scaled, in page order, and offset clear of the box's own top chrome. The
 * wrapper stops the pointer so a tab miss never starts a canvas pan.
 */
export function BookmarkTabs({
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
      <div onPointerDown={stopDrag} className="mt-9 flex flex-col items-start gap-1">
         {tabs.map(({ bookmark, page }) => (
            <BookmarkTab
               key={bookmark.id}
               label={bookmark.label}
               pageNumber={page + 1}
               active={page === pageIndex}
               editable={editable}
               placeholder={t('BoardView.journalBookmarkPlaceholder')}
               removeLabel={t('BoardView.journalRemoveBookmark')}
               stopDrag={stopDrag}
               onJump={() => onJump(bookmark.pageId)}
               onRemove={() => onRemove(bookmark.id)}
               onLabelCommit={(value) => onLabelCommit(bookmark.id, value)}
            />
         ))}
      </div>
   );
}
