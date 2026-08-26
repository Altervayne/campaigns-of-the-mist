// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { FileClock, Highlighter } from 'lucide-react';

// -- Utils Imports --
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';
import { hasAnnotations } from '@/lib/pdf/annotations';
import { isPlaceholderPdf } from '@/lib/pdf/pdfPlaceholder';

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
   const needsFile = isPlaceholderPdf(pdf);

   return (
      <div className="relative flex h-45 w-45 flex-col overflow-hidden rounded-md border border-paper-border bg-paper-background text-paper-foreground">
         {/* Needs-file marker: muted app chrome (not an error) top-LEFT, clear of the annotated badge, so a
             placeholder awaiting its file reads at a glance while the preserved page count reassures. */}
         {needsFile ? (
            <span
               title={t('PdfView.repair.needsFileBadge')}
               aria-label={t('PdfView.repair.needsFileBadge')}
               className="absolute left-1 top-1 z-10 flex items-center rounded bg-popover/80 p-1 text-muted-foreground"
            >
               <FileClock className="h-3 w-3" />
            </span>
         ) : null}
         {/* Annotated marker: app-themed chrome over the paper, so a marked-up book is discoverable in the drawer. */}
         {hasAnnotations(pdf) ? (
            <span
               title={t('PdfMarkup.annotatedBadge')}
               aria-label={t('PdfMarkup.annotatedBadge')}
               className="absolute right-1 top-1 z-10 flex items-center rounded bg-popover/80 p-1 text-muted-foreground"
            >
               <Highlighter className="h-3 w-3" />
            </span>
         ) : null}
         {title.trim() ? (
            <div className="shrink-0 truncate border-b border-paper-border px-2.5 py-1.5 text-sm font-semibold">{title}</div>
         ) : null}
         <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-2.5">
            <PdfGlyph className="h-10 w-10 shrink-0 opacity-70" />
            <span className="text-xs opacity-70">
               {needsFile ? t('PdfView.repair.needsFileCount', { count: pageCount }) : t('Drawer.Types.pdfPageCount', { count: pageCount })}
            </span>
         </div>
      </div>
   );
}
