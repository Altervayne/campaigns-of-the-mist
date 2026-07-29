// -- React Imports --
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import type { Modifier } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

// -- Component Imports --
import MobileBreadcrumbs from '@/components/mobile/drawer/MobileBreadcrumbs';
import MobileFolderItem from '@/components/mobile/drawer/MobileFolderItem';
import MobileDrawerItem from '@/components/mobile/drawer/MobileDrawerItem';
import MobileDrawerContextMenu from '@/components/mobile/drawer/MobileDrawerContextMenu';
import MobileAddFolderSheet from '@/components/mobile/drawer/MobileAddFolderSheet';
import MobileDrawerToolbar from '@/components/mobile/drawer/MobileDrawerToolbar';
import MobileDrawerSearchResults from '@/components/mobile/drawer/MobileDrawerSearchResults';
import MobileDrawerDragOverlay from '@/components/mobile/drawer/MobileDrawerDragOverlay';
import { DrawerSearchBar } from '@/components/molecules/drawer/DrawerSearchBar';

// -- Store Imports --
import { useDrawerActions, useDrawerStore, isSearchFilterActive } from '@/lib/stores/drawerStore';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Hook Imports --
import { useDrawerNavigation } from '@/hooks/drawer/useDrawerNavigation';
import { useDrawerFileImport } from '@/hooks/drawer/useDrawerFileImport';
import { useDrawerLongPressHint } from '@/hooks/mobile/useDrawerLongPressHint';
import { useMobileDrawerBrowseMenu, useMobileDrawerResultMenu } from '@/hooks/mobile/useMobileDrawerMenus';
import { useMobileDrawerDragState } from '@/hooks/mobile/useMobileDrawerDragState';
import { useDrawerUndoRedo } from '@/hooks/drawer/useDrawerUndoRedo';

// -- Type Imports --
import type { DrawerItem } from '@/lib/types/drawer';



/**
 * Inline `@dnd-kit` modifier that locks dragging to the vertical axis: any
 * horizontal pointer travel is dropped from the transform applied to the
 * `DragOverlay`. This keeps the dragged item moving with the finger up and down
 * (so it visually follows the gesture across the screen) while making
 * horizontal drift impossible - which, combined with `overflow-x: hidden` on
 * the scroll container, prevents the drag from expanding the container and
 * breaking the drawer layout. Inlined rather than depending on
 * `@dnd-kit/modifiers` (not installed; do not add).
 */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });



interface MobileDrawerProps {
	onAddToCharacter?: (item: DrawerItem) => void;
	onLoadCharacter?: (item: DrawerItem) => void;
}

