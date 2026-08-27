// -- Type Imports --
import type { StrokePaintInput } from '@/lib/board/drawingStyle';
import type { PdfAnnotation, PdfAnnotationVisibility, PdfComment, PdfInk, PdfRect } from '@/lib/types/pdfAnnotation';

/*
 * Pure geometry for the annotation overlay: it buckets annotations per page and denormalizes page-space
 * (0..1) coordinates into a page box's pixel space. Kept free of React so the math is unit-testable and the
 * overlay just paints what these return. Ink feeds the board stroke renderer via a StrokePaintInput.
 */

/** Buckets annotations by their 1-based `page`, each bucket sorted by `createdAt` ascending for a stable paint order. */
export function groupAnnotationsByPage(annotations: Record<string, PdfAnnotation> | undefined): Map<number, PdfAnnotation[]> {
   const byPage = new Map<number, PdfAnnotation[]>();
   if (!annotations) return byPage;
   for (const annotation of Object.values(annotations)) {
      const bucket = byPage.get(annotation.page);
      if (bucket) bucket.push(annotation);
      else byPage.set(annotation.page, [annotation]);
   }
   for (const bucket of byPage.values()) bucket.sort((a, b) => a.createdAt - b.createdAt);
   return byPage;
}

/**
 * Every comment across the document, ordered for the comments list: page ascending, then top-to-bottom,
 * then left-to-right by the region's origin. Tolerates an absent map (returns empty).
 */
export function listComments(annotations: Record<string, PdfAnnotation> | undefined): PdfComment[] {
   if (!annotations) return [];
   const comments = Object.values(annotations).filter((mark): mark is PdfComment => mark.kind === 'comment');
   comments.sort((a, b) => a.page - b.page || a.rect.y - b.rect.y || a.rect.x - b.rect.x);
   return comments;
}

/** Whether an annotation's kind is currently shown. */
export function isAnnotationVisible(annotation: PdfAnnotation, visibility: PdfAnnotationVisibility): boolean {
   return visibility[annotation.kind];
}

/** Keeps only the annotations whose kind is visible; passes an absent map through untouched. */
export function filterVisibleAnnotations(
   annotations: Record<string, PdfAnnotation> | undefined,
   visibility: PdfAnnotationVisibility,
): Record<string, PdfAnnotation> | undefined {
   if (!annotations) return annotations;
   const out: Record<string, PdfAnnotation> = {};
   for (const [id, annotation] of Object.entries(annotations)) {
      if (visibility[annotation.kind]) out[id] = annotation;
   }
   return out;
}

/** Maps a flat `[x0,y0,...]` normalized point list into box pixels: even indices by width, odd by height. */
export function denormalizePoints(points: number[], w: number, h: number): number[] {
   const out = new Array<number>(points.length);
   for (let i = 0; i < points.length; i++) out[i] = points[i] * (i % 2 === 0 ? w : h);
   return out;
}

/** Maps a normalized page-space rect into box pixels. */
export function denormalizeRect(rect: PdfRect, w: number, h: number): { x: number; y: number; w: number; h: number } {
   return { x: rect.x * w, y: rect.y * h, w: rect.w * w, h: rect.h * h };
}

