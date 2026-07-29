// -- Type Imports --
import type { Active, Over } from '@dnd-kit/core';
import type { Character, Tracker } from '@/lib/types/character';

/*
 * The tracker drop shared by the desktop sheet and the mobile sheet. Both surfaces run their own
 * drag systems - different sensors, different collision, different drop resolution - and meet only
 * here, at the point where a resolved drop becomes a reorder.
 */

/** The three per-group reorder actions a tracker drop dispatches into. */
export interface TrackerReorderActions {
   reorderStatuses: (oldIndex: number, newIndex: number) => void;
   reorderStoryTags: (oldIndex: number, newIndex: number) => void;
   reorderStoryThemes: (oldIndex: number, newIndex: number) => void;
}

/**
 * Resolves a tracker drop into a same-group reorder and dispatches it. Reordering is constrained to
 * one group: a cross-group move is dropped, not relocated. Indices resolve against the live character
 * lists, so the displayed order is the source of truth, and dnd-kit's live shuffle already reflects
 * the target slot, so the drop lands on `over` directly.
 *
 * A no-op without a character, on a self-drop, when either side carries no tracker, when the two
 * `trackerType`s differ, or when an id resolves to nothing in its group.
 */
export function applyTrackerReorder(
   character: Character | null,
   active: Active,
   over: Over,
   actions: TrackerReorderActions,
): void {
   if (!character || active.id === over.id) return;

   const activeTracker = active.data.current?.item as Tracker | undefined;
   const overTracker = over.data.current?.item as Tracker | undefined;
   if (!activeTracker?.trackerType || !overTracker?.trackerType) return;
   if (activeTracker.trackerType !== overTracker.trackerType) return;

   const activeId = active.id as string;
   const overId = over.id as string;

   if (activeTracker.trackerType === 'STATUS') {
      const oldIndex = character.trackers.statuses.findIndex((tracker) => tracker.id === activeId);
      const newIndex = character.trackers.statuses.findIndex((tracker) => tracker.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) actions.reorderStatuses(oldIndex, newIndex);
   } else if (activeTracker.trackerType === 'STORY_TAG') {
      const oldIndex = character.trackers.storyTags.findIndex((tracker) => tracker.id === activeId);
      const newIndex = character.trackers.storyTags.findIndex((tracker) => tracker.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) actions.reorderStoryTags(oldIndex, newIndex);
   } else if (activeTracker.trackerType === 'STORY_THEME') {
      const oldIndex = character.trackers.storyThemes.findIndex((tracker) => tracker.id === activeId);
      const newIndex = character.trackers.storyThemes.findIndex((tracker) => tracker.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) actions.reorderStoryThemes(oldIndex, newIndex);
   }
}
