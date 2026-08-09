// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { X } from 'lucide-react';

// -- Basic UI Imports --
import { IconButton } from '@/components/ui/icon-button';

// -- Component Imports --
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';
import { NoteLinkPicker } from '@/components/organisms/note/NoteLinkPicker';

// -- Type Imports --
import type { NoteEditorHandle } from '@/components/organisms/note/NoteEditor';
import type { LinkEditSeed } from '@/components/organisms/note/live/linkNode';

interface MobileNoteLinkPickerSheetProps {
   /** Whether the sheet is shown. */
   isOpen: boolean;
   /** Accessor for the live editor handle: the picker snapshots its selection/buffer once on open. */
   getEditor: () => NoteEditorHandle | null;
   /** When set, REPLACE this link's target (keep its label); null inserts a new link at the caret. */
   editSeed: LinkEditSeed | null;
   /** Explicit close / backdrop tap / a completed pick closes the sheet. */
   onClose: () => void;
}

/*
 * The mobile link picker slide-up: the full-height sheet host around the shared {@link NoteLinkPicker}. The chip
 * opens it with no seed to INSERT a new link; the link options sheet opens it with a seed to CHANGE an existing
 * link's target. The picker splices back through the editor handle and closes on pick. App-token chrome.
 */
export function MobileNoteLinkPickerSheet({ isOpen, getEditor, editSeed, onClose }: MobileNoteLinkPickerSheetProps) {
   const { t } = useTranslation();

   return (
      <MobileBottomSheet isOpen={isOpen} onClose={onClose} fullHeight>
         <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-lg font-semibold text-foreground">
               {editSeed ? t('NoteView.linkEdit.changeTarget') : t('NoteView.toolbar.insertLink')}
            </h2>
            <IconButton variant="ghost" size="sm" onClick={onClose} aria-label={t('Common.close')}>
               <X className="h-5 w-5" />
            </IconButton>
         </div>
         {isOpen && <NoteLinkPicker getEditor={getEditor} onClose={onClose} editSeed={editSeed ?? undefined} fullWidth />}
      </MobileBottomSheet>
   );
}
