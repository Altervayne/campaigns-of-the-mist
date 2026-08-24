// -- Type Imports --
import type { ZoneBoardContent } from '@/lib/types/board';

/*
 * Zone header geometry, shared by the expanded title bar, the collapsed bar, and every layout consumer
 * (the box, the snap targets, the connection re-anchor). The base heights below are the scale-1 sizes; a
 * zone's `titleScale` grows the header cohesively - the label text and the bar height scale together - so
 * the constants must never be used raw for a zone's layout. Call the helpers instead; the scaling lives here.
 */

/** The expanded title bar's base height (world units) at scale 1; the box lifts the selection toolbar above it. */
export const ZONE_TITLE_BAR_HEIGHT = 26;

/** The collapsed bar's base size (world units) at scale 1; the bar paints at the zone's origin. Width is fixed. */
export const COLLAPSED_BAR_WIDTH = 220;
export const COLLAPSED_BAR_HEIGHT = 36;

/** The label text's base font-size (world px) at scale 1. */
export const ZONE_TITLE_FONT_SIZE = 12;

/** Title-scale bounds and stepper increment. Absent `titleScale` reads as 1, so existing zones render unchanged. */
export const MIN_ZONE_TITLE_SCALE = 1;
export const MAX_ZONE_TITLE_SCALE = 3;
export const ZONE_TITLE_SCALE_STEP = 0.25;

/** Clamps a raw scale into the allowed range. */
export function clampZoneTitleScale(scale: number): number {
   return Math.max(MIN_ZONE_TITLE_SCALE, Math.min(MAX_ZONE_TITLE_SCALE, scale));
}

/** A zone's effective title scale: its stored multiplier (default 1 when absent), clamped to the bounds. */
export function zoneTitleScale(content: ZoneBoardContent): number {
   return clampZoneTitleScale(content.titleScale ?? 1);
}

/** The expanded title bar's height for this zone: base height times the title scale. */
export function zoneTitleBarHeight(content: ZoneBoardContent): number {
   return ZONE_TITLE_BAR_HEIGHT * zoneTitleScale(content);
}

/** The collapsed bar's height for this zone: base height times the title scale (width stays fixed). */
export function zoneCollapsedBarHeight(content: ZoneBoardContent): number {
   return COLLAPSED_BAR_HEIGHT * zoneTitleScale(content);
}

/** The label text's font-size for this zone: base size times the title scale. */
export function zoneTitleFontSize(content: ZoneBoardContent): number {
   return ZONE_TITLE_FONT_SIZE * zoneTitleScale(content);
}
