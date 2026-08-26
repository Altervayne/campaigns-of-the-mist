// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { TriangleAlert } from 'lucide-react';

// -- Basic UI Imports --
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// -- Type Imports --
import type { PendingRepair } from './usePdfRepair';

/*
 * The soft warning when the supplied file's page count differs from the placeholder's remembered count.
 * Annotations placed on the old length may not line up, so it warns - but never blocks: an out-of-range
 * mark just isn't painted, and none is deleted. Not styled destructive; "Use anyway" accepts the file.
 */
export function PdfRepairMismatchDialog({
   pending,
   onConfirm,
   onCancel,
}: {
   pending: PendingRepair | null;
   onConfirm: () => void;
   onCancel: () => void;
}) {
   const { t } = useTranslation();

   return (
      <Dialog open={!!pending} onOpenChange={(open) => { if (!open) onCancel(); }}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{t('PdfView.repair.mismatchTitle')}</DialogTitle>
               <DialogDescription className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{pending && t('PdfView.repair.mismatchBody', { new: pending.pageCount, old: pending.oldPageCount })}</span>
               </DialogDescription>
            </DialogHeader>
            <DialogFooter>
               <Button variant="outline" onClick={onCancel}>{t('Common.cancel')}</Button>
               <Button onClick={onConfirm}>{t('PdfView.repair.useAnyway')}</Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
