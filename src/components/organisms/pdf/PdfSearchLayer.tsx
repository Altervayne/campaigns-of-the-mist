// -- React Imports --
import { memo, useEffect, useState } from 'react';

// -- Utils Imports --
import { denormalizeRect } from '@/lib/pdf/annotationGeometry';
import { getPageTextIndex } from '@/lib/pdf/pdfPageTextIndex';
import { matchToQuads } from '@/lib/pdf/textLayerGeometry';

// -- Type Imports --
import type { SearchMatch } from '@/lib/stores/pdfStore';
import type { PdfRect } from '@/lib/types/pdfAnnotation';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/*
 * The per-page search-match overlay: one inert SVG covering the page box, painting the current query's hits
 * on this page. It resolves the cached page text index (fast once built) and narrows each match span to
 * per-run quads, then denormalizes into box px like the annotation layer and rides the same CSS zoom. Match
 * tint is a fixed orange over white paper, deliberately distinct from the user highlight (yellow) and comment
 * (amber) fills, so raw hex is correct here - a find aid, not chrome. Display only; pointer-events stay off so
 * the text layer above keeps its selection.
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
   const [quads, setQuads] = useState<MatchQuad[]>([]);

   // Resolve the cached index and map each match to its quads. Keyed on the match set, not the active hit -
   // the active outline is a reference check at render, so moving it never re-runs this.
   useEffect(() => {
      let cancelled = false;
      void (async () => {
         try {
            const index = await getPageTextIndex(proxy, pageNumber);
            if (cancelled) return;
            const out: MatchQuad[] = [];
            for (const match of matches) {
               for (const rect of matchToQuads(index, match.start, match.length)) out.push({ rect, match });
            }
            setQuads(out);
         } catch {
            // A page that fails to parse paints nothing; the index cache evicts it for a later retry.
         }
      })();
      return () => {
         cancelled = true;
      };
   }, [proxy, pageNumber, matches]);

   if (quads.length === 0) return null;

   return (
      <svg className="pointer-events-none absolute inset-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
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
