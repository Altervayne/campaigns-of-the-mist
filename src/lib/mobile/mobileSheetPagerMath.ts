/*
 * Pure geometry for the mobile sheet pager: the horizontal-dominance gate that decides when a drag is a
 * page (vs a vertical scroll), and the release resolver that maps a drag's distance + flick velocity to a
 * settled page. Kept side-effect-free so the gesture hook stays a thin binding over touch events + motion.
 */

/** A drag is a page only once its horizontal travel clearly dominates its vertical travel. */
export const PAGER_HORIZONTAL_DOMINANCE = 1.5;

/** Travel (px, either axis) before a pending gesture locks to an axis. Small, so paging engages promptly. */
export const PAGER_ACTIVATION_DISTANCE = 10;

/** Release travel (px) that commits a one-page step even without a flick. */
export const PAGER_SETTLE_DISTANCE = 50;

/** Release velocity (px/ms) that commits a one-page step even under {@link PAGER_SETTLE_DISTANCE}. */
export const PAGER_FLICK_VELOCITY = 0.4;

/** Fraction of finger travel applied past a boundary (page 0 back, last page forward), for the rubber-band. */
export const PAGER_RUBBER_BAND = 0.35;

/** True once a drag has cleared the activation distance horizontally with horizontal dominance. */
export function isHorizontalPagerDrag(deltaX: number, deltaY: number): boolean {
   return Math.abs(deltaX) >= PAGER_ACTIVATION_DISTANCE && Math.abs(deltaX) >= PAGER_HORIZONTAL_DOMINANCE * Math.abs(deltaY);
}

/** True once a drag has cleared the activation distance and is not horizontally dominant (yield to native scroll). */
export function isVerticalPagerDrag(deltaX: number, deltaY: number): boolean {
   return Math.abs(deltaY) >= PAGER_ACTIVATION_DISTANCE && !isHorizontalPagerDrag(deltaX, deltaY);
}

/**
 * The settled page after a release: one step in the drag's direction when it clears the distance threshold
 * OR flicks past the velocity threshold, else the page it started on. Clamped to `[0, lastPage]`.
 *
 * @param currentPage - The page the drag started from.
 * @param deltaX - Total horizontal travel (px; negative = toward the next page).
 * @param velocity - Release velocity (px/ms; negative = toward the next page).
 * @param lastPage - The highest valid page index.
 */
export function resolvePagerSettle({ currentPage, deltaX, velocity, lastPage }: { currentPage: number; deltaX: number; velocity: number; lastPage: number }): number {
   let target = currentPage;
   if (deltaX <= -PAGER_SETTLE_DISTANCE || velocity <= -PAGER_FLICK_VELOCITY) target = currentPage + 1;
   else if (deltaX >= PAGER_SETTLE_DISTANCE || velocity >= PAGER_FLICK_VELOCITY) target = currentPage - 1;
   return Math.max(0, Math.min(lastPage, target));
}

/**
 * The finger-tracked track offset applied during a drag, with a rubber-band past either boundary. `deltaX`
 * is the (zoom-corrected) travel from the drag's start; `baseX` is the track offset at drag start.
 */
export function resolvePagerDragOffset({ baseX, deltaX, startPage, lastPage }: { baseX: number; deltaX: number; startPage: number; lastPage: number }): number {
   const pastStart = startPage <= 0 && deltaX > 0;
   const pastEnd = startPage >= lastPage && deltaX < 0;
   return baseX + (pastStart || pastEnd ? deltaX * PAGER_RUBBER_BAND : deltaX);
}

/**
 * The resting track offset for a page, in px, or `null` when the page pitch is not yet measurable. Prefers a
 * live-measured width over a cached fallback so a jump can never resolve against a stale/zero cache; a `null`
 * result tells the caller to defer (and not advance its displayed-page marker) until a width is known.
 */
export function resolvePageTrackOffset({ page, liveWidth, fallbackWidth }: { page: number; liveWidth: number; fallbackWidth: number }): number | null {
   const width = liveWidth || fallbackWidth;
   if (!width) return null;
   const offset = -page * width;
   return offset === 0 ? 0 : offset; // normalize page 0's -0 to +0
}
