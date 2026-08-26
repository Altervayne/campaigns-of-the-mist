// -- Other Library Imports --
import cuid from 'cuid';

// -- Utils Imports --
import { triggerBlobDownload } from '@/lib/utils/export-import';
import { APP_VERSION } from '@/lib/config';

// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';

/*
 * Markup-only PDF transfer: a tiny bytes-free JSON envelope carrying just a PDF's annotations, so a
 * marked-up book can be shared without its licensed / watermarked file. Standalone from the `.cotm`
 * routing - the apply flow reads and parses a picked file directly - and, with no embedded bytes, immune
 * to the per-file size overflow that rules out a full-PDF envelope.
 */

/** The whole exported annotations file: the source's title + page count (for the apply page-guard) and the marks. */
export interface PdfMarkupFile {
   fileType: 'PDF_MARKUP';
   /** The app version that wrote the file. */
   version: string;
   /** The source PDF's title, shown when applying. */
   sourceTitle: string;
   /** The source PDF's page count, so apply can flag a different-length target. */
   sourcePageCount: number;
   /** The marks, keyed by annotation id (each carries its own page). */
   annotations: Record<string, PdfAnnotation>;
}

/** Which way incoming marks land on the open PDF: merged in, or swapped for the whole set. */
export type MarkupApplyMode = 'add' | 'replace';

/** Builds the envelope and downloads it as `${fileName}.cotm`. Bytes-free, so any annotation count fits. */
export function exportPdfMarkup(doc: PdfDocument, fileName: string): void {
   const file: PdfMarkupFile = {
      fileType: 'PDF_MARKUP',
      version: APP_VERSION,
      sourceTitle: doc.title,
      sourcePageCount: doc.pageCount,
      annotations: doc.annotations ?? {},
   };
   const json = JSON.stringify(file, null, 2);
   triggerBlobDownload(`${fileName}.cotm`, new Blob([json], { type: 'application/json' }));
}

/** Whether a parsed value is a markup file - the `fileType` tag plus the shape apply relies on. */
export function isPdfMarkupFile(parsed: unknown): parsed is PdfMarkupFile {
   if (!parsed || typeof parsed !== 'object') return false;
   const file = parsed as Partial<PdfMarkupFile>;
   return file.fileType === 'PDF_MARKUP'
      && typeof file.sourcePageCount === 'number'
      && !!file.annotations && typeof file.annotations === 'object';
}

/** Parses a picked file's text into a markup file, throwing on malformed JSON or the wrong shape. */
export function parsePdfMarkupFile(text: string): PdfMarkupFile {
   const parsed: unknown = JSON.parse(text);
   if (!isPdfMarkupFile(parsed)) throw new Error('Not a PDF markup file.');
   return parsed;
}

/** The highest page any mark references, or 0 for none; the page-guard compares it to the target's page count. */
export function maxAnnotationPage(annotations: Record<string, PdfAnnotation>): number {
   let max = 0;
   for (const mark of Object.values(annotations)) if (mark.page > max) max = mark.page;
   return max;
}

/** Copies every mark under a fresh id, keeping page/geometry/body/color/createdAt, so an incoming set never collides. */
export function reIdAnnotations(annotations: Record<string, PdfAnnotation>): Record<string, PdfAnnotation> {
   const next: Record<string, PdfAnnotation> = {};
   for (const mark of Object.values(annotations)) {
      const id = cuid();
      next[id] = { ...mark, id };
   }
   return next;
}

/**
 * The annotation map after applying incoming marks onto the current ones. Incoming marks are always re-id'd
 * so they never clobber an existing one: Add merges them over the current map, Replace uses them as the whole
 * map. Pure - the caller brackets it in one history step.
 */
export function applyMarkup(
   current: Record<string, PdfAnnotation>,
   incoming: Record<string, PdfAnnotation>,
   mode: MarkupApplyMode,
): Record<string, PdfAnnotation> {
   const reIded = reIdAnnotations(incoming);
   return mode === 'add' ? { ...current, ...reIded } : reIded;
}
