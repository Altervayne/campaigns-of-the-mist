// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

// -- Local Imports --
import { useImageDragGuard } from './useImageDragGuard';
import { useFileDrop } from './useFileDrop';

// -- Type Imports --
import type { DragEvent as ReactDragEvent } from 'react';

/*
 * The wiring, not the predicate: an image anywhere in the document must reach the window listener, which is
 * the whole point of one delegated guard over a `draggable={false}` per `<img>`. The second block pins the
 * boundary that makes the guard safe - file IMPORT rides dragenter/dragover/drop, a chain the guard never
 * touches - because breaking drag-and-drop import would be a worse bug than the one this fixes.
 */

/** A cancelable, bubbling drag event. jsdom has no DragEvent/DataTransfer, so `dataTransfer` is attached by hand. */
const dragEvent = (type: string, dataTransfer?: unknown): Event => {
   const event = new Event(type, { bubbles: true, cancelable: true });
   if (dataTransfer) Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
   return event;
};

/** A board-like nesting, so the assertion is about bubbling rather than a listener on the image itself. */
const mountImage = (): HTMLImageElement => {
   const surface = document.createElement('div');
   const box = document.createElement('div');
   const image = document.createElement('img');
   box.appendChild(image);
   surface.appendChild(box);
   document.body.appendChild(surface);
   return image;
};

afterEach(() => {
   cleanup();
   document.body.innerHTML = '';
});

describe('useImageDragGuard', () => {
   it('cancels a native drag starting on an image nested inside a surface', () => {
      renderHook(() => useImageDragGuard());
      const event = dragEvent('dragstart');
      mountImage().dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
   });

   it('leaves a drag starting on a non-image alone, so a text selection still drags', () => {
      renderHook(() => useImageDragGuard());
      const paragraph = document.createElement('p');
      document.body.appendChild(paragraph);
      const event = dragEvent('dragstart');
      paragraph.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
   });

   it('removes the listener on unmount', () => {
      const { unmount } = renderHook(() => useImageDragGuard());
      unmount();
      const event = dragEvent('dragstart');
      mountImage().dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
   });
});

describe('useImageDragGuard alongside the file-drop root', () => {
   it('leaves an external file drop working end to end', () => {
      const onFiles = vi.fn();
      const { result } = renderHook(() => {
         useImageDragGuard();
         return useFileDrop({ onFiles, accept: '.cotm' });
      });

      // The root's handlers as the workspace wires them, on a real node the guard also sees.
      const root = document.createElement('div');
      document.body.appendChild(root);
      const props = result.current.getRootProps();
      const feed = (handler: (event: ReactDragEvent<HTMLElement>) => void) =>
         (event: Event) => handler(event as unknown as ReactDragEvent<HTMLElement>);
      root.addEventListener('dragenter', feed(props.onDragEnter));
      root.addEventListener('dragover', feed(props.onDragOver));
      root.addEventListener('drop', feed(props.onDrop));

      const dataTransfer = { files: [{ name: 'hero.cotm' } as File], dropEffect: '' };
      act(() => { root.dispatchEvent(dragEvent('dragenter', dataTransfer)); });
      expect(result.current.isDragActive).toBe(true);

      // The mandatory one: an unprevented dragover makes the browser navigate to the file instead of dropping.
      const over = dragEvent('dragover', dataTransfer);
      act(() => { root.dispatchEvent(over); });
      expect(over.defaultPrevented).toBe(true);

      act(() => { root.dispatchEvent(dragEvent('drop', dataTransfer)); });
      expect(onFiles).toHaveBeenCalledWith([{ name: 'hero.cotm' }]);
      expect(result.current.isDragActive).toBe(false);
   });
});
