// -- React Imports --
import { useRef, useCallback, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';
import cuid from 'cuid';

// -- Hook Imports --
import { useFileDrop } from '@/hooks/useFileDrop';

// -- Utils Imports --
import { deriveDrawerFolderName, exportDrawer, importFromFile, readFileAsText } from '@/lib/utils/export-import';
import { harmonizeData } from '@/lib/harmonization';
import { noteFromMarkdown } from '@/lib/notes/noteMarkdownFile';
import { ACCEPT_DRAWER_IMPORT } from '@/lib/utils/fileAccept';
import { hashBytes } from '@/lib/assets/processImage';
import { storePdfAsset } from '@/lib/pdf/pdfAssetRepository';
import { storePdfCover } from '@/lib/pdf/pdfCover';
import { parsePdfFile } from '@/lib/pdf/parsePdf';
import { estimateStorageUsage, STORAGE_SOFT_CAP_BYTES } from '@/lib/assets/assetGarbageCollector';

// -- Store Imports --
import { useDrawerActions } from '@/lib/stores/drawerStore';
import { exportEntireDrawerAsNestedTree } from '@/lib/drawer/drawerRepository';

// -- Type Imports --
import type { Folder as FolderType, DrawerItemContent, Drawer as DrawerType } from '@/lib/types/drawer';
import type { PdfDocument } from '@/lib/types/pdf';



/**
 * Owns the Drawer's file import and export.
 *
 * Handles dropped or picked .cotm/.json files: a full drawer replaces the
 * current drawer, while a folder or item is imported into the currently open
 * folder. Exposes root props for the drag-and-drop zone, a change
 * handler for the hidden file input (which it resets via `formRef` after a pick),
 * and a full-drawer export handler. Owns `fileInputRef` (bound to the hidden file
 * input and triggered by the import button) so the file-picker ref is dedicated
 * to the import flow and never shared with the modification-window input.
 *
 * @param currentFolderId - The currently open folder, used as the import
 *   destination for imported folders and items.
 * @returns The dropzone root props and active-drag flag, the file-input change
 *   and drawer-export handlers, and the form/file-input refs bound to the hidden
 *   import form and its file input.
 */
export function useDrawerFileImport(currentFolderId: string | null) {
   const { t: tNotifications } = useTranslation();
   const { importDrawerAsFolder, addImportedFolder, addImportedItem } = useDrawerActions();

   const formRef = useRef<HTMLFormElement>(null);
   const fileInputRef = useRef<HTMLInputElement>(null);

   const processFile = useCallback(async (file?: File) => {
      if (!file) return;

      try {
         // Markdown imports as a note item. Checked FIRST: `importFromFile` parses JSON and would throw
         // on a `.md`. Notes are game-agnostic (NEUTRAL), so it drops into the open folder like any item.
         const name = file.name.toLowerCase();
         if (name.endsWith('.md') || name.endsWith('.markdown')) {
            const note = noteFromMarkdown(await readFileAsText(file), file.name);
            await addImportedItem(note, 'NOTE', 'NEUTRAL', currentFolderId ?? undefined);
            toast.success(tNotifications('Notifications.drawer.importSuccess'));
            return;
         }

         // A PDF files as a game-agnostic drawer item, its bytes stored content-addressed. Parse FIRST so a
         // corrupt or encrypted PDF throws before any asset is stored - no orphan bytes, no item. Parsing +
         // hashing + storing a rulebook takes real time, so a loading toast stands in for it, then resolves.
         if (name.endsWith('.pdf')) {
            const toastId = toast.loading(tNotifications('Notifications.pdf.importing'));
            try {
               const { pageCount, title, coverBlob } = await parsePdfFile(file);
               const hash = await hashBytes(await file.arrayBuffer());
               await storePdfAsset({ hash, blob: file, mimeType: 'application/pdf', byteSize: file.size });
               // Best-effort cover: a store failure leaves a null hash and the drawer glyph, never the import.
               const coverAssetHash = coverBlob ? await storePdfCover(coverBlob).catch(() => null) : null;
               const pdfDoc: PdfDocument = { id: cuid(), title, assetHash: hash, coverAssetHash, pageCount };
               await addImportedItem(pdfDoc, 'PDF', 'NEUTRAL', currentFolderId ?? undefined);
               toast.success(tNotifications('Notifications.drawer.importSuccess'), { id: toastId });
               // PDFs are the first tens-of-MB item, so a few rulebooks approach the soft cap. A gentle,
               // non-blocking heads-up points at "Reclaim space" in settings; there is no hard size cap.
               const usage = await estimateStorageUsage();
               if (usage !== null && usage > STORAGE_SOFT_CAP_BYTES) {
                  toast(tNotifications('Notifications.pdf.storageHigh'));
               }
            } catch {
               toast.error(tNotifications('Notifications.general.importFailed'), { id: toastId });
            }
            return;
         }

         const importedData = await importFromFile(file);
         // Harmonize the parsed payload BEFORE persisting - file import is the only path 1.x data
         // takes into 2.0, so a drawer / folder / loose item must be migrated the same way the
         // character path migrates its sheet. `harmonizeData` recurses into the drawer / folder
         // tree and normalizes each item (tracker content + wrapper game, tag-list upgrades).
         const migratedContent = harmonizeData(importedData.content, importedData.fileType);

         switch (importedData.fileType) {
            case 'FULL_DRAWER':
               importDrawerAsFolder(
                  migratedContent as DrawerType,
                  deriveDrawerFolderName(file.name, tNotifications('Drawer.importedDrawerDefaultName'))
               );
               toast.success(tNotifications('Notifications.drawer.importedAsFolder'));
               break;

            case 'FOLDER':
               addImportedFolder(migratedContent as FolderType, currentFolderId ?? undefined);
               toast.success(tNotifications('Notifications.drawer.importSuccess'));
               break;

            case 'CUSTOM_THEME':
            case 'CARD_PALETTE':
            case 'STENCIL':
            case 'PDF':
               // Themes, card palettes, and stencils live in app settings (imported from their own manager),
               // not the drawer. A PDF is not a `.cotm` type at all - it imports as a raw `.pdf` file (handled
               // above). Reject all of them here.
               toast.error(tNotifications('Notifications.general.importFailed'));
               break;

            default:
               addImportedItem(migratedContent as DrawerItemContent, importedData.fileType, importedData.game, currentFolderId ?? undefined);
               toast.success(tNotifications('Notifications.drawer.importSuccess'));
               break;
         }

      } catch (error) {
         toast.error(tNotifications('Notifications.general.importFailed'));
         console.error("Failed to import file:", error);
      }
   }, [currentFolderId, addImportedFolder, addImportedItem, importDrawerAsFolder, tNotifications]);

   const onFiles = useCallback((files: File[]) => {
      processFile(files[0]);
   }, [processFile]);

   // Drop-only: the import button owns its own hidden input + `handleFileSelected` below.
   const { getRootProps, isDragActive } = useFileDrop({
      onFiles,
      accept: ACCEPT_DRAWER_IMPORT,
      noClick: true,
   });

   const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      processFile(file);
      formRef.current?.reset();
   };

   const handleExportDrawer = async () => {
      try {
         const drawer = await exportEntireDrawerAsNestedTree();
         await exportDrawer(drawer);
         toast.success(tNotifications('Notifications.drawer.exported'));
      } catch {
         toast.error(tNotifications('Notifications.drawer.actionFailed'));
      }
   };

   return { getRootProps, isDragActive, handleFileSelected, handleExportDrawer, formRef, fileInputRef };
}
