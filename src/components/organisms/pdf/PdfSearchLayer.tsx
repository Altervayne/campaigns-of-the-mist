// -- React Imports --
import { memo, useEffect, useRef, useState } from 'react';

// -- Utils Imports --
import { denormalizeRect } from '@/lib/pdf/annotationGeometry';
import { getPageTextIndex } from '@/lib/pdf/pdfPageTextIndex';
import { getTextLayerHandle, subscribeTextLayer } from '@/lib/pdf/pdfTextLayerRegistry';
import { buildFoldedItemSpans, rangeToNormalizedQuads, resolveMatchRange } from '@/lib/pdf/pdfTextRange';
import { matchToQuads } from '@/lib/pdf/textLayerGeometry';

// -- Type Imports --
import type { SearchMatch } from '@/lib/stores/pdfStore';
import type { PdfRect } from '@/lib/types/pdfAnnotation';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/*
 * The per-page search-match overlay: one inert SVG covering the page box, painting the current query's hits
 * on this page. When the page's text layer is rendered it reads the browser's own glyph rects for each match
 * (pixel-exact, zoom-free); until then, or when a span can't be placed, it falls back to the cached index's
 * interpolated per-run quads, so a hit never blank-flashes. It re-resolves when the text layer registers.
 * Quads denormalize into box px like the annotation layer and ride the same CSS zoom. Match tint is a fixed
 * orange over white paper, deliberately distinct from the user highlight (yellow) and comment (amber) fills,
 * so raw hex is correct here - a find aid, not chrome. Display only; pointer-events stay off so the text
 * layer above keeps its selection.
 */

/** Every match: a faint orange wash. */
const MATCH_FILL = '#fb923c';
const MATCH_FILL_OPACITY = 0.35;

/** The active match: a stronger fill plus a thin outline so the current hit stands out. */
const ACTIVE_FILL = '#f97316';
const ACTIVE_FILL_OPACITY = 0.55;
const ACTIVE_STROKE = '#c2410c';

/** One paint rect plus the match it came from, so the active hit is tagged by reference at render. */
interface MatchQuad {
   rect: PdfRect;
   match: SearchMatch;
}

interface PdfSearchLayerProps {
   proxy: PDFDocumentProxy;
   pageNumber: number;
   /** The page box size in CSS px; the overlay covers it exactly. */
   width: number;
   height: number;
   /** This page's matches, in reading order. */
   matches: SearchMatch[];
   /** The active match when it lands on this page, else null; painted stronger. */
   activeMatch: SearchMatch | null;
}

// Memoized like the annotation layer: during a wheel-zoom the column's CSS zoom changes but these props don't,
// so a page's match paint survives without recomputing quads.
export const PdfSearchLayer = memo(function PdfSearchLayer({ proxy, pageNumber, width, height, matches, activeMatch }: PdfSearchLayerProps) {
   const svgRef = useRef<SVGSVGElement>(null);
   const [quads, setQuads] = useState<MatchQuad[]>([]);

   // Map each match to its quads, preferring the rendered text layer's exact glyph rects and falling back to
   // the cached index's interpolation. Keyed on the match set, not the active hit (the active outline is a
   // reference check at render) and not width/zoom (normalized quads are zoom-invariant); the text-layer
   // subscription re-runs it when the layer registers or re-renders, upgrading fallback quads to exact.
   useEffect(() => {
      let cancelled = false;
      let run = 0;

      const compute = () => {
         const runId = ++run;
         void (async () => {
            let index: Awaited<ReturnType<typeof getPageTextIndex>> | null = null;
            try {
               index = await getPageTextIndex(proxy, pageNumber);
            } catch {
               // A page that fails to parse has no fallback geometry; the exact path may still resolve.
            }
            if (cancelled || runId !== run) return;
            const handle = getTextLayerHandle(proxy, pageNumber);
            const boxEl = svgRef.current;
            const foldedSpans = handle ? buildFoldedItemSpans(handle.itemsStr) : null;
            const out: MatchQuad[] = [];
            for (const match of matches) {
               let rects: PdfRect[] | null = null;
               if (handle && boxEl && foldedSpans) {
                  const range = resolveMatchRange(handle, match.start, match.length, foldedSpans);
                  if (range) rects = rangeToNormalizedQuads(range, boxEl);
               }
               if ((!rects || rects.length === 0) && index) rects = matchToQuads(index, match.start, match.length);
               if (rects) for (const rect of rects) out.push({ rect, match });
            }
            if (!cancelled && runId === run) setQuads(out);
         })();
      };

      compute();
      const unsubscribe = subscribeTextLayer(proxy, pageNumber, compute);
      return () => {
         cancelled = true;
         unsubscribe();
      };
   }, [proxy, pageNumber, matches]);

   // The SVG stays mounted (this layer only renders when the page has matches) so the exact path can measure
   // its box on the first pass, even before any quad resolves.
   return (
      <svg ref={svgRef} className="pointer-events-none absolute inset-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
         {quads.map((quad, index) => {
            const rect = denormalizeRect(quad.rect, width, height);
            const active = quad.match === activeMatch;
            return active ? (
               <rect key={index} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={2} fill={ACTIVE_FILL} fillOpacity={ACTIVE_FILL_OPACITY} stroke={ACTIVE_STROKE} strokeWidth={1.5} />
            ) : (
               <rect key={index} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={2} fill={MATCH_FILL} fillOpacity={MATCH_FILL_OPACITY} />
            );
         })}
      </svg>
   );
});
