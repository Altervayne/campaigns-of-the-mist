// -- Local Imports --
import { loadPdfjs } from './pdfjsLoader';

/*
 * Reads a PDF file's metadata for import: the page count and a display title. Phase-2 import
 * needs only these, so the document is parsed and immediately destroyed. The viewer parses the
 * same bytes separately and keeps its own document alive.
 */

/** The page count and display title parsed from a PDF file. */
export interface ParsedPdfMeta {
   pageCount: number;
   title: string;
}

/** The filename with a trailing `.pdf` (any case) stripped, the title fallback. */
function filenameTitle(name: string): string {
   return name.replace(/\.pdf$/i, '');
}

/**
 * Parses a PDF file's page count and title. The title is the document's own `Title` metadata
 * when it is a non-empty string, otherwise the filename without its extension. Throws if the
 * bytes are not a readable PDF (corrupt or encrypted), so the caller can reject the import.
 */
export async function parsePdfFile(file: File): Promise<ParsedPdfMeta> {
   const pdfjs = await loadPdfjs();
   const data = await file.arrayBuffer();
   const loadingTask = pdfjs.getDocument({ data });
   const doc = await loadingTask.promise;
   try {
      const pageCount = doc.numPages;
      const { info } = await doc.getMetadata();
      const metaTitle = (info as { Title?: unknown } | undefined)?.Title;
      const title = typeof metaTitle === 'string' && metaTitle.trim() ? metaTitle : filenameTitle(file.name);
      return { pageCount, title };
   } finally {
      // Tearing down the loading task releases the document and its worker transport.
      await loadingTask.destroy();
   }
}
