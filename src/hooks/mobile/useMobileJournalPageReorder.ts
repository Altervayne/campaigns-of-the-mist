// -- React Imports --
import { useCallback, useMemo } from 'react';

// -- Other Library Imports --
import type { DragEndEvent } from '@dnd-kit/core';

// -- Type Imports --
import type { JournalPage } from '@/lib/types/board';



/**
 * Drives drag-to-reorder for the mobile journal pages sheet.
 *
 * Returns the memoized `pageIds` for the `SortableContext` and the @dnd-kit `handleDragEnd`, which moves
 * the dragged page to the drop target BY ID via the injected `onReorder` (the journal's own id-based
 * `reorderPages`, so the reader follows the current page by id and no index teleports). A drop onto the
 * same page is ignored.
 *
 * @param pages - The rendered pages, in order.
 * @param onReorder - The journal's id-based page reorder action.
 * @returns `{ pageIds, handleDragEnd }` to wire onto the sheet's `<SortableContext>` and `<DndContext>`.
 */
export function useMobileJournalPageReorder(pages: JournalPage[], onReorder: (activeId: string, overId: string) => void) {
	const pageIds = useMemo(() => pages.map((page) => page.id), [pages]);

	const handleDragEnd = useCallback((event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		onReorder(String(active.id), String(over.id));
	}, [onReorder]);

	return { pageIds, handleDragEnd };
}
