// -- Type Imports --
import type { BoardItem } from '@/lib/types/board';
import type { Rect } from '@/lib/board/boardSnapping';

// -- Function Imports --
import { EXPANDED_CARD_SIZE } from '@/lib/board/embedDrawerItem';
import { isExpandedCardItem } from '@/lib/board/expandedCardItem';
import { COLLAPSED_BAR_WIDTH, zoneCollapsedBarHeight } from '@/lib/board/zoneHeader';

/*
 * The rect an item actually RENDERS at, for snapping. Most kinds render at their stored rect - content-driven
 * fit/min kinds sync their stored size to the measured content, so it already matches. Two kinds override the
 * stored rect with a fixed footprint it never tracks: an expanded card copy (its landscape sheet) and a
 * collapsed zone (its title bar). Snapping to the stored rect there put the edges/center in the wrong place -
 * an expanded card's center landed at the far left of the sheet.
 */
export function effectiveSnapRect(item: BoardItem): Rect {
   if (isExpandedCardItem(item)) return { x: item.x, y: item.y, width: EXPANDED_CARD_SIZE.width, height: EXPANDED_CARD_SIZE.height };
   if (item.content.kind === 'zone' && item.content.collapsed) return { x: item.x, y: item.y, width: COLLAPSED_BAR_WIDTH, height: zoneCollapsedBarHeight(item.content) };
   return { x: item.x, y: item.y, width: item.width, height: item.height };
}
