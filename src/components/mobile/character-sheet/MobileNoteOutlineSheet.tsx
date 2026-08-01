// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { X } from 'lucide-react';

// -- Basic UI Imports --
import { IconButton } from '@/components/ui/icon-button';

// -- Component Imports --
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';
import { NoteOutlineTree } from '@/components/organisms/note/NoteOutlineTree';

// -- Type Imports --
import type { NoteHeading } from '@/lib/notes/noteOutline';

interface MobileNoteOutlineSheetProps {
   isOpen: boolean;
   onClose: () => void;
   /** The live document body; the tree updates reactively as it changes. */
   body: string;
   /** Jumps the surface to a heading, then closes the sheet. */
   onJump: (heading: NoteHeading) => void;
}

/*
 * The note outline as a full-height bottom sheet, opened from the top bar. Reuses the shared
 * {@link NoteOutlineTree}; tapping a heading jumps + closes. App-token chrome.
 */
export function MobileNoteOutlineSheet({ isOpen, onClose, body, onJump }: MobileNoteOutlineSheetProps) {
   const { t } = useTranslation();

   const handleJump = (heading: NoteHeading) => {
      onJump(heading);
      onClose();
   };

   return (
      <MobileBottomSheet isOpen={isOpen} onClose={onClose} fullHeight>
         <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-lg font-semibold text-foreground">{t('NoteView.outline.title')}</h2>
            <IconButton variant="ghost" size="sm" onClick={onClose} aria-label={t('Common.close')}>
               <X className="h-5 w-5" />
            </IconButton>
         </div>
         <NoteOutlineTree body={body} onJump={handleJump} />
      </MobileBottomSheet>
   );
}
