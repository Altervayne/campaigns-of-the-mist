// -- Type Imports --
import type { PDFDocumentProxy } from 'pdfjs-dist';

/*
 * Resolves a PDF's embedded outline (its bookmarks) into a plain tree the nav panel renders. pdf.js hands
 * back raw nodes whose destination is either a named string or an explicit array; both resolve to a 1-based
 * page number here so the UI only ever deals with titles + pages. A dest that can't be resolved yields a
 * null page (a non-jumping row) rather than throwing the whole tree away.
 */

/** One resolved outline node: a title, its 1-based target page (null when the dest can't resolve), and children. */
export interface PdfOutlineEntry {
   title: string;
   page: number | null;
   children: PdfOutlineEntry[];
}

/** A raw pdf.js outline node, as returned by {@link PDFDocumentProxy.getOutline}. */
type RawOutlineNode = NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>[number];

/** The explicit page ref sits at index 0 of a resolved destination array. */
type PageRef = Parameters<PDFDocumentProxy['getPageIndex']>[0];

/** Resolves one node's destination to a 1-based page, or null on any failure (named lookup, ref, page index). */
async function resolvePage(proxy: PDFDocumentProxy, dest: RawOutlineNode['dest']): Promise<number | null> {
   try {
      if (!dest) return null;
      // A string dest is a named destination that must be looked up; an array dest is already explicit.
      const explicit = typeof dest === 'string' ? await proxy.getDestination(dest) : dest;
      const ref = explicit?.[0];
      if (!ref) return null;
      return (await proxy.getPageIndex(ref as PageRef)) + 1;
   } catch {
      return null;
   }
}

/** Resolves a level of raw nodes concurrently, recursing into each node's children. */
async function resolveNodes(proxy: PDFDocumentProxy, nodes: RawOutlineNode[]): Promise<PdfOutlineEntry[]> {
   return Promise.all(
      nodes.map(async (node) => ({
         title: node.title,
         page: await resolvePage(proxy, node.dest),
         children: node.items && node.items.length > 0 ? await resolveNodes(proxy, node.items) : [],
      })),
   );
}

/**
 * Resolves a PDF's embedded outline to a tree of titles + 1-based page numbers. Returns `[]` when the
 * document has no outline. A dest that can't be resolved yields `page: null` (rendered as a non-jumping row).
 */
export async function resolveOutline(proxy: PDFDocumentProxy): Promise<PdfOutlineEntry[]> {
   const raw = await proxy.getOutline();
   if (!raw) return [];
   return resolveNodes(proxy, raw);
}
