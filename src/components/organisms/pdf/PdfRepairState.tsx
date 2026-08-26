// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';

// -- Icon Imports --
import { FileClock, FolderOpen, Upload } from 'lucide-react';

// -- Component Imports --
import { Button } from '@/components/ui/button';
import { PdfRepairPicker } from './PdfRepairPicker';
import { PdfRepairMismatchDialog } from './PdfRepairMismatchDialog';

// -- Local Imports --
import { usePdfRepair } from './usePdfRepair';

// -- Type Imports --
import type { PdfStore } from '@/lib/stores/pdfStore';

/*
 * The reader state for a byteless placeholder: the file isn't here, but the record is intact. Calm and
 * muted (not the error's warning) - reassurance first, then the two ways to supply the missing file
 * (adopt a drawer PDF's bytes, or upload one). Supplying it re-hydrates in place; the title, id, and
 * annotations are never touched, so inbound links keep resolving.
 */
export function PdfRepairState({ store }: { store: PdfStore }) {
   const { t } = useTranslation();
   const doc = useStore(store, (state) => state.doc);
   const pdfId = useStore(store, (state) => state.pdfId);
   const [pickerOpen, setPickerOpen] = useState(false);
   const { fileInputRef, onFileChange, chooseFromDrawer, pending, confirm, cancel, busy } = usePdfRepair(store);

   const annotationCount = doc?.annotations ? Object.keys(doc.annotations).length : 0;
   const pageCount = doc?.pageCount ?? 0;

   return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
         <FileClock className="h-10 w-10 text-muted-foreground opacity-50" />
         <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{t('PdfView.placeholderTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('PdfView.placeholderBody')}</p>
            {annotationCount > 0 && (
               <p className="text-xs text-muted-foreground">{t('PdfView.repair.kept', { count: annotationCount, pages: pageCount })}</p>
            )}
         </div>
         <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setPickerOpen(true)} disabled={busy}>
               <FolderOpen className="h-4 w-4" />
               {t('PdfView.repair.chooseFromDrawer')}
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} disabled={busy}>
               <Upload className="h-4 w-4" />
               {t('PdfView.repair.uploadFile')}
            </Button>
         </div>

         <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={onFileChange} />

         {pdfId && (
            <PdfRepairPicker
               open={pickerOpen}
               selfPdfId={pdfId}
               onOpenChange={setPickerOpen}
               onPick={(assetHash, sourcePageCount) => {
                  setPickerOpen(false);
                  chooseFromDrawer(assetHash, sourcePageCount);
               }}
            />
         )}
         <PdfRepairMismatchDialog pending={pending} onConfirm={confirm} onCancel={cancel} />
      </div>
   );
}
