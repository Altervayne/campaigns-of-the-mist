// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Bookmark, BookmarkMinus, Minus, Plus } from 'lucide-react';

// -- Component Imports --
import { JournalControlButton } from './JournalControlButton';

// -- Type Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * The journal's structural actions - add page, remove page, bookmark the current page. The host renders
 * these into its selection toolbar, so they carry `toolbarControlClassName` through to the control's
 * host-button branch.
 */
export function JournalToolbarActions({
   isBookmarked,
   removeDisabled,
   toolbarControlClassName,
   stopDrag,
   onAddPage,
   onRemovePage,
   onToggleBookmark,
}: {
   isBookmarked: boolean;
   /** One empty page left, the live buffer included - there is nothing to remove. */
   removeDisabled: boolean;
   toolbarControlClassName?: string;
   stopDrag: (event: ReactPointerEvent) => void;
   onAddPage: () => void;
   onRemovePage: () => void;
   onToggleBookmark: () => void;
}) {
   const { t } = useTranslation();

   return (
      <>
         <JournalControlButton title={t('BoardView.addPage')} onPointerDown={stopDrag} onClick={onAddPage} toolbarClassName={toolbarControlClassName} appChrome>
            <Plus className="h-4 w-4" />
         </JournalControlButton>
         <JournalControlButton
            title={t('BoardView.removePage')}
            disabled={removeDisabled}
            onPointerDown={stopDrag}
            onClick={onRemovePage}
            toolbarClassName={toolbarControlClassName}
            appChrome
         >
            <Minus className="h-4 w-4" />
         </JournalControlButton>
         <JournalControlButton title={isBookmarked ? t('BoardView.journalRemoveBookmark') : t('BoardView.journalBookmark')} onPointerDown={stopDrag} onClick={onToggleBookmark} toolbarClassName={toolbarControlClassName} appChrome>
            {isBookmarked ? <BookmarkMinus className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
         </JournalControlButton>
      </>
   );
}
