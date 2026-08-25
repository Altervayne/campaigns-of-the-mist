// -- React Imports --
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// -- Utils Imports --
import { denormalizeRect, pdfInkToStrokePaintInput, rectFromCorners } from '@/lib/pdf/annotationGeometry';
import { usePdfMarkup } from '@/lib/pdf/PdfMarkupContext';
import { HIGHLIGHT_ALPHA } from '@/lib/stores/pdfStore';

// -- Component Imports --
import { StrokeShape } from '@/components/organisms/board/items/BoardDrawingItem';

// -- Type Imports --
import type { PdfInk, PdfRect } from '@/lib/types/pdfAnnotation';

/*
 * The per-page markup surface. In read mode it renders nothing, so an unmarked reader carries no
 * interaction cost. In markup mode a transparent capture div owns the pointer gesture (touch scrolling
 * disabled so a drag draws instead of pans), while an inert SVG paints the in-progress pen stroke or
 * highlight/comment rect.
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

/** Shortest committed rect side, in box px; a smaller drag reads as a click (a stray tap, or a comment reopen). */
const MIN_RECT_SIZE = 6;

interface PdfPageInteractionLayerProps {
   pageNumber: number;
   /** The page box's UNZOOMED size in CSS px (the render width and its aspect height). */
   width: number;
   height: number;
}

export function PdfPageInteractionLayer({ pageNumber, width, height }: PdfPageInteractionLayerProps) {
   const { mode, tool, penColor, penWidth, highlightColor, commentColor, commitInk, commitHighlight, commitComment, eraseAt, commentAtPoint, openComment, select, selectAt, translateSelected, beginHistory, commitHistory } = usePdfMarkup();

   // The in-flight pen stroke's normalized points, plus its preview mirror (state so only this layer repaints).
   const pointsRef = useRef<number[] | null>(null);
   const lastScreen = useRef<{ x: number; y: number } | null>(null);
   const [preview, setPreview] = useState<number[] | null>(null);

   // The in-flight rect drag (highlight / comment): its fixed start corner (normalized) + the down client point.
   const rectStart = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
   const [rectPreview, setRectPreview] = useState<PdfRect | null>(null);

   // The in-flight select-move: the mark grabbed on pointerdown (null when the gesture hit nothing) + the last
   // client point, so each move contributes an incremental delta that sums exactly.
   const moveRef = useRef<{ lastX: number; lastY: number } | null>(null);

   if (mode !== 'markup') return null;

   const isRectTool = tool === 'highlight' || tool === 'comment';

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
         // Bracket the whole scrub as one undo step; the store changes during the drag, unlike an atomic add.
         beginHistory();
         eraseAt(pageNumber, rect, width, height, event.clientX, event.clientY);
         return;
      }
      if (tool === 'select') {
         const id = selectAt(pageNumber, rect, width, height, event.clientX, event.clientY);
         if (!id) {
            select(null);
            return;
         }
         select(id);
         // Prime a potential move; a pure click never mutates, so its commit records nothing.
         moveRef.current = { lastX: event.clientX, lastY: event.clientY };
         beginHistory();
         return;
      }
      if (isRectTool) {
         const start = normalize(rect, event.clientX, event.clientY);
         rectStart.current = { x: start.x, y: start.y, clientX: event.clientX, clientY: event.clientY };
         setRectPreview({ x: start.x, y: start.y, w: 0, h: 0 });
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
      if (tool === 'select') {
         const move = moveRef.current;
         if (!move) return;
         // Incremental delta since the last move; the store clamps per step at the page edges.
         const dnx = (event.clientX - move.lastX) / rect.width;
         const dny = (event.clientY - move.lastY) / rect.height;
         move.lastX = event.clientX;
         move.lastY = event.clientY;
         translateSelected(dnx, dny);
         return;
      }
      if (isRectTool) {
         const start = rectStart.current;
         if (!start) return;
         const end = normalize(rect, event.clientX, event.clientY);
         setRectPreview(rectFromCorners(start.x, start.y, end.x, end.y));
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
      if (tool === 'eraser') {
         // Close the scrub's checkpoint; a scrub that hit nothing changed no map, so this records no step.
         commitHistory();
         return;
      }
      if (tool === 'select') {
         // Close the move's checkpoint (only opened when the gesture grabbed a mark); a click that never moved
         // changed no annotation, so this records nothing.
         if (moveRef.current) commitHistory();
         moveRef.current = null;
         return;
      }
      if (isRectTool) {
         const start = rectStart.current;
         rectStart.current = null;
         setRectPreview(null);
         if (!start) return;
         const rect = event.currentTarget.getBoundingClientRect();
         const end = normalize(rect, event.clientX, event.clientY);
         const built = rectFromCorners(start.x, start.y, end.x, end.y);
         // A drag clearing the size floor commits a mark; a smaller gesture is a click.
         if (built.w * width >= MIN_RECT_SIZE && built.h * height >= MIN_RECT_SIZE) {
            if (tool === 'highlight') commitHighlight(pageNumber, built);
            else commitComment(pageNumber, built);
            return;
         }
         // Comment click: reopen an existing note under the down point. Other tools' below-floor clicks no-op.
         if (tool === 'comment') {
            const id = commentAtPoint(pageNumber, rect, width, height, start.clientX, start.clientY);
            if (id) openComment(id);
         }
         return;
      }
      const buffer = pointsRef.current;
      pointsRef.current = null;
      setPreview(null);
      if (!buffer || buffer.length < 4) return;
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

   // The in-flight rect, denormalized into box px; mirrors the committed highlight/comment look so it can't drift.
   const previewRect = rectPreview ? denormalizeRect(rectPreview, width, height) : null;

   return (
      <div
         className="absolute inset-0"
         style={{ touchAction: 'none', cursor: tool === 'select' ? 'default' : 'crosshair' }}
         onPointerDown={onPointerDown}
         onPointerMove={onPointerMove}
         onPointerUp={onPointerUp}
      >
         <svg className="pointer-events-none absolute inset-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
            {previewInk ? <StrokeShape stroke={pdfInkToStrokePaintInput(previewInk, width, height)} /> : null}
            {previewRect && tool === 'highlight' ? (
               <rect x={previewRect.x} y={previewRect.y} width={previewRect.w} height={previewRect.h} rx={3} fill={highlightColor} fillOpacity={HIGHLIGHT_ALPHA} />
            ) : null}
            {previewRect && tool === 'comment' ? (
               <rect x={previewRect.x} y={previewRect.y} width={previewRect.w} height={previewRect.h} rx={3} fill={commentColor} fillOpacity={0.08} stroke={commentColor} strokeOpacity={0.7} strokeWidth={1.5} />
            ) : null}
         </svg>
      </div>
   );
}
