// -- Utils Imports --
import { annotationBounds, denormalizeRect } from '@/lib/pdf/annotationGeometry';
import { usePdfMarkup } from '@/lib/pdf/PdfMarkupContext';

// -- Type Imports --
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';

/*
 * Per-page selection + flash chrome: a dashed outline around the selected mark, and a brief pulse over a
 * comment the comments list just jumped to. Both are inert (the capture layer below owns the gesture) and
 * ride the same box-px space as the overlay, so they scale with the column's CSS zoom in lockstep. Chrome,
 * so they draw in a theme token, not the mark's own ink.
 */

/** Slack around a mark's bounds, in box px, so the outline clears the mark rather than tracing it. */
const SELECTION_PADDING = 4;

interface PdfSelectionLayerProps {
   annotations: PdfAnnotation[];
   width: number;
   height: number;
}

export function PdfSelectionLayer({ annotations, width, height }: PdfSelectionLayerProps) {
   const { selectedId, flashCommentId } = usePdfMarkup();

   const selected = selectedId ? annotations.find((annotation) => annotation.id === selectedId) : null;
   const flashed = flashCommentId ? annotations.find((annotation) => annotation.id === flashCommentId && annotation.kind === 'comment') : null;
   if (!selected && !flashed) return null;

   const selectedRect = selected ? denormalizeRect(annotationBounds(selected), width, height) : null;
   const flashRect = flashed ? denormalizeRect(annotationBounds(flashed), width, height) : null;

   return (
      <svg className="pointer-events-none absolute inset-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
         {selectedRect ? (
            <rect
               x={selectedRect.x - SELECTION_PADDING}
               y={selectedRect.y - SELECTION_PADDING}
               width={selectedRect.w + SELECTION_PADDING * 2}
               height={selectedRect.h + SELECTION_PADDING * 2}
               rx={3}
               fill="none"
               stroke="var(--primary)"
               strokeWidth={1.5}
               strokeDasharray="5 3"
            />
         ) : null}
         {flashRect ? (
            <rect
               className="cotm-annotation-flash"
               x={flashRect.x - SELECTION_PADDING}
               y={flashRect.y - SELECTION_PADDING}
               width={flashRect.w + SELECTION_PADDING * 2}
               height={flashRect.h + SELECTION_PADDING * 2}
               rx={3}
               fill="var(--primary)"
               fillOpacity={0.15}
               stroke="var(--primary)"
               strokeWidth={2}
            />
         ) : null}
      </svg>
   );
}
