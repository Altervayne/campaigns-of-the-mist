// @vitest-environment jsdom

// -- Testing Imports --
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

// -- Type Imports --
import type { DragEndEvent } from '@dnd-kit/core';
import type { ResolvedSheetItem } from '@/lib/character/sheetLayout';

/*
 * The sheet overview's drop, through the shared id-based reorder. The drag itself needs a TouchSensor
 * and is device-only; this pins everything downstream: a journal (or card) lands on the drop target by
 * id via reorderSheetLayout, never by a resolved index - so a mixed cards+journals list cannot teleport.
 */

const mocks = vi.hoisted(() => ({ actions: { reorderSheetLayout: vi.fn() } }));

vi.mock('@/lib/stores/characterStore', () => ({ useCharacterActions: () => mocks.actions }));

import { useMobileCardDragReorder } from './useMobileCardDragReorder';

const cardItem = (id: string): ResolvedSheetItem => ({ kind: 'card', id, card: { id } } as unknown as ResolvedSheetItem);
const journalItem = (id: string): ResolvedSheetItem => ({ kind: 'journal', id, journal: { id, title: '', pages: [], bookmarks: [] } });

const dropEvent = (activeId: string, overId: string | null): DragEndEvent =>
   ({ active: { id: activeId }, over: overId ? { id: overId } : null } as unknown as DragEndEvent);

const mount = (items: ResolvedSheetItem[]) => renderHook(() => useMobileCardDragReorder(items));

beforeEach(() => {
   vi.clearAllMocks();
   cleanup();
});

describe('useMobileCardDragReorder', () => {
   it('reorders by id, passing the active and over ids straight through', () => {
      const view = mount([cardItem('c1'), journalItem('j1'), cardItem('c2')]);

      view.result.current.handleDragEnd(dropEvent('j1', 'c2'));

      expect(mocks.actions.reorderSheetLayout).toHaveBeenCalledWith('j1', 'c2');
   });

   it('emits the item ids in list order for the SortableContext', () => {
      const view = mount([cardItem('c1'), journalItem('j1'), cardItem('c2')]);

      expect(view.result.current.itemIds).toEqual(['c1', 'j1', 'c2']);
   });

   it('writes nothing on a self-drop', () => {
      const view = mount([cardItem('c1')]);

      view.result.current.handleDragEnd(dropEvent('c1', 'c1'));

      expect(mocks.actions.reorderSheetLayout).not.toHaveBeenCalled();
   });

   it('writes nothing when the drop lands outside any target', () => {
      const view = mount([cardItem('c1')]);

      view.result.current.handleDragEnd(dropEvent('c1', null));

      expect(mocks.actions.reorderSheetLayout).not.toHaveBeenCalled();
   });
});