/** Builds a normalized rect from two opposite corners, ordering the edges so width/height are non-negative. */
export function rectFromCorners(ax: number, ay: number, bx: number, by: number): PdfRect {
   return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/** The union bounding box of a quad list (min origin, max far corner); a zero box for an empty list. */
function quadsBounds(quads: PdfRect[]): PdfRect {
   if (quads.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
   let minX = quads[0].x;
   let minY = quads[0].y;
   let maxX = quads[0].x + quads[0].w;
   let maxY = quads[0].y + quads[0].h;
   for (let i = 1; i < quads.length; i++) {
      minX = Math.min(minX, quads[i].x);
      minY = Math.min(minY, quads[i].y);
      maxX = Math.max(maxX, quads[i].x + quads[i].w);
      maxY = Math.max(maxY, quads[i].y + quads[i].h);
   }
   return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * The annotation's normalized bounding box. Ink spans the min/max of its points padded by half the stroke
 * width (so the box clears the inked band); a text highlight is the union of its quads; a rect kind is its
 * own rect. Feeds move-clamping and the selection outline.
 */
export function annotationBounds(annotation: PdfAnnotation): PdfRect {
   if (annotation.kind === 'textHighlight') return quadsBounds(annotation.quads);
   if (annotation.kind !== 'ink') return annotation.rect;
   const { points, width } = annotation;
   if (points.length < 2) return { x: 0, y: 0, w: 0, h: 0 };
   let minX = points[0];
   let maxX = points[0];
   let minY = points[1];
   let maxY = points[1];
   for (let i = 2; i < points.length; i += 2) {
      minX = Math.min(minX, points[i]);
      maxX = Math.max(maxX, points[i]);
      minY = Math.min(minY, points[i + 1]);
      maxY = Math.max(maxY, points[i + 1]);
   }
   const pad = width / 2;
   return { x: minX - pad, y: minY - pad, w: maxX - minX + width, h: maxY - minY + width };
}

/** Clamps a normalized translation so a bounds box stays within the page `[0,1]` on both axes. */
export function clampTranslation(bounds: PdfRect, dnx: number, dny: number): { dx: number; dy: number } {
   // `+ 0` folds a clamped `-0` (bounds flush against the origin) back to `0`, so a no-move step reads as zero.
   const dx = Math.max(-bounds.x, Math.min(1 - (bounds.x + bounds.w), dnx)) + 0;
   const dy = Math.max(-bounds.y, Math.min(1 - (bounds.y + bounds.h), dny)) + 0;
   return { dx, dy };
}

/** Shifts a flat `[x0,y0,...]` point list by a normalized delta: even indices by `dx`, odd by `dy`. */
export function translatePoints(points: number[], dx: number, dy: number): number[] {
   const out = new Array<number>(points.length);
   for (let i = 0; i < points.length; i++) out[i] = points[i] + (i % 2 === 0 ? dx : dy);
   return out;
}

/** Shifts a rect's origin by a normalized delta. */
export function translateRect(rect: PdfRect, dx: number, dy: number): PdfRect {
   return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

/** The 8 resize handles of a rect selection box: corners plus edge midpoints, compass-named. */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Slack around a mark's bounds, in box px, so the selection outline (and its handles) clear the mark. */
export const SELECTION_PADDING = 4;

/** The 8 handle centers in box px, on the padded selection box around `bounds`. Corners + edge midpoints. */
export function resizeHandlePositions(bounds: PdfRect, w: number, h: number): Record<ResizeHandle, { x: number; y: number }> {
   const box = denormalizeRect(bounds, w, h);
   const left = box.x - SELECTION_PADDING;
   const right = box.x + box.w + SELECTION_PADDING;
   const top = box.y - SELECTION_PADDING;
   const bottom = box.y + box.h + SELECTION_PADDING;
   const midX = box.x + box.w / 2;
   const midY = box.y + box.h / 2;
   return {
      nw: { x: left, y: top },
      n: { x: midX, y: top },
      ne: { x: right, y: top },
      e: { x: right, y: midY },
      se: { x: right, y: bottom },
      s: { x: midX, y: bottom },
      sw: { x: left, y: bottom },
      w: { x: left, y: midY },
   };
}

/** The handle whose center is within `tolerancePx` of a box-px point (nearest wins), or null. */
export function resizeHandleAtPoint(bounds: PdfRect, w: number, h: number, px: number, py: number, tolerancePx: number): ResizeHandle | null {
   const positions = resizeHandlePositions(bounds, w, h);
   let best: ResizeHandle | null = null;
   let bestDist = tolerancePx;
   for (const [handle, pos] of Object.entries(positions) as [ResizeHandle, { x: number; y: number }][]) {
      const dist = Math.hypot(px - pos.x, py - pos.y);
      if (dist <= bestDist) {
         bestDist = dist;
         best = handle;
      }
   }
   return best;
}

/** Holds an edge at least `min` from its anchor (a flip past the anchor snaps to the far side), on the page. */
function clampResizeEdge(edge: number, anchor: number, min: number): number {
   const kept = edge >= anchor ? Math.max(edge, anchor + min) : Math.min(edge, anchor - min);
   return Math.min(Math.max(kept, 0), 1);
}

/**
 * Reshapes a rect by dragging one handle: the handle's edge(s) shift by the normalized delta while the
 * opposite edge anchors. Width/height stay positive (a drag past the anchor flips cleanly), the rect holds a
 * minimum size, and every edge stays within the page `[0,1]`.
 */
export function resizeRect(rect: PdfRect, handle: ResizeHandle, dnx: number, dny: number, minNorm: { w: number; h: number }): PdfRect {
   const left = rect.x;
   const right = rect.x + rect.w;
   const top = rect.y;
   const bottom = rect.y + rect.h;
   let { x, y, w, h } = rect;
   const movesW = handle === 'nw' || handle === 'w' || handle === 'sw';
   const movesE = handle === 'ne' || handle === 'e' || handle === 'se';
   const movesN = handle === 'nw' || handle === 'n' || handle === 'ne';
   const movesS = handle === 'sw' || handle === 's' || handle === 'se';
   if (movesW) {
      const edge = clampResizeEdge(left + dnx, right, minNorm.w);
      x = Math.min(edge, right);
      w = Math.abs(right - edge);
   } else if (movesE) {
      const edge = clampResizeEdge(right + dnx, left, minNorm.w);
      x = Math.min(left, edge);
      w = Math.abs(edge - left);
   }
   if (movesN) {
      const edge = clampResizeEdge(top + dny, bottom, minNorm.h);
      y = Math.min(edge, bottom);
      h = Math.abs(bottom - edge);
   } else if (movesS) {
      const edge = clampResizeEdge(bottom + dny, top, minNorm.h);
      y = Math.min(top, edge);
      h = Math.abs(edge - top);
   }
   return { x, y, w, h };
}

/**
 * Resolves a PDF ink to the board stroke renderer's paint input in box-pixel space. `width` is a page-width
 * fraction, so it scales by the box width; the hex `color` passes straight through (never the board's adaptive
 * null). A freehand pen: no `shape`, so `strokePaint` builds the smoothed stroked path.
 */
export function pdfInkToStrokePaintInput(ink: PdfInk, w: number, h: number): StrokePaintInput {
   return {
      brush: ink.brush ?? 'pen',
      color: ink.color,
      width: ink.width * w,
      points: denormalizePoints(ink.points, w, h),
      shape: undefined,
      filled: undefined,
   };
}
