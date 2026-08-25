// -- Utils Imports --
import { denormalizePoints, denormalizeRect } from '@/lib/pdf/annotationGeometry';

// -- Type Imports --
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';

/*
 * Pure hit-testing for the eraser: which annotations sit under a box-pixel point. Kept free of React so
 * the geometry is unit-testable. Coordinates arrive already in the page box's pixel space (the caller
 * converts the zoomed client point to the unzoomed box), so the normalized marks denormalize by the box
 * size before the distance / containment tests.
 */

/** Distance from point `(px,py)` to segment `(ax,ay)-(bx,by)`. A zero-length segment reads as its endpoint. */
export function pointToSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
   const dx = bx - ax;
   const dy = by - ay;
   const lenSq = dx * dx + dy * dy;
   if (lenSq === 0) return Math.hypot(px - ax, py - ay);
   let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
   t = Math.max(0, Math.min(1, t));
   return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** True when a box-pixel point lands within `reach` of an ink's denormalized polyline (a lone point tests as itself). */
function inkHitsPoint(boxPoints: number[], px: number, py: number, reach: number): boolean {
   const count = Math.floor(boxPoints.length / 2);
   if (count === 0) return false;
   if (count === 1) return Math.hypot(px - boxPoints[0], py - boxPoints[1]) <= reach;
   for (let i = 0; i < count - 1; i++) {
      if (pointToSegmentDistance(px, py, boxPoints[i * 2], boxPoints[i * 2 + 1], boxPoints[i * 2 + 2], boxPoints[i * 2 + 3]) <= reach) return true;
   }
   return false;
}

/**
 * The ids of every annotation under the box-pixel point `(px,py)`, topmost first (reverse of the incoming
 * paint order). An ink hits when the point falls within its inked band - half its denormalized width plus a
 * grab margin, floored at `thresholdPx`; a highlight / comment hits when the point sits inside its rect. The
 * caller removes each hit.
 */
export function annotationAtPoint(annotations: PdfAnnotation[], px: number, py: number, boxW: number, boxH: number, thresholdPx: number): string[] {
   const hits: string[] = [];
   for (let i = annotations.length - 1; i >= 0; i--) {
      const annotation = annotations[i];
      if (annotation.kind === 'ink') {
         const reach = Math.max(thresholdPx, (annotation.width * boxW) / 2 + 6);
         if (inkHitsPoint(denormalizePoints(annotation.points, boxW, boxH), px, py, reach)) hits.push(annotation.id);
      } else {
         const rect = denormalizeRect(annotation.rect, boxW, boxH);
         if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) hits.push(annotation.id);
      }
   }
   return hits;
}
