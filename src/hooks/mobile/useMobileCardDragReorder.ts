// -- React Imports --
import { useCallback, useMemo } from 'react';

// -- Other Library Imports --
import type { DragEndEvent } from '@dnd-kit/core';

// -- Store Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';

// -- Type Imports --
import type { ResolvedSheetItem } from '@/lib/character/sheetLayout';



/**
 * Drives drag-to-reorder for the mobile sheet overview (cards and journals interleaved).
 *
 * Returns the memoized `itemIds` for the `SortableContext` and the @dnd-kit `handleDragEnd`, which
 * moves the dragged item to the drop target by id via `reorderSheetLayout` - the same manifest reorder
 * desktop uses, so both surfaces converge on one action. A drop onto the same item is ignored.
 *
 * @param items - The resolved layout items, in their displayed order.
 * @returns `{ itemIds, handleDragEnd }` to wire onto the overview's `<SortableContext>` and `<DndContext>`.
 */
export function useMobileCardDragReorder(items: ResolvedSheetItem[]) {
	const { reorderSheetLayout } = useCharacterActions();

	const itemIds = useMemo(() => items.map((item) => item.id), [items]);

	const handleDragEnd = useCallback((event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		reorderSheetLayout(String(active.id), String(over.id));
	}, [reorderSheetLayout]);

	return { itemIds, handleDragEnd };
}
