// -- Library Imports --
import toast from 'react-hot-toast';

// -- Utils Imports --
import { deriveExportHandle, exportPdfBytes, exportToFile, generateExportFilename, toExportableItemContent } from '@/lib/utils/export-import';
import { exportPdfMarkup } from '@/lib/pdf/pdfMarkupTransfer';
import { hasAnnotations } from '@/lib/pdf/annotations';

// -- Type Imports --
import type { TFunction } from 'i18next';
import type { DrawerItem } from '@/lib/types/drawer';
import type { PdfDocument } from '@/lib/types/pdf';

/**
 * Exports one drawer item and toasts the outcome. A PDF downloads its original raw file (no `.cotm`
 * envelope, no annotations baked in, any size) named after the item; every other type rides the `.cotm`
 * export envelope. Shared by the desktop and mobile drawer menus so the branch and its toasts stay in one place.
 */
export async function exportDrawerItem(item: Pick<DrawerItem, 'content' | 'type' | 'game' | 'name'>, t: TFunction): Promise<void> {
   const { content, type, game, name } = item;
   try {
      if (type === 'PDF') {
         await exportPdfBytes(content as PdfDocument, name);
         toast.success(t('Notifications.pdf.exported'));
         return;
      }

      const exportable = toExportableItemContent(type, content);
      if (!exportable) return;
      const handle = deriveExportHandle(exportable, name);
      const fileName = generateExportFilename(game, type, handle);
      await exportToFile(exportable, type, game, fileName);
      toast.success(t('Notifications.drawer.itemExported'));
   } catch (error) {
      console.error('Drawer item export failed:', error);
      toast.error(t('Notifications.general.exportError'));
   }
}

/** Whether a drawer item is a PDF carrying markup - the gate for the "export annotations" action. */
export function canExportPdfMarkup(item: Pick<DrawerItem, 'content' | 'type'>): boolean {
   return item.type === 'PDF' && hasAnnotations(item.content as PdfDocument);
}

/**
 * Exports a PDF drawer item's ANNOTATIONS as a bytes-free `.cotm` markup file (no PDF bytes, the
 * licensing-safe share path) and toasts. No-op for a non-PDF item.
 */
export function exportDrawerItemMarkup(item: Pick<DrawerItem, 'content' | 'type' | 'name'>, t: TFunction): void {
   if (item.type !== 'PDF') return;
   try {
      exportPdfMarkup(item.content as PdfDocument, item.name);
      toast.success(t('Notifications.pdf.markupExported'));
   } catch (error) {
      console.error('PDF markup export failed:', error);
      toast.error(t('Notifications.general.exportError'));
   }
}
