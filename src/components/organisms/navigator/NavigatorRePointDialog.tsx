// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LinkTargetList } from '@/components/molecules/links/LinkTargetList';

// -- Type Imports --
import type { LinkInsertTarget } from '@/lib/portals/buildLinkToken';

/*
 * The app-wide re-point picker: a dead Navigator row's "Re-point" action opens this to choose a new destination
 * for every link that pointed at the gone target - across all notes and all boards at once. Reuses the shared
 * `LinkTargetList` (any kind is a valid new destination); the header names how many links the pick will move. The
 * rewrite is the buffer-safe `rePointAllLinks` op the host runs on pick, so this component only picks a target.
 */

interface NavigatorRePointDialogProps {
   /** How many links across the app point at the dead target - the pick moves them all. */
   count: number;
   /** The picked destination for every matched link; the host applies it and closes. */
   onPick: (target: LinkInsertTarget) => void;
   /** Dismiss without re-pointing. */
   onClose: () => void;
}

export function NavigatorRePointDialog({ count, onPick, onClose }: NavigatorRePointDialogProps) {
   const { t } = useTranslation();
   return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
         <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
            <DialogHeader className="border-b border-border px-4 py-3">
               <DialogTitle className="pr-6 text-sm">{t('Navigator.rePoint.pickerHeader', { count })}</DialogTitle>
            </DialogHeader>
            <LinkTargetList onPick={onPick} />
         </DialogContent>
      </Dialog>
   );
}
