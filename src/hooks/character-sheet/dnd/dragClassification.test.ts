// -- Testing Imports --
import { describe, it, expect } from 'vitest';

// -- Utils Imports --
import { classifyDrag, drawerDropFolderId } from './dragClassification';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Type Imports --
import type { DragOverEvent, DragStartEvent } from '@dnd-kit/core';

/** A minimal `over` descriptor: only `data.current` is read by the resolver. */
function makeOver(data?: Record<string, unknown>): NonNullable<DragOverEvent['over']> {
   return { data: { current: data } } as unknown as NonNullable<DragOverEvent['over']>;
}

/** A minimal `active` descriptor: only `data.current` is read by the classifier. */
function makeActive(data?: Record<string, unknown>): DragStartEvent['active'] {
   return { data: { current: data } } as unknown as DragStartEvent['active'];
}

describe('classifyDrag', () => {
   it('classifies a tab drag', () => {
      expect(classifyDrag(makeActive({ type: DRAG_TYPES.TAB }))).toBe('tab');
   });

   it('classifies a drawer folder drag', () => {
      expect(classifyDrag(makeActive({ type: DRAG_TYPES.DRAWER_FOLDER }))).toBe('drawer-folder');
   });

   it('classifies a full-sheet drawer item as a character drag', () => {
      expect(classifyDrag(makeActive({ type: DRAG_TYPES.DRAWER_ITEM, item: { type: 'FULL_CHARACTER_SHEET' } }))).toBe('drawer-character');
   });

   it('classifies any other drawer item as a component drag', () => {
      expect(classifyDrag(makeActive({ type: DRAG_TYPES.DRAWER_ITEM, item: { type: 'CARD' } }))).toBe('drawer-component');
      expect(classifyDrag(makeActive({ type: DRAG_TYPES.DRAWER_ITEM }))).toBe('drawer-component');
   });

   it('classifies every sheet-prefixed type as a sheet-item drag', () => {
      expect(classifyDrag(makeActive({ type: DRAG_TYPES.SHEET_CARD }))).toBe('sheet-item');
      expect(classifyDrag(makeActive({ type: DRAG_TYPES.SHEET_TRACKER }))).toBe('sheet-item');
      expect(classifyDrag(makeActive({ type: DRAG_TYPES.SHEET_JOURNAL }))).toBe('sheet-item');
   });

   it('returns null for an unrecognised source', () => {
      expect(classifyDrag(makeActive({ type: 'board-item' }))).toBeNull();
      expect(classifyDrag(makeActive())).toBeNull();
   });
});

describe('drawerDropFolderId', () => {
   it('routes a folder-row drop into that folder', () => {
      expect(drawerDropFolderId('folder-123', 'drawer-folder', makeOver())).toBe('folder-123');
   });

   it('routes a folder items drop-zone into that folder', () => {
      expect(drawerDropFolderId('drawer-drop-zone-folder-123', 'drawer-item', makeOver())).toBe('folder-123');
   });

   it('routes the root items drop-zone to undefined (top level)', () => {
      expect(drawerDropFolderId('drawer-drop-zone-root', 'drawer-item', makeOver())).toBeUndefined();
   });

   it('routes a Back-button drop into its parent folder', () => {
      expect(drawerDropFolderId('drawer-back-button-x', 'drawer-back-button', makeOver({ destinationId: 'parent-9' }))).toBe('parent-9');
   });

   it('routes a Back button with no parent to undefined (root)', () => {
      expect(drawerDropFolderId('drawer-back-button-x', 'drawer-back-button', makeOver())).toBeUndefined();
   });

   it('returns undefined for a non-drawer target', () => {
      expect(drawerDropFolderId('board-drop-zone', 'board', makeOver())).toBeUndefined();
   });
});
