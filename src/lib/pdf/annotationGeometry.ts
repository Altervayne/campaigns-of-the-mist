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
 * The annotation's normalized bounding box. Ink spans the min/max of its points padded by half the stroke
 * width (so the box clears the inked band); a rect kind is its own rect. Feeds move-clamping and the
 * selection outline.
 */
export function annotationBounds(annotation: PdfAnnotation): PdfRect {
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
