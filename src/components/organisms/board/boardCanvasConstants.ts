/*
 * Shared board-canvas helpers pulled out of BoardView so the extracted hooks and the parent read the
 * same source. Only the pieces a live seam needs live here; the rest stay in BoardView until their slice.
 */

/** True when the target is a live text field / editor, so board pointer gestures defer to it (native menu, typing). */
export function isEditableTarget(target: EventTarget | null): boolean {
   return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** Screen-px a pointer must travel before a drag arms a move/marquee; a sub-threshold press dispatches nothing. */
export const MOVE_THRESHOLD = 5;
/** Screen-px a right-drag must travel to pan instead of opening the radial (larger so a jittery right-click still opens it). */
export const RIGHT_PAN_THRESHOLD = 8;
