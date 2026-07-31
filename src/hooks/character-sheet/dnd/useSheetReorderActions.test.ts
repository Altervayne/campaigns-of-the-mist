// @vitest-environment jsdom

// -- Testing Imports --
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

// -- Local Imports --
import { useSheetReorderActions } from './useSheetReorderActions';

// -- Type Imports --
import type { DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import type { Character, Tracker } from '@/lib/types/character';

/*
 * The desktop sheet's tracker drop, through the shared reorder: one case per group, plus the guards.
 * Routing to this handler is pinned separately in dragEndBranches; the drag itself is dnd-kit and
 * cursor-only.
 */

const actions = {
   reorderSheetLayout: vi.fn(),
   reorderStatuses: vi.fn(),
   reorderStoryTags: vi.fn(),
   reorderStoryThemes: vi.fn(),
};

const tracker = (id: string, trackerType: Tracker['trackerType']): Tracker =>
   ({ id, name: id, trackerType } as unknown as Tracker);

const character = (groups: Partial<Record<keyof Character['trackers'], Tracker[]>>): Character =>
   ({ trackers: { statuses: [], storyTags: [], storyThemes: [], ...groups } } as unknown as Character);

const node = (item: Tracker) => ({ id: item.id, data: { current: { item } } });

const mount = (loaded: Character | null) =>
   renderHook(() => useSheetReorderActions({ character: loaded, ...actions }));

const drop = (loaded: Character | null, active: Tracker, over: Tracker) => {
   const view = mount(loaded);
   view.result.current.handleSheetTrackerReorder(
      node(active) as unknown as DragStartEvent['active'],
      node(over) as unknown as NonNullable<DragOverEvent['over']>,
   );
};

const expectNoWrite = () => {
   expect(actions.reorderStatuses).not.toHaveBeenCalled();
   expect(actions.reorderStoryTags).not.toHaveBeenCalled();
   expect(actions.reorderStoryThemes).not.toHaveBeenCalled();
};

beforeEach(() => {
   vi.clearAllMocks();
   cleanup();
});

describe('handleSheetTrackerReorder - one case per group', () => {
   it('reorders statuses', () => {
      const a = tracker('s1', 'STATUS');
      const b = tracker('s2', 'STATUS');
      drop(character({ statuses: [a, b] }), a, b);

      expect(actions.reorderStatuses).toHaveBeenCalledWith(0, 1);
      expect(actions.reorderStoryTags).not.toHaveBeenCalled();
      expect(actions.reorderStoryThemes).not.toHaveBeenCalled();
   });

   it('reorders story tags', () => {
      const a = tracker('t1', 'STORY_TAG');
      const b = tracker('t2', 'STORY_TAG');
      drop(character({ storyTags: [b, a] }), a, b);

      expect(actions.reorderStoryTags).toHaveBeenCalledWith(1, 0);
      expect(actions.reorderStatuses).not.toHaveBeenCalled();
      expect(actions.reorderStoryThemes).not.toHaveBeenCalled();
   });

   it('reorders story themes', () => {
      const a = tracker('h1', 'STORY_THEME');
      const b = tracker('h2', 'STORY_THEME');
      drop(character({ storyThemes: [a, b] }), a, b);

      expect(actions.reorderStoryThemes).toHaveBeenCalledWith(0, 1);
      expect(actions.reorderStatuses).not.toHaveBeenCalled();
      expect(actions.reorderStoryTags).not.toHaveBeenCalled();
   });
});

describe('handleSheetTrackerReorder - no-op guards', () => {
   it('writes nothing without a character', () => {
      drop(null, tracker('s1', 'STATUS'), tracker('s2', 'STATUS'));
      expectNoWrite();
   });

   // The target id deliberately resolves INSIDE the active's own group, so only the trackerType check
   // can refuse this drop - an index lookup would happily find it and reorder.
   it('writes nothing when a tracker lands on another group', () => {
      const a = tracker('s1', 'STATUS');
      drop(character({ statuses: [a, tracker('s2', 'STATUS')] }), a, tracker('s2', 'STORY_TAG'));
      expectNoWrite();
   });

   it('writes nothing on a self-drop', () => {
      const a = tracker('s1', 'STATUS');
      drop(character({ statuses: [a] }), a, a);
      expectNoWrite();
   });
});
