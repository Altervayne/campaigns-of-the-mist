// -- Library Imports --
import cuid from 'cuid';

// -- Drawer Imports --
import { createItem, getPdfItemIdMap } from '@/lib/drawer/drawerRepository';

// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * The board-import counterpart to the export-side pdf embed (mirrors the note path): a board file carries
 * byteless STUBS of every pdf its portals point at, and here we turn each into a local placeholder drawer
 * item. Dedup is by the PRESERVED pdf id (a globally-unique cuid, the same on every machine): a pdf already
 * in the drawer is LEFT ALONE (never duplicated, never overwritten); an absent one is materialized keeping
 * its id and its null hash. No rewire follows - a portal names the pdf by id, which reIdBoardAggregate
 * preserves, so the preserved id alone makes the portal resolve to the new placeholder.
 */

/**
 * Materializes the pdf stubs an imported board references: a pdf already in the drawer is skipped (the portal
 * resolves to it as-is); an absent one is created as a placeholder `PDF` drawer item with its id and null hash
 * kept, so it reads as "awaiting a file". `ensureFolder` lazily makes (and memoizes) the shared "Imported from
 * {board}" landing folder - called only when a placeholder is actually created, so pure links create no folder.
 */
export async function rehydrateBoardReferencedPdfs(
   pdfs: Record<string, PdfDocument> | undefined,
   ensureFolder: () => Promise<string>,
): Promise<void> {
   if (!pdfs) return;

   const existing = await getPdfItemIdMap();

   for (const [pdfId, pdf] of Object.entries(pdfs)) {
      if (existing.has(pdfId)) continue; // already in the drawer - the portal resolves to it

      // The drawer item gets a fresh id; the pdf keeps its own (the portal's target). A pdf is game-agnostic.
      await createItem({
         id: cuid(),
         name: pdf.title,
         game: 'NEUTRAL',
         type: 'PDF',
         content: { ...pdf, assetHash: null },
         parentFolderId: await ensureFolder(),
      });
   }
}
