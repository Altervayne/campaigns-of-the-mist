// -- Type Imports --

/** A positioned box in world coords; the alignment math needs only these four fields. */
export interface Rect {
   x: number;
   y: number;
   width: number;
   height: number;
}

/** Which edge/center of the selection bounding box each rect's matching anchor meets. */
export type AlignEdge = 'left' | 'centerX' | 'right' | 'top' | 'middleY' | 'bottom';

/** Which axis to spread the interior items along. */
export type DistributeAxis = 'horizontal' | 'vertical';

/*
 * Pure alignment + distribution geometry for a board multi-selection. Given a map of participating rects it
 * returns a map of target top-left positions; only the axis the operation touches changes, the other stays.
 * Framework-free and deterministic - the caller owns which items participate (connections dropped, zone
 * members carried) and how the results are committed.
 */

/** The bounding box over every rect: its left/top and right/bottom extents. */
function boundingBox(rects: Rect[]): { left: number; top: number; right: number; bottom: number } {
   let left = Infinity;
   let top = Infinity;
   let right = -Infinity;
   let bottom = -Infinity;
   for (const rect of rects) {
      left = Math.min(left, rect.x);
      top = Math.min(top, rect.y);
      right = Math.max(right, rect.x + rect.width);
      bottom = Math.max(bottom, rect.y + rect.height);
   }
   return { left, top, right, bottom };
}

/**
 * Moves each rect so its matching anchor meets the selection bbox anchor (left->bbox left, centerX->bbox
 * center, and so on). Only the relevant axis moves; the other coordinate is returned unchanged.
 */
export function alignPositions(rects: Record<string, Rect>, edge: AlignEdge): Record<string, { x: number; y: number }> {
   const entries = Object.entries(rects);
   const box = boundingBox(entries.map(([, rect]) => rect));
   const centerX = (box.left + box.right) / 2;
   const centerY = (box.top + box.bottom) / 2;

   const positions: Record<string, { x: number; y: number }> = {};
   for (const [id, rect] of entries) {
      let { x, y } = rect;
      switch (edge) {
         case 'left': x = box.left; break;
         case 'centerX': x = centerX - rect.width / 2; break;
         case 'right': x = box.right - rect.width; break;
         case 'top': y = box.top; break;
         case 'middleY': y = centerY - rect.height / 2; break;
         case 'bottom': y = box.bottom - rect.height; break;
      }
      positions[id] = { x, y };
   }
   return positions;
}

/**
 * Spreads the interior rects so the visible gaps between adjacent edges are equal, holding the two extremes
 * fixed. The free space is the extremes' span minus the summed sizes, split evenly across the (n-1) gaps;
 * the rects lay out in order from the first extreme. Fewer than 3 rects is a no-op (positions unchanged).
 */
export function distributePositions(rects: Record<string, Rect>, axis: DistributeAxis): Record<string, { x: number; y: number }> {
   const entries = Object.entries(rects);
   const positions: Record<string, { x: number; y: number }> = {};
   for (const [id, rect] of entries) positions[id] = { x: rect.x, y: rect.y };
   if (entries.length < 3) return positions;

   const horizontal = axis === 'horizontal';
   const start = (rect: Rect) => (horizontal ? rect.x : rect.y);
   const size = (rect: Rect) => (horizontal ? rect.width : rect.height);

   // Sort by axis position; id breaks ties so equal starts stay deterministic.
   const ordered = [...entries].sort(([idA, a], [idB, b]) => start(a) - start(b) || (idA < idB ? -1 : idA > idB ? 1 : 0));

   const first = ordered[0][1];
   const last = ordered[ordered.length - 1][1];
   const totalSize = ordered.reduce((sum, [, rect]) => sum + size(rect), 0);
   const gap = (start(last) + size(last) - start(first) - totalSize) / (ordered.length - 1);

   // The first extreme holds; each following rect starts a gap past the previous one's trailing edge, so the
   // last rect lands back on its own start.
   let cursor = start(first);
   for (const [id, rect] of ordered) {
      positions[id] = horizontal ? { x: cursor, y: rect.y } : { x: rect.x, y: cursor };
      cursor += size(rect) + gap;
   }
   return positions;
}
