// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LinkTargetList } from '@/components/molecules/links/LinkTargetList';

// -- Type Imports --
import type { LinkInsertTarget } from '@/lib/portals/buildLinkToken';

/*
 * The re-point picker: a dead note-body link's "Broken link" popover opens this to choose a new destination for
 * every note-body link that pointed at the gone target. Reuses the shared `LinkTargetList` (any kind is a valid
 * new destination); the header names how many links in THIS note the pick will move. The rewrite is the
 * buffer-safe `rePointNoteLinks` op the host runs on pick, so this component only picks a target.
 */

interface NoteRePointDialogProps {
   /** How many note-body links point at the dead target - the pick moves them all. */
   count: number;
   /** The picked destination for every matched link; the host applies it and closes. */
   onPick: (target: LinkInsertTarget) => void;
   /** Dismiss without re-pointing. */
   onClose: () => void;
}

export function NoteRePointDialog({ count, onPick, onClose }: NoteRePointDialogProps) {
   const { t } = useTranslation();
   return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
         <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
            <DialogHeader className="border-b border-border px-4 py-3">
               <DialogTitle className="pr-6 text-sm">{t('NoteView.linkRepair.pickerHeader', { count })}</DialogTitle>
            </DialogHeader>
            <LinkTargetList onPick={onPick} />
         </DialogContent>
      </Dialog>
   );
}
