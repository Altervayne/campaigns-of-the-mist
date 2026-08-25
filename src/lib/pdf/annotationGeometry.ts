// -- Type Imports --
import type { StrokePaintInput } from '@/lib/board/drawingStyle';
import type { PdfAnnotation, PdfInk, PdfRect } from '@/lib/types/pdfAnnotation';

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
