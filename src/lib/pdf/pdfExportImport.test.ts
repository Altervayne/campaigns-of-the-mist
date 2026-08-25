// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase as db } from '@/lib/drawer/drawerDatabase';
import { getPdfBlob, listPdfAssetHashes } from './pdfAssetRepository';
import { hashBytes } from '@/lib/assets/processImage';
import {
   blobToBase64,
   collectPdfHashesFromContent,
   isExportedPdf,
   rehydratePdfAssets,
   toExportableItemContent,
} from '@/lib/utils/export-import';

// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';
import type { Drawer, DrawerItem, Folder } from '@/lib/types/drawer';
import type { EmbeddedPdf, ExportFile } from '@/lib/utils/export-import';

/** Annotations spanning all three kinds (ink, highlight, comment), for the round-trip fidelity check. */
function sampleAnnotations(): Record<string, PdfAnnotation> {
   return {
      a1: { id: 'a1', kind: 'ink', page: 1, color: '#e11d48', createdAt: 1, points: [0.1, 0.1, 0.2, 0.2], width: 0.01 },
      a2: { id: 'a2', kind: 'highlight', page: 3, color: '#facc15', createdAt: 2, rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 }, alpha: 0.4 },
      a3: { id: 'a3', kind: 'comment', page: 5, color: '#f59e0b', createdAt: 3, rect: { x: 0.4, y: 0.5, w: 0.2, h: 0.1 }, body: 'House rule: we ignore this table.' },
   };
}

/*
 * The PDF file round-trip at the data layer (the DOM download/upload is browser-verified): a PDF item's
 * bytes ride the envelope's own `pdfAssets` channel, rehydrate dedup-aware, and its `PdfDocument` metadata
 * survives verbatim.
 */

/** A tiny valid-ish PDF byte blob - the asset round-trip is content-addressed, so it needn't parse. */
async function makeFixture() {
   const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"
   const blob = new Blob([bytes], { type: 'application/pdf' });
   const hash = await hashBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
   const embedded: EmbeddedPdf = { mimeType: 'application/pdf', byteSize: blob.size, base64: await blobToBase64(blob) };
   return { bytes, blob, hash, embedded };
}

function pdfContent(hash: string, overrides: Partial<PdfDocument> = {}): PdfDocument {
   return { id: 'pdf-1', title: 'Rulebook', assetHash: hash, pageCount: 42, ...overrides };
}

function item(id: string, content: PdfDocument): DrawerItem {
   return { id, game: 'NEUTRAL', type: 'PDF', name: content.title, content };
}

beforeEach(async () => {
   await db.pdfAssets.clear();
   await db.pdfDocs.clear();
   await db.items.clear();
});

describe('collectPdfHashesFromContent', () => {
   it('yields a single PDF content its own assetHash', async () => {
      const { hash } = await makeFixture();
      expect([...collectPdfHashesFromContent(pdfContent(hash))]).toEqual([hash]);
   });

   it('folds every PDF item across a folder / drawer tree', async () => {
      const a = 'hash-a';
      const b = 'hash-b';
      const folder: Folder = {
         id: 'f1', name: 'Sub', items: [item('i-b', pdfContent(b, { id: 'pdf-b' }))], folders: [],
      };
      const drawer: Drawer = {
         rootItems: [item('i-a', pdfContent(a, { id: 'pdf-a' }))],
         folders: [folder],
      };
      expect(collectPdfHashesFromContent(drawer)).toEqual(new Set([a, b]));
   });
});

describe('rehydratePdfAssets', () => {
   it('re-stores embedded bytes so the blob resolves by hash', async () => {
      const { hash, embedded } = await makeFixture();

      await rehydratePdfAssets({ [hash]: embedded });

      const blob = await getPdfBlob(hash);
      expect(blob).toBeDefined();
      expect(blob!.size).toBe(embedded.byteSize);
   });

   it('dedups: re-importing the same file does not duplicate asset rows', async () => {
      const { hash, embedded } = await makeFixture();

      await rehydratePdfAssets({ [hash]: embedded });
      await rehydratePdfAssets({ [hash]: embedded }); // import the same file again

      const stored = await listPdfAssetHashes();
      expect(stored.map((s) => s.hash)).toEqual([hash]);
   });
});

describe('isExportedPdf', () => {
   it('accepts a well-formed PDF envelope carrying its bytes', async () => {
      const { hash, embedded } = await makeFixture();
      const file: ExportFile = {
         fileType: 'PDF', game: 'NEUTRAL', content: pdfContent(hash), pdfAssets: { [hash]: embedded },
      };
      expect(isExportedPdf(file)).toBe(true);
   });

   it('rejects an envelope missing the referenced bytes', async () => {
      const { hash } = await makeFixture();
      const file: ExportFile = { fileType: 'PDF', game: 'NEUTRAL', content: pdfContent(hash) };
      expect(isExportedPdf(file)).toBe(false);
   });

   it('accepts an annotated envelope (annotations are optional, not required)', async () => {
      const { hash, embedded } = await makeFixture();
      const file: ExportFile = {
         fileType: 'PDF', game: 'NEUTRAL', content: pdfContent(hash, { annotations: sampleAnnotations() }), pdfAssets: { [hash]: embedded },
      };
      expect(isExportedPdf(file)).toBe(true);
   });
});

describe('annotation round-trip', () => {
   it('toExportableItemContent carries annotations verbatim into the envelope content', async () => {
      const { hash } = await makeFixture();
      const annotations = sampleAnnotations();
      const content = pdfContent(hash, { annotations });

      const exportable = toExportableItemContent('PDF', content) as PdfDocument;

      expect(exportable.annotations).toEqual(annotations);
      expect(exportable).toEqual(content); // whole aggregate, not a whitelisted subset
   });

   it('survives the full .cotm serialize -> parse: ink + highlight + comment come back byte-faithful', async () => {
      const { hash, embedded } = await makeFixture();
      const annotations = sampleAnnotations();
      const content = pdfContent(hash, { annotations });

      // Build the envelope exactly as exportToFile does (content via toExportableItemContent, bytes on the
      // pdfAssets channel), then push it through the JSON transport importFromFile reads back.
      const exported: ExportFile = {
         fileType: 'PDF', game: 'NEUTRAL', content: toExportableItemContent('PDF', content)!, pdfAssets: { [hash]: embedded },
      };
      const reparsed = JSON.parse(JSON.stringify(exported)) as ExportFile;

      expect(isExportedPdf(reparsed)).toBe(true);
      const restored = reparsed.content as PdfDocument;
      // Same ids, kinds, geometry, and the comment body - nothing dropped or reshaped in transit.
      expect(restored.annotations).toEqual(annotations);
      expect(Object.keys(restored.annotations!)).toEqual(['a1', 'a2', 'a3']);
      expect(restored.annotations!.a3).toMatchObject({ kind: 'comment', body: 'House rule: we ignore this table.' });
   });
});
