// @vitest-environment jsdom

// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { isImageDragTarget, preventImageDragOut } from './imageDrag';

/*
 * The guard is deliberately narrow: images only. Widening it to every element would kill the text editors'
 * own drag-a-selection affordance, so the false cases matter as much as the true one.
 */

const dragStart = (target: EventTarget): DragEvent => {
   const event = new Event('dragstart', { bubbles: true, cancelable: true });
   Object.defineProperty(event, 'target', { value: target });
   return event as DragEvent;
};

describe('isImageDragTarget', () => {
   it('is true for an image', () => {
      expect(isImageDragTarget(document.createElement('img'))).toBe(true);
   });

   it('is false for the ordinary elements a selection drag starts from', () => {
      expect(isImageDragTarget(document.createElement('div'))).toBe(false);
      expect(isImageDragTarget(document.createElement('p'))).toBe(false);
      expect(isImageDragTarget(document.createElement('a'))).toBe(false);
   });

   it('is false for null and for a non-element target', () => {
      expect(isImageDragTarget(null)).toBe(false);
      expect(isImageDragTarget(window as unknown as EventTarget)).toBe(false);
   });
});

describe('preventImageDragOut', () => {
   it('cancels a drag that started on an image', () => {
      const event = dragStart(document.createElement('img'));
      preventImageDragOut(event);
      expect(event.defaultPrevented).toBe(true);
   });

   it('leaves a drag that started anywhere else alone', () => {
      const event = dragStart(document.createElement('div'));
      preventImageDragOut(event);
      expect(event.defaultPrevented).toBe(false);
   });
});
