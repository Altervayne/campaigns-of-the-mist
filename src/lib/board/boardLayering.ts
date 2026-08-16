/*
 * Z-index bands for the board's world layer. Items render in ONE stable pass (never split by
 * selection), so selecting one only changes its z-index - its React instance is preserved, so the
 * editing surface is never torn down (edits commit) and images don't reload. Paint order is decided
 * here by explicit z-index, not DOM order.
 *
 * For N non-connection items, ranked 0..N-1 by the scope-relative tree flatten (see `boardTree`):
 *   1 .. N        unselected item boxes (1 + rank)
 *   N + 1         the connection layer (lines + selected-line toolbar)
 *   N+2 .. 2N+1   selected item boxes (N + 2 + rank)
 *   2N + 2        the group toolbar                          - above everything
 *
 * The bands are disjoint by construction for any N, so a selected item ALWAYS sits above the
 * connection layer and above every unselected item, whatever the rank - it's bulletproof, not tuned.
 * Within a band the flatten order is preserved (via rank). A zone carries no special back layer: it
 * ranks like any item at its band floor, so its tint sits behind its OWN members (which the flatten
 * bands right above it), not universally behind everything. Selecting a zone is the one break from the
 * band rule: it keeps its unselected rank rather than jumping to the selected band, so its members stay
 * on top and clickable (see `itemZIndex`).
 */

/**
 * An item box's z-index, from its rank (index in the flatten order) and whether it is selected. A ZONE is
 * the exception: selecting it must NOT lift it above its own members (they sit inside it and would become
 * unclickable), so a selected zone keeps its unselected rank, staying behind the members that flatten right
 * above it. Its selection chrome still reads: the outline on the frame edges, the toolbar in the overlay layer.
 */
export function itemZIndex(rank: number, selected: boolean, n: number, isZone = false): number {
   return selected && !isZone ? n + 2 + rank : 1 + rank;
}

/** The connection layer's z-index: strictly above every unselected item, below every selected one. */
export function connectionsZIndex(n: number): number {
   return n + 1;
}

/** The multi-selection group toolbar's z-index: above the whole selected band. */
export function groupToolbarZIndex(n: number): number {
   return 2 * n + 2;
}
