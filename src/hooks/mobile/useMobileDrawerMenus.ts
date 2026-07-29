// -- React Imports --
import { useState } from 'react';
import type { MouseEvent } from 'react';

// -- Type Imports --
import type { DrawerItemSummary } from '@/lib/drawer/drawerRepository';



/** The browse-tree row a context menu was opened from. */
interface BrowseMenuTarget {
	type: 'item' | 'folder';
	id: string;
	name: string;
}

/**
 * State for the browse tree's context menu: which row it acts on and where it
 * anchors. Opened from a row's overflow (⋯) button, which supplies the anchor
 * point.
 *
 * @returns `isOpen`, the `target` row, the anchor `position`, the two per-kind
 *   openers, and `close`.
 */
export function useMobileDrawerBrowseMenu() {
	const [showContextMenu, setShowContextMenu] = useState(false);
	const [contextMenuTarget, setContextMenuTarget] = useState<BrowseMenuTarget | null>(null);
	const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

	const openForFolder = (folderId: string, folderName: string, position: { x: number; y: number }) => {
		setContextMenuTarget({ type: 'folder', id: folderId, name: folderName });
		setContextMenuPosition(position);
		setShowContextMenu(true);
	};

	const openForItem = (itemId: string, itemName: string, position: { x: number; y: number }) => {
		setContextMenuTarget({ type: 'item', id: itemId, name: itemName });
		setContextMenuPosition(position);
		setShowContextMenu(true);
	};

	const close = () => {
		setShowContextMenu(false);
		setContextMenuTarget(null);
		setContextMenuPosition(null);
	};

	return {
		isOpen: showContextMenu,
		target: contextMenuTarget,
		position: contextMenuPosition,
		openForFolder,
		openForItem,
		close,
	};
}

/**
 * State for the search-result context menu: its own target + anchor, distinct
 * from the browse long-press menu. Both menus are mounted at once and only one
 * is ever open, so their state stays separate.
 *
 * `open` anchors the menu at the centre of the tapped result button.
 *
 * @returns The `target` summary (null when closed), the anchor `position`,
 *   `open`, and `close`.
 */
export function useMobileDrawerResultMenu() {
	const [searchMenuTarget, setSearchMenuTarget] = useState<DrawerItemSummary | null>(null);
	const [searchMenuPos, setSearchMenuPos] = useState<{ x: number; y: number } | null>(null);

	const open = (summary: DrawerItemSummary, event: MouseEvent<HTMLButtonElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		setSearchMenuTarget(summary);
		setSearchMenuPos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
	};

	const close = () => {
		setSearchMenuTarget(null);
		setSearchMenuPos(null);
	};

	return { target: searchMenuTarget, position: searchMenuPos, open, close };
}
