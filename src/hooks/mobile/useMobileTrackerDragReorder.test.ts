// @vitest-environment jsdom

// -- Testing Imports --
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

// -- Type Imports --
import type { DragEndEvent } from '@dnd-kit/core';
import type { Character, Tracker } from '@/lib/types/character';

/*
 * The mobile trackers section's drop, end to end through the shared reorder: one case per group, the
 * cross-group refusal, and the id arrays the three SortableContexts ride on. The drag itself needs a
 * TouchSensor and is device-only; this pins everything downstream of it.
 */

const mocks = vi.hoisted(() => ({
   actions: {
      reorderStatuses: vi.fn(),
      reorderStoryTags: vi.fn(),
      reorderStoryThemes: vi.fn(),
   },
}));

vi.mock('@/lib/stores/characterStore', () => ({ useCharacterActions: () => mocks.actions }));

import { useMobileTrackerDragReorder } from './useMobileTrackerDragReorder';

const tracker = (id: string, trackerType: Tracker['trackerType']): Tracker =>
   ({ id, name: id, trackerType } as unknown as Tracker);

const character = (groups: Partial<Record<keyof Character['trackers'], Tracker[]>>): Character =>
   ({ trackers: { statuses: [], storyTags: [], storyThemes: [], ...groups } } as unknown as Character);

const dropEvent = (active: Tracker, over: Tracker | null): DragEndEvent =>
   ({
      active: { id: active.id, data: { current: { item: active } } },
      over: over ? { id: over.id, data: { current: { item: over } } } : null,
   } as unknown as DragEndEvent);

const mount = (loaded: Character | null) => renderHook(() => useMobileTrackerDragReorder(loaded));

beforeEach(() => {
   vi.clearAllMocks();
   cleanup();
});

describe('useMobileTrackerDragReorder — the drop, one case per group', () => {
   it('reorders statuses', () => {
      const a = tracker('s1', 'STATUS');
      const b = tracker('s2', 'STATUS');
      const view = mount(character({ statuses: [a, b] }));

      view.result.current.handleDragEnd(dropEvent(a, b));

      expect(mocks.actions.reorderStatuses).toHaveBeenCalledWith(0, 1);
      expect(mocks.actions.reorderStoryTags).not.toHaveBeenCalled();
      expect(mocks.actions.reorderStoryThemes).not.toHaveBeenCalled();
   });

   it('reorders story tags', () => {
      const a = tracker('t1', 'STORY_TAG');
      const b = tracker('t2', 'STORY_TAG');
      const view = mount(character({ storyTags: [b, a] }));

      view.result.current.handleDragEnd(dropEvent(a, b));

      expect(mocks.actions.reorderStoryTags).toHaveBeenCalledWith(1, 0);
      expect(mocks.actions.reorderStatuses).not.toHaveBeenCalled();
      expect(mocks.actions.reorderStoryThemes).not.toHaveBeenCalled();
   });

   it('reorders story themes', () => {
      const a = tracker('h1', 'STORY_THEME');
      const b = tracker('h2', 'STORY_THEME');
      const view = mount(character({ storyThemes: [a, b] }));

      view.result.current.handleDragEnd(dropEvent(a, b));

      expect(mocks.actions.reorderStoryThemes).toHaveBeenCalledWith(0, 1);
      expect(mocks.actions.reorderStatuses).not.toHaveBeenCalled();
      expect(mocks.actions.reorderStoryTags).not.toHaveBeenCalled();
   });

   // The target id deliberately resolves INSIDE the active's own group, so only the trackerType check
   // can refuse this drop - an index lookup would happily find it and reorder.
   it('writes nothing when a tracker lands on another group', () => {
      const a = tracker('s1', 'STATUS');
      const b = tracker('s2', 'STORY_TAG');
      const view = mount(character({ statuses: [a, tracker('s2', 'STATUS')] }));

      view.result.current.handleDragEnd(dropEvent(a, b));

      expect(mocks.actions.reorderStatuses).not.toHaveBeenCalled();
      expect(mocks.actions.reorderStoryTags).not.toHaveBeenCalled();
      expect(mocks.actions.reorderStoryThemes).not.toHaveBeenCalled();
   });

   it('writes nothing when the drop lands outside any target', () => {
      const a = tracker('s1', 'STATUS');
      const view = mount(character({ statuses: [a] }));

      view.result.current.handleDragEnd(dropEvent(a, null));

      expect(mocks.actions.reorderStatuses).not.toHaveBeenCalled();
   });

   it('writes nothing on a self-drop', () => {
      const a = tracker('s1', 'STATUS');
      const view = mount(character({ statuses: [a] }));

      view.result.current.handleDragEnd(dropEvent(a, a));

      expect(mocks.actions.reorderStatuses).not.toHaveBeenCalled();
   });
});

describe('useMobileTrackerDragReorder — the SortableContext ids', () => {
   it('emits one id array per group in list order', () => {
      const view = mount(character({
         statuses: [tracker('s1', 'STATUS'), tracker('s2', 'STATUS')],
         storyTags: [tracker('t1', 'STORY_TAG')],
         storyThemes: [tracker('h1', 'STORY_THEME')],
      }));

      expect(view.result.current.statusIds).toEqual(['s1', 's2']);
      expect(view.result.current.storyTagIds).toEqual(['t1']);
      expect(view.result.current.storyThemeIds).toEqual(['h1']);
   });

   it('emits empty arrays with no character loaded', () => {
      const view = mount(null);

      expect(view.result.current.statusIds).toEqual([]);
      expect(view.result.current.storyTagIds).toEqual([]);
      expect(view.result.current.storyThemeIds).toEqual([]);
   });
});
