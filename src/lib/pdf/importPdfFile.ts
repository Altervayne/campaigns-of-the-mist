// -- Other Library Imports --
import cuid from 'cuid';

// -- Local Imports --
import { parsePdfFile } from '@/lib/pdf/parsePdf';
import { storePdfAsset } from '@/lib/pdf/pdfAssetRepository';
import { storePdfCover } from '@/lib/pdf/pdfCover';
import { hashBytes } from '@/lib/assets/processImage';

// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * The shared PDF-into-storage step, used by both the drawer file import and the New Tab picker's PDF card.
 * Parses FIRST so a corrupt or encrypted PDF throws before any asset is stored - no orphan bytes, no
 * document. The bytes are content-addressed, so identical files collapse onto one asset. Cover storage is
 * best-effort: a failure leaves a null hash and the drawer glyph, never the import. Callers own their own
 * loading / success / failure toasts, the soft-cap heads-up, and where the returned document goes (a drawer
 * item, or straight into a reader tab).
 */
export async function importPdfFile(file: File): Promise<PdfDocument> {
   const { pageCount, title, coverBlob } = await parsePdfFile(file);
   const hash = await hashBytes(await file.arrayBuffer());
   await storePdfAsset({ hash, blob: file, mimeType: 'application/pdf', byteSize: file.size });
   const coverAssetHash = coverBlob ? await storePdfCover(coverBlob).catch(() => null) : null;
   return { id: cuid(), title, assetHash: hash, coverAssetHash, pageCount };
}
