// -- React Imports --
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Pdf Data Layer Imports --
import { repairPdf } from '@/lib/pdf/pdfRepository';
import { parsePdfFile } from '@/lib/pdf/parsePdf';
import { storePdfAsset } from '@/lib/pdf/pdfAssetRepository';

// -- Assets Imports --
import { hashBytes } from '@/lib/assets/processImage';

// -- Type Imports --
import type { ChangeEvent } from 'react';
import type { PdfStore } from '@/lib/stores/pdfStore';

/** A supplied file whose page count differs from the placeholder's, held until the confirm dialog resolves. */
export interface PendingRepair {
   assetHash: string;
   /** The supplied file's page count (authoritative once accepted). */
   pageCount: number;
   /** The placeholder's remembered page count, for the mismatch copy. */
   oldPageCount: number;
}

/*
 * Drives supplying a byteless placeholder's missing file, from either a drawer PDF or an upload. Both
 * paths land on the same page-count guard: matching counts repair silently; a different count defers to
 * the confirm dialog (soft warn, never a hard block - an out-of-range mark simply isn't painted). Repair
 * fills the bytes-pointer on both copies, then re-hydrates the instance IN PLACE so the reader opens on
 * the kept reading position without a tab close/reopen.
 */
export function usePdfRepair(store: PdfStore) {
   const { t } = useTranslation();
   const fileInputRef = useRef<HTMLInputElement>(null);
   const [pending, setPending] = useState<PendingRepair | null>(null);
   // True while an upload parses/hashes, so the actions disable rather than firing twice.
   const [busy, setBusy] = useState(false);

   // Fills the placeholder's file, then re-hydrates the instance: from `placeholder` the hydrate re-runs,
   // now finds the non-null hash, loads the bytes, and seeds the page from `lastPage`.
   const commit = useCallback(
      async (assetHash: string, pageCount: number) => {
         const { pdfId, doc, actions } = store.getState();
         if (!pdfId) return;
         const title = doc?.title ?? '';
         await repairPdf(pdfId, assetHash, pageCount);
         await actions.hydrate(pdfId);
         toast.success(t('Notifications.pdf.repairSuccess', { title }));
      },
      [store, t],
   );

   // Page-guard shared by both supply paths: a matching count repairs at once; a mismatch opens the dialog.
   const attempt = useCallback(
      (assetHash: string, pageCount: number) => {
         const doc = store.getState().doc;
         if (!doc) return;
         if (pageCount !== doc.pageCount) {
            setPending({ assetHash, pageCount, oldPageCount: doc.pageCount });
            return;
         }
         void commit(assetHash, pageCount);
      },
      [store, commit],
   );

   const confirm = useCallback(() => {
      if (!pending) return;
      const { assetHash, pageCount } = pending;
      setPending(null);
      void commit(assetHash, pageCount);
   }, [pending, commit]);

   const cancel = useCallback(() => setPending(null), []);

   // Upload path: the drawer-import PDF steps (parse -> hash -> store), minus the drawer-item mint. Parse
   // FIRST so a corrupt/encrypted file rejects before any bytes are stored (no orphan asset).
   const onFileChange = useCallback(
      async (event: ChangeEvent<HTMLInputElement>) => {
         const file = event.target.files?.[0];
         event.target.value = ''; // let the same file be re-picked after a cancel
         if (!file) return;

         setBusy(true);
         const toastId = toast.loading(t('Notifications.pdf.importing'));
         try {
            const { pageCount } = await parsePdfFile(file);
            const hash = await hashBytes(await file.arrayBuffer());
            await storePdfAsset({ hash, blob: file, mimeType: 'application/pdf', byteSize: file.size });
            toast.dismiss(toastId);
            attempt(hash, pageCount);
         } catch {
            toast.error(t('Notifications.general.importFailed'), { id: toastId });
         } finally {
            setBusy(false);
         }
      },
      [attempt, t],
   );

   return { fileInputRef, onFileChange, chooseFromDrawer: attempt, pending, confirm, cancel, busy };
}
