// -- Library Imports --
import { describe, expect, it, vi, beforeEach } from 'vitest';

// -- Local Imports --
import { importPdfFile } from './importPdfFile';
import { parsePdfFile } from './parsePdf';
import { storePdfAsset } from './pdfAssetRepository';
import { storePdfCover } from './pdfCover';
import { hashBytes } from '@/lib/assets/processImage';

/*
 * The shared PDF-into-storage step: parse -> hash -> store bytes -> best-effort cover -> build a document.
 * The four collaborators are mocked so the test pins the ordering (parse before any store) and the
 * best-effort cover contract, not pdf.js or Dexie.
 */

vi.mock('./parsePdf', () => ({ parsePdfFile: vi.fn() }));
vi.mock('./pdfAssetRepository', () => ({ storePdfAsset: vi.fn() }));
vi.mock('./pdfCover', () => ({ storePdfCover: vi.fn() }));
vi.mock('@/lib/assets/processImage', () => ({ hashBytes: vi.fn() }));

const mockParse = vi.mocked(parsePdfFile);
const mockStoreAsset = vi.mocked(storePdfAsset);
const mockStoreCover = vi.mocked(storePdfCover);
const mockHash = vi.mocked(hashBytes);

function pdfFile(name = 'rulebook.pdf'): File {
   return new File([new Uint8Array([1, 2, 3])], name, { type: 'application/pdf' });
}

const coverBlob = new Blob(['cover'], { type: 'image/webp' });

beforeEach(() => {
   vi.clearAllMocks();
   mockHash.mockResolvedValue('sha-256');
   mockStoreAsset.mockResolvedValue(undefined as never);
   mockStoreCover.mockResolvedValue('cover-hash' as never);
});

describe('importPdfFile', () => {
   it('parses, stores the bytes, and builds a document with a fresh id', async () => {
      mockParse.mockResolvedValue({ pageCount: 12, title: 'The Rulebook', coverBlob });

      const doc = await importPdfFile(pdfFile());

      expect(doc.title).toBe('The Rulebook');
      expect(doc.pageCount).toBe(12);
      expect(doc.assetHash).toBe('sha-256');
      expect(doc.coverAssetHash).toBe('cover-hash');
      expect(doc.id).toBeTruthy();
      expect(mockStoreAsset).toHaveBeenCalledWith(
         expect.objectContaining({ hash: 'sha-256', mimeType: 'application/pdf' }),
      );
   });

   it('mints a distinct id per import of the same file', async () => {
      mockParse.mockResolvedValue({ pageCount: 1, title: 'Dup', coverBlob: null });

      const first = await importPdfFile(pdfFile());
      const second = await importPdfFile(pdfFile());

      expect(first.id).not.toBe(second.id);
   });

   it('leaves a null cover hash when no cover was rendered', async () => {
      mockParse.mockResolvedValue({ pageCount: 3, title: 'No Cover', coverBlob: null });

      const doc = await importPdfFile(pdfFile());

      expect(doc.coverAssetHash).toBeNull();
      expect(mockStoreCover).not.toHaveBeenCalled();
   });

   it('keeps the import when the cover store fails, falling back to a null hash', async () => {
      mockParse.mockResolvedValue({ pageCount: 3, title: 'Cover Fails', coverBlob });
      mockStoreCover.mockRejectedValue(new Error('quota'));

      const doc = await importPdfFile(pdfFile());

      expect(doc.coverAssetHash).toBeNull();
      expect(doc.assetHash).toBe('sha-256');
   });

   it('rejects before storing anything when the parse throws', async () => {
      mockParse.mockRejectedValue(new Error('corrupt'));

      await expect(importPdfFile(pdfFile())).rejects.toThrow('corrupt');
      expect(mockStoreAsset).not.toHaveBeenCalled();
      expect(mockHash).not.toHaveBeenCalled();
   });
});
