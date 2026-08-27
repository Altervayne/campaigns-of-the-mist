// -- Pdf Library Imports --
import { foldWithMap, joinFoldedChunks } from './textLayerGeometry';

// -- Type Imports --
import type { TextLayerHandle } from './pdfTextLayerRegistry';
import type { PdfRect } from '@/lib/types/pdfAnnotation';

/*
 * Maps a folded-text match span onto the rendered text layer and reads the browser's own glyph rects for it,
 * so a search highlight sits exactly on the letters - no per-char width guessing. Reusable for v2 text
 * highlights, which need the same range -> normalized quads step. Reads live DOM, so it runs only for visible
 * pages; no pdf.js import, so `pdf-vendor` stays deferred.
 */

/** A folded-item span plus the folded->raw offset map for that item, so a match offset resolves to a text-node offset. */
export interface FoldedItemSpan {
   /** Index into the handle's `textDivs` / `itemsStr`. */
   itemIndex: number;
   foldedStart: number;
   foldedEnd: number;
   map: number[];
}

/**
 * A DOM range's glyph rects as normalized 0..1 quads within `boxEl`. Both rect sets are post-CSS-zoom, so
 * zoom cancels and no scale term is needed. Zero-area rects (an empty line boundary) are dropped.
 */
export function rangeToNormalizedQuads(range: Range, boxEl: Element): PdfRect[] {
   const box = boxEl.getBoundingClientRect();
   if (box.width <= 0 || box.height <= 0) return [];
   const quads: PdfRect[] = [];
   for (const r of range.getClientRects()) {
      if (r.width <= 0 || r.height <= 0) continue;
      quads.push({
         x: (r.left - box.left) / box.width,
         y: (r.top - box.top) / box.height,
         w: r.width / box.width,
         h: r.height / box.height,
      });
   }
   return quads;
}

/** Folds a page's item strings into the same joined spans the search index uses, carrying each item's offset map. Build once per page, reuse across matches. */
export function buildFoldedItemSpans(itemsStr: string[]): FoldedItemSpan[] {
   const folds = itemsStr.map(foldWithMap);
   const { spans } = joinFoldedChunks(folds.map((fold) => fold.folded));
   return spans.map((span) => ({
      itemIndex: span.source,
      foldedStart: span.start,
      foldedEnd: span.end,
      map: folds[span.source].map,
   }));
}

/** A resolved item plus the local folded offset within it; a separator offset clamps to the nearest item edge. */
interface Located {
   span: FoldedItemSpan;
   local: number;
}

/**
 * The item covering `offset`, with the local folded offset to use. An offset landing on an inter-item
 * separator (or past the ends) clamps to the nearest item edge: a start clamps forward to the next item's
 * first char, an end back to the previous item's last char.
 */
function locate(spans: FoldedItemSpan[], offset: number, edge: 'start' | 'end'): Located | null {
   for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      if (offset < span.foldedStart) {
         if (edge === 'start') return { span, local: 0 };
         const prev = spans[i - 1];
         return prev ? { span: prev, local: prev.foldedEnd - prev.foldedStart - 1 } : null;
      }
      if (offset < span.foldedEnd) return { span, local: offset - span.foldedStart };
   }
   if (edge === 'end') {
      const last = spans[spans.length - 1];
      return last ? { span: last, local: last.foldedEnd - last.foldedStart - 1 } : null;
   }
   return null;
}

/**
 * The DOM range covering the folded match span `[matchStart, matchStart+matchLength)` over a page's rendered
 * spans. Maps each end of the span to its item's text node and the raw offset within it. Returns null when
 * the span can't be placed (no matching item, a missing text node, an out-of-range offset), so the caller
 * falls back to interpolated geometry. Pass `spans` to reuse a page's folded index across matches.
 */
export function resolveMatchRange(handle: TextLayerHandle, matchStart: number, matchLength: number, spans?: FoldedItemSpan[]): Range | null {
   if (matchLength <= 0) return null;
   const itemSpans = spans ?? buildFoldedItemSpans(handle.itemsStr);
   const startAt = locate(itemSpans, matchStart, 'start');
   const endAt = locate(itemSpans, matchStart + matchLength - 1, 'end');
   if (!startAt || !endAt) return null;

   const startNode = handle.textDivs[startAt.span.itemIndex]?.firstChild;
   const endNode = handle.textDivs[endAt.span.itemIndex]?.firstChild;
   if (!startNode || !endNode) return null;

   const startOffset = startAt.span.map[startAt.local];
   const endBase = endAt.span.map[endAt.local];
   if (startOffset === undefined || endBase === undefined) return null;
   const endOffset = endBase + 1;

   try {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
   } catch {
      // An offset past a text node's length (a fold/raw mismatch) throws; fall back rather than paint wrong.
      return null;
   }
}
