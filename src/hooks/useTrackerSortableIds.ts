// -- React Imports --
import { useMemo } from 'react';

// -- Type Imports --
import type { Character } from '@/lib/types/character';

/**
 * The memoized id arrays for the three tracker groups, one per `SortableContext`. Each memo keys on
 * its own list, so a change in one group leaves the other two arrays identical. Empty when no
 * character is loaded.
 */
export function useTrackerSortableIds(character: Character | null) {
   const statusIds = useMemo(
      () => character?.trackers.statuses.map((tracker) => tracker.id) ?? [],
      [character?.trackers.statuses]
   );
   const storyTagIds = useMemo(
      () => character?.trackers.storyTags.map((tracker) => tracker.id) ?? [],
      [character?.trackers.storyTags]
   );
   const storyThemeIds = useMemo(
      () => character?.trackers.storyThemes.map((tracker) => tracker.id) ?? [],
      [character?.trackers.storyThemes]
   );

   return { statusIds, storyTagIds, storyThemeIds };
}
