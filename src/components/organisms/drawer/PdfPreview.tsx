// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { FileClock, Highlighter } from 'lucide-react';

// -- Hook Imports --
import { useAssetObjectUrl } from '@/hooks/useAssetObjectUrl';
import { usePdfCoverBackfill } from '@/hooks/drawer/usePdfCoverBackfill';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';
import { hasAnnotations } from '@/lib/pdf/annotations';
import { isPlaceholderPdf } from '@/lib/pdf/pdfPlaceholder';
import { PREVIEW_PAGE_WIDTH } from '@/components/molecules/drawer/drawerPreviewStage';

// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';

// Resolved once (the type is constant), so the glyph tracks the drawer icon without minting a
// component during render.
const PdfGlyph = getItemTypeIconComponent('PDF');

/** The annotated (marked-up) marker: solid app-themed chrome over the page, so a marked-up book stands out.
 *  Position-agnostic - the caller stacks it in a corner cluster, clear of the hover actions menu (top-right). */
function AnnotatedBadge() {
   const { t } = useTranslation();
   return (
      <span
         title={t('PdfMarkup.annotatedBadge')}
         aria-label={t('PdfMarkup.annotatedBadge')}
         className="flex items-center rounded-md bg-popover p-1.5 text-foreground shadow-sm"
      >
         <Highlighter className="h-4 w-4" />
      </span>
   );
}

/**
 * The cover face: page 1's rendered image filling the paper stage like a real book cover, top-anchored so
 * the title reads. Authored at the page width so the shared cover-fill down-scales it into the card stage.
 * The metadata chips ride the card stage at native size (see {@link PdfPreviewBadges}), never this scaled
 * image.
 */
function PdfCover({ coverUrl }: { coverUrl: string }) {
   return (
      <div className={cn('relative aspect-[4/3] overflow-hidden bg-paper-background text-paper-foreground', PREVIEW_PAGE_WIDTH)}>
         <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
      </div>
   );
}

/**
 * The glyph placeholder: the document glyph and its title on the PAPER palette so it reads as a page like
 * the note preview. Shown for a placeholder awaiting its file, or before a cover is derived. The page count
 * and markers ride the card stage at native size (see {@link PdfPreviewBadges}).
 */
function PdfGlyphFace({ pdf }: { pdf: PdfDocument }) {
   const title = typeof pdf?.title === 'string' ? pdf.title : '';
   return (
      <div className="flex h-45 w-45 flex-col overflow-hidden bg-paper-background text-paper-foreground">
         {title.trim() ? (
            <div className="shrink-0 truncate border-b border-paper-border px-2.5 py-1.5 text-sm font-semibold">{title}</div>
         ) : null}
         <div className="flex min-h-0 flex-1 items-center justify-center p-2.5">
            <PdfGlyph className="h-10 w-10 shrink-0 opacity-70" />
         </div>
      </div>
   );
}

/**
 * The PDF's metadata chips, rendered at native chrome size on the card STAGE (not inside the scaled cover),
 * so they stay legible however small the card scales in the expanded drawer. A top-LEFT cluster, clear of
 * the hover actions menu (top-right): the page count, a needs-file marker for a placeholder awaiting its
 * file, then the annotated marker. All read from the record - no async, no dependence on which face shows.
 */
export function PdfPreviewBadges({ pdf }: { pdf: PdfDocument }) {
   const { t } = useTranslation();
   const pageCount = typeof pdf?.pageCount === 'number' && pdf.pageCount > 0 ? pdf.pageCount : 0;
   return (
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col items-start gap-1.5">
         {pageCount > 0 ? (
            <span className="rounded-md bg-popover/80 px-2 py-0.5 text-[13px] font-medium text-muted-foreground">
               {t('Drawer.Types.pdfPageCount', { count: pageCount })}
            </span>
         ) : null}
         {isPlaceholderPdf(pdf) ? (
            <span
               title={t('PdfView.repair.needsFileBadge')}
               aria-label={t('PdfView.repair.needsFileBadge')}
               className="flex items-center rounded bg-popover/80 p-1 text-muted-foreground"
            >
               <FileClock className="h-3.5 w-3.5" />
            </span>
         ) : null}
         {hasAnnotations(pdf) ? <AnnotatedBadge /> : null}
      </div>
   );
}

/**
 * Static preview of a saved PDF: a rendered page-1 cover when one exists, otherwise the glyph placeholder.
 * A pre-cover pdf with bytes backfills its cover once on first view (see {@link usePdfCoverBackfill}); a
 * placeholder awaiting a file (or a cover still loading) keeps the glyph. The metadata chips are a separate
 * stage overlay ({@link PdfPreviewBadges}), so they never scale with the card. Guarded so an odd record
 * renders a fallback rather than throwing.
 */
export function PdfPreview({ pdf, drawerItemId }: { pdf: PdfDocument; drawerItemId?: string }) {
   const coverHash = usePdfCoverBackfill(pdf, drawerItemId ?? null);
   const { url: coverUrl } = useAssetObjectUrl(coverHash);
   if (coverHash && coverUrl) return <PdfCover coverUrl={coverUrl} />;
   return <PdfGlyphFace pdf={pdf} />;
}