export default function MobileDrawer({ onAddToCharacter, onLoadCharacter }: MobileDrawerProps) {
	const { t } = useTranslation();

	// Drawer state
	const { addFolder, reloadCurrentFolder, clearSearch } = useDrawerActions();

	// Search reads straight from the store (DrawerSearchBar owns the sole useDrawerSearch instance);
	// when a search is active the body swaps browse -> results in the same space.
	const isSearchActive = useDrawerStore((state) => isSearchFilterActive(state.searchCriteria));
	const searchResults = useDrawerStore((state) => state.searchResults);
	const isSearching = useDrawerStore((state) => state.isSearching);

	// Folder navigation (current folder, contents, breadcrumb) via the shared hook
	const { currentFolderId, navigateToFolder, currentItems, currentFolders, breadcrumbPath, childCounts } = useDrawerNavigation();

	// The store loads the current-folder view on demand; trigger the initial load
	// when the drawer mounts (reopening remounts and refreshes).
	useEffect(() => {
		void reloadCurrentFolder();
	}, [reloadCurrentFolder]);

	// File import via the shared hook (button-triggered file-input path only; no drag zone)
	const { handleFileSelected, fileInputRef, formRef } = useDrawerFileImport(currentFolderId);

	// UI state
	const [isCompactView, setIsCompactView] = useState(true);
	const [showAddFolderSheet, setShowAddFolderSheet] = useState(false);

	// The two context menus keep separate state: both stay mounted, only one is ever open.
	const browseMenu = useMobileDrawerBrowseMenu();
	const { target: resultTarget, position: resultPosition, open: openResultMenu, close: closeResultMenu } = useMobileDrawerResultMenu();

   // Mobile Handedness
   const mobileHandedness = useAppSettingsStore((state) => state.mobileHandedness);
   const isLeftHanded = (mobileHandedness === 'left')

   // FAB mode reserves a horizontal slot in the toolbar on the handedness-leading
   // edge so the navigation FAB (which now sits at its base offset, inside the
   // toolbar's vertical band) does not overlap any toolbar button. The slot is
   // the FAB's footprint (44px = h-11) plus its inset (16px = left-4/right-4)
   // plus a small gap (4px), totalling 64px (4rem). When bottom-tabs mode is on
   // there is no floating FAB to clear, so the slot is not reserved.
   const isMobileFABMode = useAppSettingsStore((state) => state.isMobileFABMode);
   const fabSlotStyle = isMobileFABMode
      ? (isLeftHanded ? { paddingLeft: '4rem' } : { paddingRight: '4rem' })
      : undefined;

   useDrawerLongPressHint();

   const {
      sensors,
      folderIds,
      itemIds,
      activeFolder,
      activeItem,
      handleDragStart,
      handleDragEndWithCleanup,
      handleDragCancel,
   } = useMobileDrawerDragState(currentFolderId, currentFolders, currentItems);

   // Undo/redo for drawer mutations (rename/move/delete/reorder/add), mirroring how
   // the character sheet exposes undo/redo via the temporal store. Any past state
   // means there is a mutation to undo; any future state means there is one to redo.
   const { canUndo, canRedo, undo, redo } = useDrawerUndoRedo();

	// Handlers
	const handleAddFolder = () => {
		setShowAddFolderSheet(true);
	};

	const handleAddFolderConfirm = async (folderName: string) => {
		try {
			await addFolder(folderName, currentFolderId ?? undefined);
			toast.success(t('Notifications.drawer.folderCreated'));
		} catch {
			toast.error(t('Notifications.drawer.actionFailed'));
		}
	};

	const hasContent = currentFolders.length > 0 || currentItems.length > 0;

	return (
		<div className="h-full flex flex-col bg-background pt-safe" data-tutorial="drawer-content">
			{/* Real search bar pinned at the top; its Filters toggle expands the panel inline (no sheet). */}
			<div className="shrink-0 border-b border-border p-3">
				<DrawerSearchBar isMobile />
			</div>

			{/* Body: the browse tree, or - while a search is active - the flat results IN THE SAME space
			    (no overlay). Results are a plain list (no drag/reorder). */}
			{isSearchActive ? (
				<MobileDrawerSearchResults
					isSearching={isSearching}
					results={searchResults}
					onOpenResultMenu={openResultMenu}
				/>
			) : (
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				modifiers={[restrictToVerticalAxis]}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEndWithCleanup}
				onDragCancel={handleDragCancel}
			>
				<div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2">
					{!hasContent && (
						<div className="h-full flex items-center justify-center text-center p-8">
							<div>
								<p className="text-muted-foreground mb-4">
									{currentFolderId
										? t('Drawer.emptyFolder')
										: t('Drawer.emptyDrawer')}
								</p>
							</div>
						</div>
					)}

					{/* Folders */}
					<SortableContext items={folderIds} strategy={verticalListSortingStrategy}>
						{currentFolders.map((folder) => (
							<MobileFolderItem
								key={folder.id}
								folder={folder}
								folderCount={childCounts.get(folder.id)?.folderCount ?? 0}
								itemCount={childCounts.get(folder.id)?.itemCount ?? 0}
								onNavigate={navigateToFolder}
								onLongPress={browseMenu.openForFolder}
								isLeftHanded={isLeftHanded}
							/>
						))}
					</SortableContext>

					{/* Separator if both folders and items exist */}
					{currentFolders.length > 0 && currentItems.length > 0 && (
						<div className="border-t border-border my-2" />
					)}

					{/* Items */}
					<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
						{currentItems.map((item) => (
							<MobileDrawerItem
								key={item.id}
								item={item}
								isCompact={isCompactView}
								onLongPress={browseMenu.openForItem}
								isLeftHanded={isLeftHanded}
							/>
						))}
					</SortableContext>
				</div>

				{/* Overlay snapshot of the active row, floating with the pointer */}
				<DragOverlay dropAnimation={null}>
					<MobileDrawerDragOverlay
						activeFolder={activeFolder}
						activeItem={activeItem}
						folderCount={activeFolder ? childCounts.get(activeFolder.id)?.folderCount ?? 0 : 0}
						itemCount={activeFolder ? childCounts.get(activeFolder.id)?.itemCount ?? 0 : 0}
						isCompact={isCompactView}
						isLeftHanded={isLeftHanded}
					/>
				</DragOverlay>
			</DndContext>
			)}

			{/* Breadcrumbs navigation at bottom - browse-only (hidden while searching, like desktop). */}
			{!isSearchActive && (
			<div className="border-t border-border">
            <MobileBreadcrumbs
               breadcrumbPath={breadcrumbPath}
               onNavigate={navigateToFolder}
			   />
         </div>
			)}

			<MobileDrawerToolbar
				isLeftHanded={isLeftHanded}
				fabSlotStyle={fabSlotStyle}
				formRef={formRef}
				fileInputRef={fileInputRef}
				onFileSelected={handleFileSelected}
				onAddFolder={handleAddFolder}
				isCompactView={isCompactView}
				onToggleView={() => setIsCompactView(!isCompactView)}
				canUndo={canUndo}
				canRedo={canRedo}
				onUndo={() => { void undo(); }}
				onRedo={() => { void redo(); }}
			/>

			{/* Context Menu */}
			<MobileDrawerContextMenu
				isOpen={browseMenu.isOpen}
				onClose={browseMenu.close}
				target={browseMenu.target}
				position={browseMenu.position}
				onAddToCharacter={onAddToCharacter}
				onLoadCharacter={onLoadCharacter}
			/>

			{/* Add Folder Sheet */}
			<MobileAddFolderSheet
				isOpen={showAddFolderSheet}
				onClose={() => setShowAddFolderSheet(false)}
				onConfirm={handleAddFolderConfirm}
			/>

			{/* Search-result context menu: its own target/anchor. Jump-to navigates + clears search, which
			    swaps the body back to browse in that folder (no sheet to close). */}
			<MobileDrawerContextMenu
				isOpen={resultTarget != null}
				onClose={closeResultMenu}
				target={resultTarget ? { type: 'item', id: resultTarget.id, name: resultTarget.name } : null}
				position={resultPosition}
				onAddToCharacter={onAddToCharacter}
				onLoadCharacter={onLoadCharacter}
				onJumpTo={resultTarget ? () => { navigateToFolder(resultTarget.parentFolderId); clearSearch(); } : undefined}
			/>
		</div>
	);
}
