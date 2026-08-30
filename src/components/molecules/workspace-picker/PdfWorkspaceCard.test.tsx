// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

/*
 * The picker opens a transient PDF reader: it must materialize a working `pdfDocs` row (via `importPdf`)
 * BEFORE opening the tab, since the reader hydrates from that row. Opening without it lands on the
 * "could not be opened" error - the regression these tests pin.
 */

const doc = { id: 'pdf-1', title: 'Rulebook', assetHash: 'hash-1', coverAssetHash: null, pageCount: 5 };

const mocks = vi.hoisted(() => ({
   onFiles: undefined as ((files: File[]) => void) | undefined,
   importPdfFile: vi.fn(),
   importPdf: vi.fn(() => Promise.resolve()),
   openPdfTab: vi.fn(() => Promise.resolve()),
   estimateStorageUsage: vi.fn(() => Promise.resolve(0)),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-hot-toast', () => {
   const toast = Object.assign(vi.fn(), { loading: vi.fn(() => 'tid'), success: vi.fn(), error: vi.fn() });
   return { default: toast };
});
vi.mock('@/hooks/useFileDrop', () => ({
   useFileDrop: (opts: { onFiles: (files: File[]) => void }) => {
      mocks.onFiles = opts.onFiles;
      return { getRootProps: () => ({}), getInputProps: () => ({}), isDragActive: false, openPicker: vi.fn() };
   },
}));
vi.mock('@/lib/pdf/importPdfFile', () => ({ importPdfFile: mocks.importPdfFile }));
vi.mock('@/lib/pdf/pdfRepository', () => ({ importPdf: mocks.importPdf }));
vi.mock('@/lib/assets/assetGarbageCollector', () => ({ estimateStorageUsage: mocks.estimateStorageUsage, STORAGE_SOFT_CAP_BYTES: 1_000_000 }));
vi.mock('@/lib/character/tabManagerStore', () => ({ useTabManagerActions: () => ({ openPdfTab: mocks.openPdfTab }) }));
vi.mock('./WorkspaceCard', () => ({ WorkspaceCard: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./PdfVignette', () => ({ PdfVignette: () => null }));

import { PdfWorkspaceCard } from './PdfWorkspaceCard';

afterEach(() => {
   cleanup();
   mocks.onFiles = undefined;
   mocks.importPdfFile.mockReset();
   mocks.importPdf.mockClear();
   mocks.openPdfTab.mockClear();
   mocks.estimateStorageUsage.mockClear();
});

describe('PdfWorkspaceCard', () => {
   it('materializes the working row before opening the tab, keyed to the same id', async () => {
      mocks.importPdfFile.mockResolvedValue(doc);
      render(<PdfWorkspaceCard />);

      mocks.onFiles?.([new File(['%PDF-'], 'book.pdf', { type: 'application/pdf' })]);

      await waitFor(() => expect(mocks.openPdfTab).toHaveBeenCalled());
      // Unlinked working row (transient reader, not a drawer item), keyed to the imported doc's id.
      expect(mocks.importPdf).toHaveBeenCalledWith(doc, null);
      expect(mocks.openPdfTab).toHaveBeenCalledWith(doc.id);
      // The row must exist before the reader hydrates from it.
      expect(mocks.importPdf.mock.invocationCallOrder[0]).toBeLessThan(mocks.openPdfTab.mock.invocationCallOrder[0]);
   });

   it('does not open a tab when the import fails', async () => {
      mocks.importPdfFile.mockRejectedValue(new Error('corrupt'));
      render(<PdfWorkspaceCard />);

      mocks.onFiles?.([new File(['bad'], 'book.pdf', { type: 'application/pdf' })]);

      await waitFor(() => expect(mocks.importPdfFile).toHaveBeenCalled());
      expect(mocks.importPdf).not.toHaveBeenCalled();
      expect(mocks.openPdfTab).not.toHaveBeenCalled();
   });
});
