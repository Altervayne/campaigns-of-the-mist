// -- Library Imports --
import { beforeEach, describe, expect, it, vi } from 'vitest';

// -- Local Imports --
import { applyTrackerReorder } from './trackerReorder';

// -- Type Imports --
import type { Active, Over } from '@dnd-kit/core';
import type { Character, Tracker } from '@/lib/types/character';
import type { TrackerReorderActions } from './trackerReorder';

/*
 * The tracker drop both sheets share. One case per group so a helper that quietly stopped handling a
 * group would fail here rather than silently strand a user's trackers, plus every no-op guard.
 */

const tracker = (id: string, trackerType: Tracker['trackerType']): Tracker =>
   ({ id, name: id, trackerType } as unknown as Tracker);

const character = (groups: Partial<Record<keyof Character['trackers'], Tracker[]>>): Character =>
   ({ trackers: { statuses: [], storyTags: [], storyThemes: [], ...groups } } as unknown as Character);

const node = (id: string, item?: Tracker) =>
   ({ id, data: { current: item ? { item } : {} } } as unknown as Active & Over);

let actions: TrackerReorderActions;

beforeEach(() => {
   actions = {
      reorderStatuses: vi.fn(),
      reorderStoryTags: vi.fn(),
      reorderStoryThemes: vi.fn(),
   };
});

describe('applyTrackerReorder - one branch per group', () => {
   it('reorders statuses', () => {
      const a = tracker('s1', 'STATUS');
      const b = tracker('s2', 'STATUS');
      applyTrackerReorder(character({ statuses: [a, b] }), node('s1', a), node('s2', b), actions);

      expect(actions.reorderStatuses).toHaveBeenCalledWith(0, 1);
      expect(actions.reorderStoryTags).not.toHaveBeenCalled();
      expect(actions.reorderStoryThemes).not.toHaveBeenCalled();
   });

   it('reorders story tags', () => {
      const a = tracker('t1', 'STORY_TAG');
      const b = tracker('t2', 'STORY_TAG');
      applyTrackerReorder(character({ storyTags: [b, a] }), node('t1', a), node('t2', b), actions);

      expect(actions.reorderStoryTags).toHaveBeenCalledWith(1, 0);
      expect(actions.reorderStatuses).not.toHaveBeenCalled();
      expect(actions.reorderStoryThemes).not.toHaveBeenCalled();
   });

   it('reorders story themes', () => {
      const a = tracker('h1', 'STORY_THEME');
      const b = tracker('h2', 'STORY_THEME');
      applyTrackerReorder(character({ storyThemes: [a, b] }), node('h1', a), node('h2', b), actions);

      expect(actions.reorderStoryThemes).toHaveBeenCalledWith(0, 1);
      expect(actions.reorderStatuses).not.toHaveBeenCalled();
      expect(actions.reorderStoryTags).not.toHaveBeenCalled();
   });

   it('resolves indices against the live list, not the drop order', () => {
      const a = tracker('s1', 'STATUS');
      const b = tracker('s2', 'STATUS');
      const c = tracker('s3', 'STATUS');
      applyTrackerReorder(character({ statuses: [a, b, c] }), node('s3', c), node('s1', a), actions);

      expect(actions.reorderStatuses).toHaveBeenCalledWith(2, 0);
   });
});

describe('applyTrackerReorder - no-op guards', () => {
   const expectNoWrite = () => {
      expect(actions.reorderStatuses).not.toHaveBeenCalled();
      expect(actions.reorderStoryTags).not.toHaveBeenCalled();
      expect(actions.reorderStoryThemes).not.toHaveBeenCalled();
   };

   it('writes nothing without a character', () => {
      const a = tracker('s1', 'STATUS');
      applyTrackerReorder(null, node('s1', a), node('s2', tracker('s2', 'STATUS')), actions);
      expectNoWrite();
   });

   it('writes nothing on a self-drop', () => {
      const a = tracker('s1', 'STATUS');
      applyTrackerReorder(character({ statuses: [a] }), node('s1', a), node('s1', a), actions);
      expectNoWrite();
   });

   // The target id deliberately resolves INSIDE the active's own group, so only the trackerType check
   // can refuse this drop - an index lookup would happily find it and reorder.
   it('writes nothing when the two groups differ', () => {
      const a = tracker('s1', 'STATUS');
      const b = tracker('s2', 'STORY_TAG');
      const sibling = tracker('s2', 'STATUS');
      applyTrackerReorder(character({ statuses: [a, sibling] }), node('s1', a), node('s2', b), actions);
      expectNoWrite();
   });

   it('writes nothing when a side carries no tracker', () => {
      const a = tracker('s1', 'STATUS');
      applyTrackerReorder(character({ statuses: [a] }), node('s1', a), node('s2'), actions);
      expectNoWrite();
   });

   it('writes nothing when an id resolves to no entry in its group', () => {
      const a = tracker('s1', 'STATUS');
      const b = tracker('s2', 'STATUS');
      applyTrackerReorder(character({ statuses: [a] }), node('s1', a), node('s2', b), actions);
      expectNoWrite();
   });
});
