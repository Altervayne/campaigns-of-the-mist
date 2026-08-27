// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase as db } from '@/lib/drawer/drawerDatabase';
import { storePdfAsset } from './pdfAssetRepository';
import { hashBytes } from '@/lib/assets/processImage';
import { exportPdfBytes } from '@/lib/utils/export-import';

// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * Raw PDF export at the data layer (the DOM download is browser-verified): exporting a PDF drawer item
 * downloads the ORIGINAL stored bytes as a `.pdf` - no `.cotm` envelope, no base64, no annotations baked in.
 */

/** A tiny valid-ish PDF byte blob stored under its content hash. */
async function storeFixture() {
   const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"
   const blob = new Blob([bytes], { type: 'application/pdf' });
   const hash = await hashBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
   await storePdfAsset({ hash, blob, mimeType: 'application/pdf', byteSize: blob.size });
   return { bytes, hash };
}

function pdfContent(hash: string): PdfDocument {
   return { id: 'pdf-1', title: 'Rulebook', assetHash: hash, coverAssetHash: null, pageCount: 42 };
}

/**
 * Runs an `exportPdfBytes` call in the Node env by stubbing the browser download surface (no DOM here),
 * capturing the downloaded blob and its filename. Restores the globals afterwards.
 */
async function captureDownload(run: () => Promise<void>): Promise<{ blob: Blob; fileName: string }> {
   let captured: Blob | null = null;
   let fileName = '';
   const g = globalThis as unknown as { document?: unknown };
   const priorDocument = g.document;
   const priorCreate = (URL as { createObjectURL?: unknown }).createObjectURL;
   const priorRevoke = (URL as { revokeObjectURL?: unknown }).revokeObjectURL;

   const anchor = { href: '', download: '', click() {} };
   g.document = { createElement: () => anchor, body: { appendChild() {}, removeChild() {} } };
   (URL as { createObjectURL: (b: Blob) => string }).createObjectURL = (blob) => { captured = blob; return 'blob:mock'; };
   (URL as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};

   try {
      await run();
      fileName = anchor.download;
   } finally {
      g.document = priorDocument;
      (URL as { createObjectURL?: unknown }).createObjectURL = priorCreate;
      (URL as { revokeObjectURL?: unknown }).revokeObjectURL = priorRevoke;
   }

   if (!captured) throw new Error('no download was captured');
   return { blob: captured, fileName };
}

beforeEach(async () => {
   await db.pdfAssets.clear();
   await db.pdfDocs.clear();
   await db.items.clear();
});

describe('exportPdfBytes', () => {
   it('downloads the original stored bytes as `${name}.pdf`', async () => {
      const { bytes, hash } = await storeFixture();

      const { blob, fileName } = await captureDownload(() => exportPdfBytes(pdfContent(hash), 'My Rulebook'));

      expect(fileName).toBe('My Rulebook.pdf');
      expect(blob.type).toBe('application/pdf');
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes); // byte-identical to the stored original
   });

   it('throws when the asset is missing from the store (caller toasts the failure)', async () => {
      await expect(exportPdfBytes(pdfContent('absent-hash'), 'Ghost')).rejects.toThrow();
   });
});
