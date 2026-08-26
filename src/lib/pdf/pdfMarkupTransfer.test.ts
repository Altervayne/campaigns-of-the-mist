// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import {
   applyMarkup,
   exportPdfMarkup,
   isPdfMarkupFile,
   maxAnnotationPage,
   parsePdfMarkupFile,
   reIdAnnotations,
} from './pdfMarkupTransfer';

// -- Type Imports --
import type { PdfMarkupFile } from './pdfMarkupTransfer';
import type { PdfDocument } from '@/lib/types/pdf';
import type { PdfAnnotation, PdfComment, PdfInk } from '@/lib/types/pdfAnnotation';

/*
 * The markup-only transfer format: an export -> parse round trip is byte-faithful, a malformed file is
 * rejected, the page-guard reads the highest referenced page, and the Add/Replace apply re-ids every
 * incoming mark so it never clobbers an existing one.
 */

const ink: PdfInk = { id: 'a1', kind: 'ink', page: 1, color: '#e11d48', createdAt: 1, points: [0.1, 0.1, 0.2, 0.2], width: 0.01 };
const comment: PdfComment = { id: 'c1', kind: 'comment', page: 3, color: '#f59e0b', createdAt: 2, rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, body: 'a note' };

function docWith(annotations: Record<string, PdfAnnotation>, pageCount = 10): PdfDocument {
   return { id: 'pdf-1', title: 'Rulebook', assetHash: 'hash', pageCount, annotations };
}

/**
 * Runs an `exportPdfMarkup` call in the Node env by stubbing the browser download surface (no DOM here),
 * capturing the downloaded blob and its filename. Restores the globals afterwards.
 */
async function captureDownload(run: () => void): Promise<{ blob: Blob; fileName: string }> {
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
      run();
      fileName = anchor.download;
   } finally {
      g.document = priorDocument;
      (URL as { createObjectURL?: unknown }).createObjectURL = priorCreate;
      (URL as { revokeObjectURL?: unknown }).revokeObjectURL = priorRevoke;
   }

   if (!captured) throw new Error('no download was captured');
   return { blob: captured, fileName };
}

describe('exportPdfMarkup / parsePdfMarkupFile', () => {
   it('round-trips the annotations, title, and page count byte-faithfully', async () => {
      const doc = docWith({ a1: ink, c1: comment });

      const { blob, fileName } = await captureDownload(() => exportPdfMarkup(doc, 'My Rulebook'));

      expect(fileName).toBe('My Rulebook.cotm');
      expect(blob.type).toBe('application/json');

      const parsed = parsePdfMarkupFile(await blob.text());
      expect(parsed.fileType).toBe('PDF_MARKUP');
      expect(parsed.sourceTitle).toBe('Rulebook');
      expect(parsed.sourcePageCount).toBe(10);
      expect(parsed.annotations).toEqual({ a1: ink, c1: comment });
   });

   it('exports an empty annotation map when the doc carries none', async () => {
      const { blob } = await captureDownload(() => exportPdfMarkup(docWith({}), 'Blank'));
      const parsed = parsePdfMarkupFile(await blob.text());
      expect(parsed.annotations).toEqual({});
   });

   it('rejects malformed JSON', () => {
      expect(() => parsePdfMarkupFile('{ not json')).toThrow();
   });

   it('rejects a file with the wrong fileType', () => {
      expect(() => parsePdfMarkupFile(JSON.stringify({ fileType: 'NOTE', sourcePageCount: 1, annotations: {} }))).toThrow();
   });

   it('rejects a file missing its annotations map', () => {
      expect(() => parsePdfMarkupFile(JSON.stringify({ fileType: 'PDF_MARKUP', sourcePageCount: 1 }))).toThrow();
   });
});

describe('isPdfMarkupFile', () => {
   it('accepts a well-formed file and rejects everything else', () => {
      const good: PdfMarkupFile = { fileType: 'PDF_MARKUP', version: '1', sourceTitle: 'x', sourcePageCount: 2, annotations: {} };
      expect(isPdfMarkupFile(good)).toBe(true);
      expect(isPdfMarkupFile(null)).toBe(false);
      expect(isPdfMarkupFile({ fileType: 'PDF_MARKUP' })).toBe(false);
      expect(isPdfMarkupFile({ fileType: 'CUSTOM_THEME', sourcePageCount: 1, annotations: {} })).toBe(false);
   });
});

describe('maxAnnotationPage (page-guard input)', () => {
   it('returns the highest referenced page', () => {
      expect(maxAnnotationPage({ a1: ink, c1: comment })).toBe(3);
   });

   it('returns 0 for an empty map', () => {
      expect(maxAnnotationPage({})).toBe(0);
   });
});

describe('reIdAnnotations', () => {
   it('gives every mark a fresh id while preserving its content', () => {
      const reIded = reIdAnnotations({ a1: ink });
      const keys = Object.keys(reIded);
      expect(keys).toHaveLength(1);
      expect(keys[0]).not.toBe('a1');
      const only = reIded[keys[0]];
      expect(only.id).toBe(keys[0]);
      expect({ ...only, id: 'a1' }).toEqual(ink); // page/geometry/color/createdAt intact
   });
});

describe('applyMarkup (Add / Replace)', () => {
   it('Add merges re-id\'d incoming marks over the current ones', () => {
      const current = { a1: ink };
      const result = applyMarkup(current, { c1: comment }, 'add');

      expect(Object.keys(result)).toHaveLength(2);
      expect(result.a1).toEqual(ink); // current mark untouched
      const incoming = Object.values(result).find((m) => m.kind === 'comment')!;
      expect(incoming.id).not.toBe('c1'); // re-id'd
      expect({ ...(incoming as PdfComment), id: 'c1' }).toEqual(comment);
   });

   it('Add never clobbers a current mark that shares an incoming id', () => {
      const current = { a1: ink };
      const clashing: PdfInk = { ...ink, page: 5, color: '#000000' };
      const result = applyMarkup(current, { a1: clashing }, 'add');

      // Both survive: the current a1 is intact, the incoming lands under a fresh id.
      expect(Object.keys(result)).toHaveLength(2);
      expect(result.a1).toEqual(ink);
      const other = Object.entries(result).find(([id]) => id !== 'a1')![1] as PdfInk;
      expect(other.page).toBe(5);
      expect(other.color).toBe('#000000');
   });

   it('Replace swaps the whole map for the re-id\'d incoming set', () => {
      const current = { a1: ink };
      const result = applyMarkup(current, { c1: comment }, 'replace');

      expect(Object.keys(result)).toHaveLength(1);
      expect(result.a1).toBeUndefined(); // current dropped
      const only = Object.values(result)[0];
      expect(only.id).not.toBe('c1');
      expect({ ...(only as PdfComment), id: 'c1' }).toEqual(comment);
   });
});
