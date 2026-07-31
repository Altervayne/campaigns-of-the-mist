// @vitest-environment jsdom

// -- Testing Imports --
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// -- Type Imports --
import type { DragEndEvent } from '@dnd-kit/core';

/*
 * The pages-sheet reorder driver: id-based, so a drop moves the page by id (never an index splice) and a
 * drop onto the same page - or off any target - is a no-op.
 */

import { useMobileJournalPageReorder } from './useMobileJournalPageReorder';

const pages = [{ id: 'p1', text: 'Alpha' }, { id: 'p2', text: '' }, { id: 'p3', text: 'Gamma' }];

const dragEnd = (activeId: string, overId: string | null) =>
   ({ active: { id: activeId }, over: overId ? { id: overId } : null }) as unknown as DragEndEvent;

describe('useMobileJournalPageReorder', () => {
   it('exposes the page ids in order for the sortable context', () => {
      const { result } = renderHook(() => useMobileJournalPageReorder(pages, vi.fn()));
      expect(result.current.pageIds).toEqual(['p1', 'p2', 'p3']);
   });

   it('reorders by the active/over ids, never an index', () => {
      const onReorder = vi.fn();
      const { result } = renderHook(() => useMobileJournalPageReorder(pages, onReorder));

      result.current.handleDragEnd(dragEnd('p3', 'p1'));

      expect(onReorder).toHaveBeenCalledTimes(1);
      expect(onReorder).toHaveBeenCalledWith('p3', 'p1');
   });

   it('ignores a drop onto the same page or off any target', () => {
      const onReorder = vi.fn();
      const { result } = renderHook(() => useMobileJournalPageReorder(pages, onReorder));

      result.current.handleDragEnd(dragEnd('p2', 'p2'));
      result.current.handleDragEnd(dragEnd('p2', null));

      expect(onReorder).not.toHaveBeenCalled();
   });
});
