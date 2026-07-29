// -- React Imports --
import { useState, useMemo } from 'react';

// -- Other Library Imports --
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';

// -- Hook Imports --
import { useMobileDragSensors } from '@/hooks/mobile/useMobileDragSensors';
import { useMobileDrawerDragReorder } from '@/hooks/mobile/useMobileDrawerDragReorder';

// -- Utils Imports --
import { triggerHaptic } from '@/lib/utils/haptics';

// -- Type Imports --
import type { DrawerFolderRecord, DrawerItemRecord } from '@/lib/drawer/drawerRecords';

// -- Constants Imports --
import { DRAG_TYPES } from '@/lib/constants/dragDrop';



// Drag-to-reorder (folders and items within the current folder). The drawer
// uses the body of each row as the drag target (no dedicated grip), so the
// TouchSensor activation delay is bumped to the platform long-press idiom
// (500ms) - quick taps and scroll flings still fall through to their
// normal behaviour, while a deliberate press-and-hold picks the row up.
const DRAWER_LONG_PRESS_DELAY_MS = 500;



/**
 * Owns the mobile drawer's drag-to-reorder state: the sensor set, the sortable
 * id lists, the active row, and the three `DndContext` handlers.
 *
 * Lives in the drawer's parent rather than in the browse branch: that branch is
 * one arm of the browse/search ternary and unmounts whenever a search starts, so
 * hosting the state there would reset it on every search.
 *
 * @param currentFolderId - The open folder's id (null at root); the reorder parent scope.
 * @param currentFolders - The subfolders shown in the open folder, in display order.
 * @param currentItems - The items shown in the open folder, in display order.
 * @returns The sensors, the memoized `folderIds` / `itemIds` for both
 *   `SortableContext`s, the `activeFolder` / `activeItem` snapshot subjects, and
 *   the drag start / end / cancel handlers.
 */
export function useMobileDrawerDragState(
	currentFolderId: string | null,
	currentFolders: readonly DrawerFolderRecord[],
	currentItems: readonly DrawerItemRecord[],
) {
	const sensors = useMobileDragSensors(DRAWER_LONG_PRESS_DELAY_MS);
	const { handleDragEnd } = useMobileDrawerDragReorder(currentFolderId, currentFolders, currentItems);
	const folderIds = useMemo(() => currentFolders.map((folder) => folder.id), [currentFolders]);
	const itemIds = useMemo(() => currentItems.map((item) => item.id), [currentItems]);

	// Track which row is being dragged so we can render its snapshot inside the
	// `DragOverlay`. Without an overlay, the dragged row is the real list element
	// moved by `transform` and clipped by the scroll container, so it appears to
	// stop following the finger as soon as the gesture leaves the list bounds.
	// The overlay floats anywhere on screen and follows the pointer faithfully.
	const [activeDrag, setActiveDrag] = useState<{ kind: 'folder' | 'item'; id: string } | null>(null);
	const activeFolder = activeDrag?.kind === 'folder' ? currentFolders.find(f => f.id === activeDrag.id) : undefined;
	const activeItem = activeDrag?.kind === 'item' ? currentItems.find(i => i.id === activeDrag.id) : undefined;

	const handleDragStart = (event: DragStartEvent) => {
		const dragType = event.active.data.current?.type as string | undefined;
		if (dragType === DRAG_TYPES.DRAWER_FOLDER) {
			setActiveDrag({ kind: 'folder', id: String(event.active.id) });
		} else if (dragType === DRAG_TYPES.DRAWER_ITEM) {
			setActiveDrag({ kind: 'item', id: String(event.active.id) });
		}
		// Confirms the long-press picked the row up - the row body is no longer
		// wired through `useLongPress` (which used to fire the haptic), so we
		// fire it here on drag activation instead.
		triggerHaptic();
	};

	const handleDragEndWithCleanup = (event: DragEndEvent) => {
		setActiveDrag(null);
		handleDragEnd(event);
	};

	const handleDragCancel = () => setActiveDrag(null);

	return {
		sensors,
		folderIds,
		itemIds,
		activeFolder,
		activeItem,
		handleDragStart,
		handleDragEndWithCleanup,
		handleDragCancel,
	};
}
