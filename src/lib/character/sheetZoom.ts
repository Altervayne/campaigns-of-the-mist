/*
 * Character-sheet zoom: a plain content scale for a desktop sheet tab, remembered per
 * tab (a character is open in exactly one tab, so per-tab == per-character). Stepped
 * through "nice" levels to keep the scaled sheet on whole pixels, so text never blurs.
 */

/** The clamped zoom range for a character sheet. */
export const SHEET_MIN_ZOOM = 0.5;
export const SHEET_MAX_ZOOM = 2;

/** The default (unzoomed) factor. */
export const DEFAULT_SHEET_ZOOM = 1;

/** The discrete zoom stops the control and shortcuts step through. */
export const SHEET_ZOOM_LEVELS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

/** Clamps a zoom value into {@link SHEET_MIN_ZOOM}..{@link SHEET_MAX_ZOOM} (a bad value falls back to 1). */
export function clampSheetZoom(zoom: number): number {
   if (!Number.isFinite(zoom)) return DEFAULT_SHEET_ZOOM;
   return Math.min(SHEET_MAX_ZOOM, Math.max(SHEET_MIN_ZOOM, zoom));
}

/**
 * Steps the zoom to the next stop (`dir` +1 zooms in, -1 zooms out), clamped at the ends.
 * Snaps `current` to its nearest stop first, so an off-level value still steps predictably.
 */
export function stepSheetZoom(current: number, dir: 1 | -1): number {
   const clamped = clampSheetZoom(current);
   let nearest = 0;
   for (let i = 1; i < SHEET_ZOOM_LEVELS.length; i++) {
      if (Math.abs(SHEET_ZOOM_LEVELS[i] - clamped) < Math.abs(SHEET_ZOOM_LEVELS[nearest] - clamped)) nearest = i;
   }
   const next = Math.min(SHEET_ZOOM_LEVELS.length - 1, Math.max(0, nearest + dir));
   return SHEET_ZOOM_LEVELS[next];
}

/**
 * True for a drag item that came off the sheet. A sheet-sourced card/tracker/journal renders in the
 * zoom layer; match its on-screen size so the clone isn't a mismatched 100%. Drawer items (unscaled)
 * keep scale 1. The shapes are duck-typed, so a new sheet-sourced item kind must be added here too.
 */
export function isSheetScaledDragItem(item: object | null): boolean {
   return !!item && ('cardType' in item || 'trackerType' in item || ('pages' in item && 'bookmarks' in item));
}
