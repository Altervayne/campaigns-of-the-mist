/*
 * Native image drag-out guard. An `<img>` is draggable by default, so pressing on one starts the browser's
 * own picture drag before a surface's pointer gesture can arm: on the board that swallows the element move,
 * and everywhere it offers the image to another application. Cancelling `dragstart` for IMAGE targets alone
 * leaves selection drags (the text editors' own affordance) untouched, and the context menu's save-image
 * entry still works. File import is a different event chain (dragenter/dragover/drop), so it never sees this.
 */

/** True when a `dragstart` came from an image, i.e. the browser is about to drag the picture itself. */
export function isImageDragTarget(target: EventTarget | null): boolean {
   return target instanceof HTMLImageElement;
}

/** Cancels a native image drag. A `dragstart` from anything else (a text selection) passes through. */
export function preventImageDragOut(event: DragEvent): void {
   if (isImageDragTarget(event.target)) event.preventDefault();
}
