// -- React Imports --
import { useCallback } from 'react';

// -- Other Library Imports --
import type { DragEndEvent } from '@dnd-kit/core';

// -- Hook Imports --
import { useTrackerSortableIds } from '@/hooks/useTrackerSortableIds';

// -- Character Imports --
import { applyTrackerReorder } from '@/lib/character/trackerReorder';

// -- Store Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';

// -- Type Imports --
import type { Character } from '@/lib/types/character';



/**
 * Drives drag-to-reorder for the mobile character sheet's three tracker groups
 * (statuses, story tags, story themes).
 *
 * Returns the memoized id arrays for each group's `SortableContext` plus the
 * @dnd-kit `handleDragEnd` handler. The drop itself is the shared tracker reorder
 * the desktop sheet also lands on, so both surfaces stay same-group-only and
 * resolve their indices against the live character lists.
 *
 * @param character - The loaded character (or null), source of the tracker lists.
 * @returns `{ statusIds, storyTagIds, storyThemeIds, handleDragEnd }` to wire onto
 *   the trackers section's `<SortableContext>`s and `<DndContext>`.
 */
export function useMobileTrackerDragReorder(character: Character | null) {
	const { reorderStatuses, reorderStoryTags, reorderStoryThemes } = useCharacterActions();
	const { statusIds, storyTagIds, storyThemeIds } = useTrackerSortableIds(character);

	const handleDragEnd = useCallback((event: DragEndEvent) => {
		const { active, over } = event;
		if (!over) return;
		applyTrackerReorder(character, active, over, { reorderStatuses, reorderStoryTags, reorderStoryThemes });
	}, [character, reorderStatuses, reorderStoryTags, reorderStoryThemes]);

	return { statusIds, storyTagIds, storyThemeIds, handleDragEnd };
}
