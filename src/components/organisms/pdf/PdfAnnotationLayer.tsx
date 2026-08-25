// -- Utils Imports --
import { denormalizeRect, pdfInkToStrokePaintInput } from '@/lib/pdf/annotationGeometry';

// -- Component Imports --
import { StrokeShape } from '@/components/organisms/board/items/BoardDrawingItem';

// -- Type Imports --
import type { PdfAnnotation, PdfHighlight, PdfInk } from '@/lib/types/pdfAnnotation';

/*
 * The per-page annotation overlay: one inert SVG covering the page box, painting the highlights and ink
 * stored for this page. Comments render in PdfCommentLayer (zone + interaction), never here. It shares the
 * box's pixel size (viewBox in box px) and rides the same CSS zoom as the canvas, so it scales in lockstep
 * and denormalizing page-space (0..1) coords by the box size is all the alignment needed. Display only -
 * pointer-events stay off. Annotation colors are user hex on white paper (content, not chrome), so raw hex
 * is correct here.
 */

/** Splits a page's annotations into the painted kinds in one pass, keeping the incoming (createdAt) order. */
function splitByKind(annotations: PdfAnnotation[]): { highlights: PdfHighlight[]; inks: PdfInk[] } {
   const highlights: PdfHighlight[] = [];
   const inks: PdfInk[] = [];
   for (const annotation of annotations) {
      if (annotation.kind === 'highlight') highlights.push(annotation);
      else if (annotation.kind === 'ink') inks.push(annotation);
   }
   return { highlights, inks };
}

interface PdfAnnotationLayerProps {
   annotations: PdfAnnotation[];
   /** The page box size in CSS px; the overlay covers it exactly. */
   width: number;
   height: number;
}

export function PdfAnnotationLayer({ annotations, width, height }: PdfAnnotationLayerProps) {
   const { highlights, inks } = splitByKind(annotations);
   return (
      <svg className="pointer-events-none absolute inset-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
         {/* Bottom band: translucent highlight fills sit under everything. */}
         {highlights.map((highlight) => {
            const rect = denormalizeRect(highlight.rect, width, height);
            return <rect key={highlight.id} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={3} fill={highlight.color} fillOpacity={highlight.alpha} />;
         })}
         {/* Ink paints through the board stroke renderer, denormalized into this box. */}
         {inks.map((ink) => (
            <StrokeShape key={ink.id} stroke={pdfInkToStrokePaintInput(ink, width, height)} />
         ))}
      </svg>
   );
}
