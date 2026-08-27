// -- Local Imports --
import { loadPdfjs } from './pdfjsLoader';
import { getPdfBlob } from './pdfAssetRepository';
import { processImage } from '@/lib/assets/processImage';
import { storeAsset } from '@/lib/assets/assetRepository';

// -- Type Imports --
import type * as PdfJs from 'pdfjs-dist';

/*
 * PDF drawer covers: page 1 rendered CLEAN (no annotations) into the image `assets` store, so the drawer
 * shows a real book cover instead of a glyph. The render is immutable (the source page never changes), so a
 * cover is stored once - at import, or lazily on the first drawer view of a pre-cover pdf - and never
 * invalidated. Every step is best-effort: a render failure yields null and the caller keeps the glyph.
 */

/** Longest edge (px) of a stored cover thumbnail; sized so a portrait page fills the card stage crisply. */
export const PDF_COVER_MAX_EDGE_PX = 640;

/** pdf.js `AnnotationMode.DISABLE`, inlined so the enum's runtime value never pulls pdf.js into the eager bundle. */
const ANNOTATION_MODE_DISABLE = 0;

/**
 * Renders page 1 of an already-open document to a webp cover blob, scaled so its longest edge is
 * {@link PDF_COVER_MAX_EDGE_PX}. Clean render (embedded annotations disabled) → an immutable cover. Returns
 * null on any failure (an unrenderable page must never break the import or the preview).
 */
export async function renderPdfCoverBlob(doc: PdfJs.PDFDocumentProxy): Promise<Blob | null> {
   try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const longest = Math.max(base.width, base.height);
      const scale = longest > 0 ? PDF_COVER_MAX_EDGE_PX / longest : 1;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) return null;

      await page.render({ canvas, canvasContext: context, viewport, annotationMode: ANNOTATION_MODE_DISABLE }).promise;
      page.cleanup();

      return await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.7));
   } catch {
      return null;
   }
}

/**
 * Content-addresses a rendered cover blob into the image `assets` store (dedup-aware: the same rulebook
 * twice shares one cover) and returns its hash. Runs the blob through the shared image pipeline so it is a
 * normalized webp keyed by its bytes.
 */
export async function storePdfCover(coverBlob: Blob): Promise<string> {
   const processed = await processImage(coverBlob, { maxEdge: PDF_COVER_MAX_EDGE_PX });
   return storeAsset(processed);
}

/**
 * Lazily derives a cover for an already-imported pdf: loads its bytes by `assetHash`, renders page 1, and
 * stores the cover. Opens its own pdf.js document (the one deliberate in-drawer pdf.js use, only for a
 * missing cover) and tears it down after. Returns the stored cover hash, or null on any failure (missing
 * bytes, unrenderable page) so the caller keeps the glyph.
 */
export async function backfillPdfCover(assetHash: string): Promise<string | null> {
   try {
      const blob = await getPdfBlob(assetHash);
      if (!blob) return null;

      const pdfjs = await loadPdfjs();
      const loadingTask = pdfjs.getDocument({ data: await blob.arrayBuffer() });
      const doc = await loadingTask.promise;
      try {
         const cover = await renderPdfCoverBlob(doc);
         return cover ? await storePdfCover(cover) : null;
      } finally {
         await loadingTask.destroy();
      }
   } catch {
      return null;
   }
}
