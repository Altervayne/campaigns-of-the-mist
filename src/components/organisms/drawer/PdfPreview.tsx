// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Utils Imports --
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';

// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';

// Resolved once (the type is constant), so the glyph tracks the drawer icon without minting a
// component during render.
const PdfGlyph = getItemTypeIconComponent('PDF');

/**
 * Static preview of a saved PDF: the document glyph, its title, and a page count, on the PAPER
 * palette so it reads as a page like the note preview (parchment by default, re-themed by a
 * custom theme's paper tokens), NOT app `--card-*`. No rendered thumbnail - that needs pdf.js in
 * the drawer. Guarded: title/pageCount are read defensively so an odd record renders a fallback
 * rather than throwing.
 */
export function PdfPreview({ pdf }: { pdf: PdfDocument }) {
   const { t } = useTranslation();
   const title = typeof pdf?.title === 'string' ? pdf.title : '';
   const pageCount = typeof pdf?.pageCount === 'number' && pdf.pageCount > 0 ? pdf.pageCount : 0;

   return (
      <div className="flex h-45 w-45 flex-col overflow-hidden rounded-md border border-paper-border bg-paper-background text-paper-foreground">
         {title.trim() ? (
            <div className="shrink-0 truncate border-b border-paper-border px-2.5 py-1.5 text-sm font-semibold">{title}</div>
         ) : null}
         <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-2.5">
            <PdfGlyph className="h-10 w-10 shrink-0 opacity-70" />
            <span className="text-xs opacity-70">{t('Drawer.Types.pdfPageCount', { count: pageCount })}</span>
         </div>
      </div>
   );
}
