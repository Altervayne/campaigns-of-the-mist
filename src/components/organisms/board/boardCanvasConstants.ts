/*
 * Shared board-canvas helpers pulled out of BoardView so the extracted hooks and the parent read the
 * same source. Only the pieces a live seam needs live here; the rest stay in BoardView until their slice.
 */

/** True when the target is a live text field / editor, so board pointer gestures defer to it (native menu, typing). */
export function isEditableTarget(target: EventTarget | null): boolean {
   return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}
