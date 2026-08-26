// -- React Imports --
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Store Imports --
import { useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';

// -- Utils Imports --
import { readFileAsText } from '@/lib/utils/export-import';
import { applyMarkup, maxAnnotationPage, parsePdfMarkupFile } from '@/lib/pdf/pdfMarkupTransfer';

// -- Type Imports --
import type { ChangeEvent } from 'react';
import type { PdfStore } from '@/lib/stores/pdfStore';
import type { MarkupApplyMode, PdfMarkupFile } from '@/lib/pdf/pdfMarkupTransfer';

/** A parsed, page-guarded markup file awaiting the Add/Replace choice. */
export interface PendingMarkupApply {
   file: PdfMarkupFile;
   /** Incoming mark count, shown in the dialog. */
   incomingCount: number;
   /** The source was made for a different-length PDF (still fits): positions may not line up. */
   pageCountMismatch: boolean;
}

/*
 * Drives applying a shared markup file onto the OPEN pdf. The palette command signals through the general
 * store (mirroring the drawer-import bridge); this opens the file picker, parses + page-guards the pick, and
 * holds the parsed file until the Add/Replace dialog resolves. Applying brackets ONE undo step, so undo
 * restores the pre-apply map in a single move.
 */
export function usePdfMarkupApply(store: PdfStore) {
   const { t } = useTranslation();
   const fileInputRef = useRef<HTMLInputElement>(null);
   const [pending, setPending] = useState<PendingMarkupApply | null>(null);

   const requested = useAppGeneralStateStore((state) => state.pendingPdfMarkupApply);
   const clearRequest = useAppGeneralStateStore((state) => state.actions.clearPdfMarkupApply);

   // The palette command flips the flag; consume it and open the picker.
   useEffect(() => {
      if (!requested) return;
      clearRequest();
      fileInputRef.current?.click();
   }, [requested, clearRequest]);

   const onFileChange = useCallback(
      async (event: ChangeEvent<HTMLInputElement>) => {
         const file = event.target.files?.[0];
         event.target.value = ''; // let the same file be re-picked after a cancel
         if (!file) return;

         let parsed: PdfMarkupFile;
         try {
            parsed = parsePdfMarkupFile(await readFileAsText(file));
         } catch {
            toast.error(t('Notifications.pdf.markupInvalid'));
            return;
         }

         const doc = store.getState().doc;
         if (!doc) return;

         // Page-guard: a mark past the target's last page can't be placed, so reject the whole file.
         const maxPage = maxAnnotationPage(parsed.annotations);
         if (maxPage > doc.pageCount) {
            toast.error(t('Notifications.pdf.markupPageOverflow', { page: maxPage, count: doc.pageCount }));
            return;
         }

         setPending({
            file: parsed,
            incomingCount: Object.keys(parsed.annotations).length,
            pageCountMismatch: parsed.sourcePageCount !== doc.pageCount,
         });
      },
      [store, t],
   );

   const apply = useCallback(
      (mode: MarkupApplyMode) => {
         if (!pending) return;
         const doc = store.getState().doc;
         if (!doc) return;
         const next = applyMarkup(doc.annotations ?? {}, pending.file.annotations, mode);
         const actions = store.getState().actions;
         actions.beginHistory();
         actions.setAnnotations(next);
         actions.commitHistory();
         toast.success(t('Notifications.pdf.markupApplied'));
         setPending(null);
      },
      [pending, store, t],
   );

   const cancel = useCallback(() => setPending(null), []);

   return { fileInputRef, onFileChange, pending, apply, cancel };
}
