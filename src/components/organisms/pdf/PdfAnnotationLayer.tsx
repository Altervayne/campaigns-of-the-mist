// -- Utils Imports --
import { denormalizeRect, pdfInkToStrokePaintInput } from '@/lib/pdf/annotationGeometry';

// -- Component Imports --
import { StrokeShape } from '@/components/organisms/board/items/BoardDrawingItem';

// -- Type Imports --
import type { PdfAnnotation, PdfComment, PdfHighlight, PdfInk } from '@/lib/types/pdfAnnotation';

/*
 * The per-page annotation overlay: one inert SVG covering the page box, painting the marks stored for this
 * page. It shares the box's pixel size (viewBox in box px) and rides the same CSS zoom as the canvas, so it
 * scales in lockstep and denormalizing page-space (0..1) coords by the box size is all the alignment needed.
 * Display only - pointer-events stay off; interaction lands in a later phase. Annotation colors are user hex
 * on white paper (content, not chrome), so raw hex is correct here.
 */

/** The corner marker's side, in box px, flagging a comment region as a note. */
const COMMENT_MARKER_SIZE = 12;

/** Splits a page's annotations into the three kinds in one pass, keeping the incoming (createdAt) order. */
function splitByKind(annotations: PdfAnnotation[]): { highlights: PdfHighlight[]; inks: PdfInk[]; comments: PdfComment[] } {
   const highlights: PdfHighlight[] = [];
   const inks: PdfInk[] = [];
   const comments: PdfComment[] = [];
   for (const annotation of annotations) {
      if (annotation.kind === 'highlight') highlights.push(annotation);
      else if (annotation.kind === 'ink') inks.push(annotation);
      else comments.push(annotation);
   }
   return { highlights, inks, comments };
}

interface PdfAnnotationLayerProps {
   annotations: PdfAnnotation[];
   /** The page box size in CSS px; the overlay covers it exactly. */
   width: number;
   height: number;
}

export function PdfAnnotationLayer({ annotations, width, height }: PdfAnnotationLayerProps) {
   const { highlights, inks, comments } = splitByKind(annotations);
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
         {/* Comment regions: a faint fill + outline mark the marqueed area, and a corner glyph reads as a note. */}
         {comments.map((comment) => {
            const rect = denormalizeRect(comment.rect, width, height);
            return (
               <g key={comment.id}>
                  <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={3} fill={comment.color} fillOpacity={0.08} stroke={comment.color} strokeOpacity={0.7} strokeWidth={1.5} />
                  <rect x={rect.x} y={rect.y} width={COMMENT_MARKER_SIZE} height={COMMENT_MARKER_SIZE} rx={3} fill={comment.color} />
               </g>
            );
         })}
      </svg>
   );
}
