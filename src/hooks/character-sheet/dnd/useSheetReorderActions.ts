// -- React Imports --
import { useCallback } from 'react';

// -- Type Imports --
import type { DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import type { CharacterState } from '@/lib/stores/characterStore';
import type { Character, Tracker } from '@/lib/types/character';

interface UseSheetReorderActionsArgs {
   character: Character | null;
   reorderSheetLayout: CharacterState['actions']['reorderSheetLayout'];
   reorderStatuses: CharacterState['actions']['reorderStatuses'];
   reorderStoryTags: CharacterState['actions']['reorderStoryTags'];
   reorderStoryThemes: CharacterState['actions']['reorderStoryThemes'];
}

/*
 * The two on-sheet reorder drops: a card-or-journal move through the layout manifest, and a tracker move
 * within its own group. Both run after dnd-kit has resolved the target, so they land on `over` directly.
 */
export function useSheetReorderActions({
   character,
   reorderSheetLayout,
   reorderStatuses,
   reorderStoryTags,
   reorderStoryThemes,
}: UseSheetReorderActionsArgs) {
   /**
    * Reorder a sheet element (card OR journal) via the ordered manifest. Kind-agnostic: both live in
    * one SortableContext keyed by manifest id, so the drop is a manifest move by id - never an index
    * into a single content array (which would return -1 for a journal id and silently teleport it home).
    */
   const handleSheetLayoutReorder = useCallback((activeId: string, overId: string) => {
      if (!character) return;
      // Live shuffle: dnd-kit's `over` already reflects the shuffled position, so land on it.
      reorderSheetLayout(activeId, overId);
   }, [character, reorderSheetLayout]);

   /**
    * Handle reordering trackers on the character sheet
    */
   const handleSheetTrackerReorder = useCallback((
      active: DragStartEvent['active'],
      over: NonNullable<DragOverEvent['over']>
   ) => {
      if (!character) return;

      const activeTracker = active.data.current?.item as Tracker;
      const overTracker = over.data.current?.item as Tracker;

      if (!activeTracker?.trackerType || !overTracker?.trackerType) return;
      if (activeTracker.trackerType !== overTracker.trackerType) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      // Live shuffle: dnd-kit's `over` already reflects the shuffled position, so land on it.
      if (activeTracker.trackerType === 'STATUS') {
         const oldIndex = character.trackers.statuses.findIndex(item => item.id === activeId);
         const overIndex = character.trackers.statuses.findIndex(item => item.id === overId);
         if (oldIndex !== -1 && overIndex !== -1) reorderStatuses(oldIndex, overIndex);
      } else if (activeTracker.trackerType === 'STORY_TAG') {
         const oldIndex = character.trackers.storyTags.findIndex(item => item.id === activeId);
         const overIndex = character.trackers.storyTags.findIndex(item => item.id === overId);
         if (oldIndex !== -1 && overIndex !== -1) reorderStoryTags(oldIndex, overIndex);
      } else if (activeTracker.trackerType === 'STORY_THEME') {
         const oldIndex = character.trackers.storyThemes.findIndex(item => item.id === activeId);
         const overIndex = character.trackers.storyThemes.findIndex(item => item.id === overId);
         if (oldIndex !== -1 && overIndex !== -1) reorderStoryThemes(oldIndex, overIndex);
      }
   }, [character, reorderStatuses, reorderStoryTags, reorderStoryThemes]);

   return { handleSheetLayoutReorder, handleSheetTrackerReorder };
}
