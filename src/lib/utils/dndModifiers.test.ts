// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { restrictToParentElement, restrictToVerticalAxis } from './dndModifiers';

// -- Type Imports --
import type { ClientRect } from '@dnd-kit/core';

/*
 * A reorder list is locked to a clean vertical slide inside its box: vertical-axis kills the horizontal
 * drift, and the parent bound stops the row being dragged past the ends (which would grow the scroller).
 * Only the bits these modifiers read are built here.
 */

const args = (over: object) =>
   ({ transform: { x: 0, y: 0, scaleX: 1, scaleY: 1 }, active: null, activeNodeRect: null, draggingNodeRect: null, containerNodeRect: null, over: null, overlayNodeRect: null, scrollableAncestors: [], scrollableAncestorRects: [], windowRect: null, activatorEvent: null, ...over }) as unknown as Parameters<typeof restrictToParentElement>[0];

const rect = (top: number, height: number): ClientRect =>
   ({ top, height, bottom: top + height, left: 0, right: 0, width: 0 }) as ClientRect;

describe('restrictToVerticalAxis', () => {
   it('zeroes any horizontal movement and leaves Y untouched', () => {
      expect(restrictToVerticalAxis(args({ transform: { x: 40, y: 13, scaleX: 1, scaleY: 1 } }))).toMatchObject({ x: 0, y: 13 });
   });
});

describe('restrictToParentElement', () => {
   // A 20px-tall row sitting at the top of a 100px list.
   const container = rect(0, 100);
   const dragging = rect(0, 20);

   it('passes the transform through when rects are missing', () => {
      expect(restrictToParentElement(args({ transform: { x: 0, y: 999, scaleX: 1, scaleY: 1 } }))).toMatchObject({ y: 999 });
   });

   it('allows movement that stays inside the list', () => {
      expect(restrictToParentElement(args({ containerNodeRect: container, draggingNodeRect: dragging, transform: { x: 0, y: 30, scaleX: 1, scaleY: 1 } }))).toMatchObject({ y: 30 });
   });

   it('clamps a downward overshoot to the list bottom (no growing the scroller)', () => {
      // Row bottom is 20; list bottom is 100; the furthest it may travel is +80.
      expect(restrictToParentElement(args({ containerNodeRect: container, draggingNodeRect: dragging, transform: { x: 0, y: 500, scaleX: 1, scaleY: 1 } }))).toMatchObject({ y: 80 });
   });

   it('clamps an upward overshoot to the list top', () => {
      const lower = rect(40, 20); // a row part-way down
      expect(restrictToParentElement(args({ containerNodeRect: container, draggingNodeRect: lower, transform: { x: 0, y: -500, scaleX: 1, scaleY: 1 } }))).toMatchObject({ y: -40 });
   });
});
