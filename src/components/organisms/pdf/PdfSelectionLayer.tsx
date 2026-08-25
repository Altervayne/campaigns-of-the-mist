// -- Utils Imports --
import { annotationBounds, denormalizeRect } from '@/lib/pdf/annotationGeometry';
import { usePdfMarkup } from '@/lib/pdf/PdfMarkupContext';

// -- Type Imports --
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';

/*
 * Per-page selection chrome: a dashed outline around the selected mark when it sits on this page. Inert
 * (the capture layer below owns the gesture) and rides the same box-px space as the overlay, so it scales
 * with the column's CSS zoom in lockstep. The box is chrome, so it draws in a theme token, not the mark's
 * own ink.
 */

/** Slack around the mark's bounds, in box px, so the outline clears the mark rather than tracing it. */
const SELECTION_PADDING = 4;

interface PdfSelectionLayerProps {
   annotations: PdfAnnotation[];
   width: number;
   height: number;
}

export function PdfSelectionLayer({ annotations, width, height }: PdfSelectionLayerProps) {
   const { selectedId } = usePdfMarkup();
   if (!selectedId) return null;
   const selected = annotations.find((annotation) => annotation.id === selectedId);
   if (!selected) return null;

   const rect = denormalizeRect(annotationBounds(selected), width, height);
   return (
      <svg className="pointer-events-none absolute inset-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
         <rect
            x={rect.x - SELECTION_PADDING}
            y={rect.y - SELECTION_PADDING}
            width={rect.w + SELECTION_PADDING * 2}
            height={rect.h + SELECTION_PADDING * 2}
            rx={3}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={1.5}
            strokeDasharray="5 3"
         />
      </svg>
   );
}
