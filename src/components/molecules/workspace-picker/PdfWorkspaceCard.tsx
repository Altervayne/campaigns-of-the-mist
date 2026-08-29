// -- React Imports --
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Component Imports --
import { WorkspaceCard } from './WorkspaceCard';
import { PdfVignette } from './PdfVignette';

// -- Hook Imports --
import { useFileDrop } from '@/hooks/useFileDrop';

// -- Utils Imports --
import { importPdfFile } from '@/lib/pdf/importPdfFile';
import { estimateStorageUsage, STORAGE_SOFT_CAP_BYTES } from '@/lib/assets/assetGarbageCollector';

// -- Store Imports --
import { useTabManagerActions } from '@/lib/character/tabManagerStore';

// -- Constants --
import { PDF_VISUAL } from '@/lib/constants/gameVisuals';

/*
 * The PDF workspace card: the picker's only entry point for importing a rulebook. Clicking opens a file
 * picker, dropping a `.pdf` onto the card imports it too; either way the file goes through the shared
 * `importPdfFile`, then the reader tab opens and the picker dismisses. Toasts + the storage soft-cap
 * heads-up mirror the drawer's PDF import so the two paths read the same.
 */

interface PdfWorkspaceCardProps {
   /** Fired once the PDF is imported and its tab is opening (dismisses the picker). */
   onChoose?: () => void;
}

export function PdfWorkspaceCard({ onChoose }: PdfWorkspaceCardProps) {
   const { t } = useTranslation();
   const { openPdfTab } = useTabManagerActions();

   const importAndOpen = useCallback(async (file: File) => {
      const toastId = toast.loading(t('Notifications.pdf.importing'));
      try {
         const doc = await importPdfFile(file);
         await openPdfTab(doc.id);
         toast.success(t('Notifications.drawer.importSuccess'), { id: toastId });
         onChoose?.();
         // A few rulebooks approach the soft cap; a gentle, non-blocking heads-up points at "Reclaim space".
         const usage = await estimateStorageUsage();
         if (usage !== null && usage > STORAGE_SOFT_CAP_BYTES) {
            toast(t('Notifications.pdf.storageHigh'));
         }
      } catch {
         toast.error(t('Notifications.general.importFailed'), { id: toastId });
      }
   }, [t, openPdfTab, onChoose]);

   const onFiles = useCallback((files: File[]) => {
      void importAndOpen(files[0]);
   }, [importAndOpen]);

   const { getRootProps, getInputProps, isDragActive, openPicker } = useFileDrop({ onFiles, accept: '.pdf', noClick: true });

   const PdfIcon = PDF_VISUAL.Icon;

   return (
      <WorkspaceCard
         accentRgb={PDF_VISUAL.accentRgb}
         icon={<PdfIcon className="h-6 w-6" />}
         title={t('Tabs.newTabDialog.newPdfTitle')}
         subtitle={t('Tabs.newTabDialog.newPdfSubtitle')}
         onClick={openPicker}
         rootProps={getRootProps()}
         vignette={<PdfVignette isDragActive={isDragActive} />}
      >
         <input {...getInputProps()} />
      </WorkspaceCard>
   );
}
