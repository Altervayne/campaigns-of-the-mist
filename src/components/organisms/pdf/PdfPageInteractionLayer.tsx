// -- React Imports --
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// -- Utils Imports --
import { pdfInkToStrokePaintInput } from '@/lib/pdf/annotationGeometry';
import { usePdfMarkup } from '@/lib/pdf/PdfMarkupContext';

// -- Component Imports --
import { StrokeShape } from '@/components/organisms/board/items/BoardDrawingItem';

// -- Type Imports --
import type { PdfInk } from '@/lib/types/pdfAnnotation';

/*
 * The per-page markup surface. In read mode it renders nothing, so an unmarked reader carries no
 * interaction cost. In markup mode a transparent capture div owns the pointer gesture (touch scrolling
 * disabled so a drag draws instead of pans), while an inert SVG paints the in-progress pen stroke.
 *
 * Coordinates are zoom-invariant: a client point normalizes against the div's live bounding rect (which
 * already reflects the column's CSS zoom), so the stored 0..1 page-space points cancel every zoom. The
 * live preview denormalizes back through the UNZOOMED box size (the `width`/`height` props), matching the
 * SVG's viewBox; the CSS zoom then scales the whole overlay in lockstep with the page.
 */

/** Min on-screen travel between captured pen samples, px - keeps a stroke from ballooning into a huge point list. */
const MIN_SAMPLE_DISTANCE = 2;

/** Shortest committed pen stroke, in box px; a shorter gesture is a stray tap and is dropped. */
const MIN_STROKE_LENGTH = 4;

interface PdfPageInteractionLayerProps {
   pageNumber: number;
   /** The page box's UNZOOMED size in CSS px (the render width and its aspect height). */
   width: number;
   height: number;
}

export function PdfPageInteractionLayer({ pageNumber, width, height }: PdfPageInteractionLayerProps) {
   const { mode, tool, penColor, penWidth, commitInk, eraseAt } = usePdfMarkup();

   // The in-flight pen stroke's normalized points, plus its preview mirror (state so only this layer repaints).
   const pointsRef = useRef<number[] | null>(null);
   const lastScreen = useRef<{ x: number; y: number } | null>(null);
   const [preview, setPreview] = useState<number[] | null>(null);

   if (mode !== 'markup') return null;

   /** Normalizes a client point to page space against the div's live (zoomed) rect, clamped to the page. */
   const normalize = (rect: DOMRect, clientX: number, clientY: number) => ({
      x: Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1),
   });

   /** True once the pointer has travelled the sample floor since the last captured point. */
   const movedEnough = (clientX: number, clientY: number) => {
      const last = lastScreen.current;
      return !last || Math.hypot(clientX - last.x, clientY - last.y) >= MIN_SAMPLE_DISTANCE;
   };

   const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.setPointerCapture(event.pointerId);
      lastScreen.current = { x: event.clientX, y: event.clientY };
      if (tool === 'eraser') {
         eraseAt(pageNumber, rect, width, height, event.clientX, event.clientY);
         return;
      }
      const point = normalize(rect, event.clientX, event.clientY);
      pointsRef.current = [point.x, point.y];
      setPreview([point.x, point.y]);
   };

   const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!movedEnough(event.clientX, event.clientY)) return;
      lastScreen.current = { x: event.clientX, y: event.clientY };
      const rect = event.currentTarget.getBoundingClientRect();
      if (tool === 'eraser') {
         eraseAt(pageNumber, rect, width, height, event.clientX, event.clientY);
         return;
      }
      const buffer = pointsRef.current;
      if (!buffer) return;
      const point = normalize(rect, event.clientX, event.clientY);
      buffer.push(point.x, point.y);
      setPreview([...buffer]);
   };

   const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      lastScreen.current = null;
      const buffer = pointsRef.current;
      pointsRef.current = null;
      setPreview(null);
      if (tool === 'eraser' || !buffer || buffer.length < 4) return;
      // Drop a near-stationary gesture (a stray dot): its denormalized path must clear the length floor.
      let length = 0;
      for (let i = 0; i < buffer.length - 2; i += 2) {
         length += Math.hypot((buffer[i + 2] - buffer[i]) * width, (buffer[i + 3] - buffer[i + 1]) * height);
      }
      if (length < MIN_STROKE_LENGTH) return;
      commitInk(pageNumber, buffer, penWidth / width);
   };

   // A transient ink for the live preview, painted through the same board renderer as the committed marks.
   const previewInk: PdfInk | null = preview
      ? { kind: 'ink', id: 'preview', page: pageNumber, color: penColor, createdAt: 0, points: preview, width: penWidth / width, brush: 'pen' }
      : null;

   return (
      <div
         className="absolute inset-0"
         style={{ touchAction: 'none', cursor: 'crosshair' }}
         onPointerDown={onPointerDown}
         onPointerMove={onPointerMove}
         onPointerUp={onPointerUp}
      >
         <svg className="pointer-events-none absolute inset-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
            {previewInk ? <StrokeShape stroke={pdfInkToStrokePaintInput(previewInk, width, height)} /> : null}
         </svg>
      </div>
   );
}
