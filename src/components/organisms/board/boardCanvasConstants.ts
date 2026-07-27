/*
 * Shared board-canvas helpers pulled out of BoardView so the extracted hooks and the parent read the
 * same source. Only the pieces a live seam needs live here; the rest stay in BoardView until their slice.
 */

// -- Type Imports --
import type { BoardItemKind } from '@/lib/types/board';

/** The kinds with a text-edit sub-state: a body click selects, then a second click (or a click on an
 *  already-selected one) promotes it to editing (focused editor). Every other kind has no editing state. */
const TEXT_EDITABLE_KINDS = new Set<BoardItemKind>(['post-it', 'journal', 'text']);
export const isTextEditableKind = (kind: BoardItemKind | undefined): boolean => kind !== undefined && TEXT_EDITABLE_KINDS.has(kind);

/** True when the target is a live text field / editor, so board pointer gestures defer to it (native menu, typing). */
export function isEditableTarget(target: EventTarget | null): boolean {
   return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** Screen-px a pointer must travel before a drag arms a move/marquee; a sub-threshold press dispatches nothing. */
export const MOVE_THRESHOLD = 5;
/** Screen-px a right-drag must travel to pan instead of opening the radial (larger so a jittery right-click still opens it). */
export const RIGHT_PAN_THRESHOLD = 8;
