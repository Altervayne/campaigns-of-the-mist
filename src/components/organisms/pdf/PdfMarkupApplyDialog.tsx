// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { TriangleAlert } from 'lucide-react';

// -- Basic UI Imports --
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// -- Type Imports --
import type { PendingMarkupApply } from './usePdfMarkupApply';

/*
 * The Add/Replace prompt for applying a shared markup file onto the open pdf. Add merges the incoming marks
 * in; Replace swaps the whole set. Both are one undoable step, so neither is styled as a destructive action.
 */
export function PdfMarkupApplyDialog({
   pending,
   onAdd,
   onReplace,
   onCancel,
}: {
   pending: PendingMarkupApply | null;
   onAdd: () => void;
   onReplace: () => void;
   onCancel: () => void;
}) {
   const { t } = useTranslation();

   return (
      <Dialog open={!!pending} onOpenChange={(open) => { if (!open) onCancel(); }}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{t('PdfMarkup.apply.title')}</DialogTitle>
               <DialogDescription>
                  {pending && t('PdfMarkup.apply.body', { title: pending.file.sourceTitle, count: pending.incomingCount })}
               </DialogDescription>
            </DialogHeader>
            {pending?.pageCountMismatch && (
               <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{t('PdfMarkup.apply.mismatch')}</span>
               </p>
            )}
            <DialogFooter>
               <Button variant="outline" onClick={onCancel}>{t('Common.cancel')}</Button>
               <Button variant="secondary" onClick={onReplace}>{t('PdfMarkup.apply.replace')}</Button>
               <Button onClick={onAdd}>{t('PdfMarkup.apply.add')}</Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
