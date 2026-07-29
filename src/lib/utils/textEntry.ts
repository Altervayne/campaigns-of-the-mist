/*
 * Text-entry focus test, shared by every surface that owns a bare-key shortcut or a pointer gesture: while
 * a field or rich-text editor holds focus, those handlers stand down so the keystroke or the native context
 * menu reaches the field instead.
 */

/** True when the target is a live text field or rich-text editor. */
export function isEditableTarget(target: EventTarget | null): boolean {
   return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}
