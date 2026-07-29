// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Component Imports --
import MobileBreadcrumbs from '@/components/mobile/drawer/MobileBreadcrumbs';
import MobileDrawerContextMenu from '@/components/mobile/drawer/MobileDrawerContextMenu';
import MobileAddFolderSheet from '@/components/mobile/drawer/MobileAddFolderSheet';
import MobileDrawerToolbar from '@/components/mobile/drawer/MobileDrawerToolbar';
import MobileDrawerSearchResults from '@/components/mobile/drawer/MobileDrawerSearchResults';
import MobileDrawerBrowseList from '@/components/mobile/drawer/MobileDrawerBrowseList';
import { DrawerSearchBar } from '@/components/molecules/drawer/DrawerSearchBar';

// -- Store Imports --
import { useDrawerActions, useDrawerStore } from '@/lib/stores/drawerStore';
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Hook Imports --
import { useDrawerNavigation } from '@/hooks/drawer/useDrawerNavigation';
import { useDrawerFileImport } from '@/hooks/drawer/useDrawerFileImport';
import { useDrawerMountLoad } from '@/hooks/drawer/useDrawerMountLoad';
import { useIsDrawerSearchActive, useJumpToSearchResult } from '@/hooks/drawer/useDrawerSearchSurface';
import { useDrawerLongPressHint } from '@/hooks/mobile/useDrawerLongPressHint';
import { useMobileDrawerBrowseMenu, useMobileDrawerResultMenu } from '@/hooks/mobile/useMobileDrawerMenus';
import { useMobileDrawerDragState } from '@/hooks/mobile/useMobileDrawerDragState';
import { useDrawerUndoRedo } from '@/hooks/drawer/useDrawerUndoRedo';

// -- Type Imports --
import type { DrawerItem } from '@/lib/types/drawer';



interface MobileDrawerProps {
	onAddToCharacter?: (item: DrawerItem) => void;
	onLoadCharacter?: (item: DrawerItem) => void;
}

export default function MobileDrawer({ onAddToCharacter, onLoadCharacter }: MobileDrawerProps) {
	const { t } = useTranslation();

	// Drawer state
	const { addFolder } = useDrawerActions();

	// Search reads straight from the store (DrawerSearchBar owns the sole useDrawerSearch instance);
	// when a search is active the body swaps browse -> results in the same space.
	const isSearchActive = useIsDrawerSearchActive();
	const searchResults = useDrawerStore((state) => state.searchResults);
	const isSearching = useDrawerStore((state) => state.isSearching);

	// Folder navigation (current folder, contents, breadcrumb) via the shared hook
	const { currentFolderId, navigateToFolder, currentItems, currentFolders, breadcrumbPath, childCounts } = useDrawerNavigation();

	useDrawerMountLoad();

	// File import via the shared hook (button-triggered file-input path only; no drag zone)
	const { handleFileSelected, fileInputRef, formRef } = useDrawerFileImport(currentFolderId);

	// UI state
	const [isCompactView, setIsCompactView] = useState(true);
	const [showAddFolderSheet, setShowAddFolderSheet] = useState(false);

	const handleJumpToResult = useJumpToSearchResult();

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
				<MobileDrawerBrowseList
					sensors={sensors}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEndWithCleanup}
					onDragCancel={handleDragCancel}
					hasContent={hasContent}
					currentFolderId={currentFolderId}
					folders={currentFolders}
					items={currentItems}
					folderIds={folderIds}
					itemIds={itemIds}
					childCounts={childCounts}
					onNavigate={navigateToFolder}
					onFolderLongPress={browseMenu.openForFolder}
					onItemLongPress={browseMenu.openForItem}
					isCompactView={isCompactView}
					isLeftHanded={isLeftHanded}
					activeFolder={activeFolder}
					activeItem={activeItem}
				/>
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
				onJumpTo={resultTarget ? () => handleJumpToResult(resultTarget.parentFolderId) : undefined}
			/>
		</div>
	);
}
