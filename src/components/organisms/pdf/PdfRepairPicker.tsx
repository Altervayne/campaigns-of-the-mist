// -- React Imports --
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// -- Data Imports --
import { listSavedPdfs } from '@/lib/drawer/drawerRepository';

// -- Utils Imports --
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';
import { selectableRepairSources } from '@/lib/pdf/pdfPlaceholder';

// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * Picks a real drawer PDF whose bytes a placeholder can adopt. Content-addressed assets dedup, so "two
 * items, one blob" is the designed outcome - adopting a hash copies no bytes. Lists every saved PDF with
 * a file (non-null hash), minus the placeholder itself, and hands the pick's hash + page count back.
 */

// Resolved once (the type is constant), matching PdfPreview's glyph.
const PdfGlyph = getItemTypeIconComponent('PDF');

export function PdfRepairPicker({
   open,
   selfPdfId,
   onOpenChange,
   onPick,
}: {
   open: boolean;
   /** The placeholder's own pdf id, excluded from the list. */
   selfPdfId: string;
   onOpenChange: (open: boolean) => void;
   onPick: (assetHash: string, pageCount: number) => void;
}) {
   const { t } = useTranslation();
   const [pdfs, setPdfs] = useState<PdfDocument[]>([]);

   // Load the saved PDFs each time the picker opens (a drawer PDF can't change while it's open).
   useEffect(() => {
      if (!open) return;
      let alive = true;
      void listSavedPdfs().then((list) => {
         if (alive) setPdfs(list);
      });
      return () => { alive = false; };
   }, [open]);

   const sources = useMemo(() => selectableRepairSources(pdfs, selfPdfId), [pdfs, selfPdfId]);

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{t('PdfView.repair.pickerTitle')}</DialogTitle>
            </DialogHeader>
            {sources.length === 0 ? (
               <p className="py-4 text-center text-sm text-muted-foreground">{t('PdfView.repair.pickerEmpty')}</p>
            ) : (
               <ul className="-mx-1 max-h-72 space-y-1 overflow-y-auto">
                  {sources.map((pdf) => (
                     <li key={pdf.id}>
                        <button
                           type="button"
                           onClick={() => onPick(pdf.assetHash as string, pdf.pageCount)}
                           className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
                        >
                           <PdfGlyph className="h-5 w-5 shrink-0 opacity-70" />
                           <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate font-medium">{pdf.title.trim() || t('Tabs.untitledPdf')}</span>
                              <span className="truncate text-xs text-muted-foreground">{t('Drawer.Types.pdfPageCount', { count: pdf.pageCount })}</span>
                           </span>
                        </button>
                     </li>
                  ))}
               </ul>
            )}
         </DialogContent>
      </Dialog>
   );
}
