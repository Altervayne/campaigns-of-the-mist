// -- Drawer Imports --
import { findEntityDrawerItem } from '@/lib/drawer/drawerRepository';

// -- Type Imports --
import type { Board } from '@/lib/types/board';
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * Resolves the drawer content behind a board's PDF portals so an export can carry a byteless STUB the bare
 * portal id can't. A portal to a pdf names it by id; on another machine that id resolves to nothing, so we
 * embed the pdf's drawer content with `assetHash: null` + `coverAssetHash: null` (neither the raw bytes nor the
 * re-derivable cover travel) and let the importer
 * materialize a placeholder. The preserved id keeps the portal alive - it lands on the repair state, not a
 * dead link.
 */

/**
 * Walks `board.items` for portals targeting a pdf and resolves each unique target id to its drawer content,
 * byteless (`assetHash: null`), keyed by that id. The saved drawer item is the authoritative copy (a portal
 * targets a saved entity). An unresolvable target is skipped: its portal imports as a graceful dangling link.
 * De-duped by pdf id - one entry however many portals point at it.
 */
export async function collectBoardReferencedPdfs(board: Board): Promise<Record<string, PdfDocument>> {
   const resolved: Record<string, PdfDocument> = {};

   for (const item of board.items) {
      const content = item.content;
      if (content.kind !== 'portal' || content.target.kind !== 'entity' || content.target.entity !== 'pdf') continue;

      const pdfId = content.target.id;
      if (resolved[pdfId]) continue; // already embedded via an earlier portal

      const source = await findEntityDrawerItem('pdf', pdfId);
      if (source) resolved[pdfId] = { ...(source.content as PdfDocument), assetHash: null, coverAssetHash: null };
   }

   return resolved;
}
