// -- React Imports --
import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent, Modifier } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

// -- Component Imports --
import MobileBreadcrumbs from '@/components/mobile/drawer/MobileBreadcrumbs';
import MobileFolderItem from '@/components/mobile/drawer/MobileFolderItem';
import MobileDrawerItem from '@/components/mobile/drawer/MobileDrawerItem';
import MobileDrawerContextMenu from '@/components/mobile/drawer/MobileDrawerContextMenu';
import MobileAddFolderSheet from '@/components/mobile/drawer/MobileAddFolderSheet';
import MobileDrawerToolbar from '@/components/mobile/drawer/MobileDrawerToolbar';
import { DrawerSearchBar } from '@/components/molecules/drawer/DrawerSearchBar';
import { DrawerListRow } from '@/components/molecules/drawer/DrawerListRow';
import { DrawerItemPreview } from '@/components/organisms/drawer/DrawerItemPreview';
import { GameTag } from '@/components/molecules/GameTag';
import { FolderCountLabel } from '@/components/mobile/shared/FolderCountLabel';

// -- Icon Imports --
import { Folder as FolderIcon, MoreHorizontal } from 'lucide-react';

// -- Store Imports --
import { useDrawerActions, useDrawerStore, isSearchFilterActive } from '@/lib/stores/drawerStore';
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';

// -- Hook Imports --
import { useDrawerNavigation } from '@/hooks/drawer/useDrawerNavigation';
import { useDrawerFileImport } from '@/hooks/drawer/useDrawerFileImport';
import { useMobileDragSensors } from '@/hooks/mobile/useMobileDragSensors';
import { useMobileDrawerDragReorder } from '@/hooks/mobile/useMobileDrawerDragReorder';
import { useDrawerUndoRedo } from '@/hooks/drawer/useDrawerUndoRedo';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/haptics';
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';

// -- Type Imports --
import type { DrawerItem } from '@/lib/types/drawer';
import type { DrawerFolderRecord } from '@/lib/drawer/drawerRecords';
import type { DrawerItemSummary } from '@/lib/drawer/drawerRepository';

// -- Constants Imports --
import { DRAG_TYPES } from '@/lib/constants/dragDrop';



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

/**
 * Render an overlay snapshot of a folder row that follows the pointer during a
 * drag. Presentational copy of `MobileFolderItem`'s body with the corner
 * context-menu button drawn in its handedness-leading position. Kept inline so
 * the overlay is self-contained.
 */
const renderFolderOverlay = (folder: DrawerFolderRecord, folderCount: number, itemCount: number, isLeftHanded: boolean) => (
   <div className={cn(
      "flex items-center rounded-lg border border-border bg-card shadow-2xl overflow-hidden",
      isLeftHanded && "flex-row-reverse"
   )}>
      <div className="flex flex-1 min-w-0">
         <div className="flex flex-1 min-w-0 items-center gap-2 p-2 min-h-11">
            <FolderIcon className="w-6 h-6 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
               <p className="font-medium text-foreground break-words">{folder.name}</p>
               <FolderCountLabel folders={folderCount} items={itemCount} />
            </div>
         </div>
      </div>
      <div className="flex shrink-0 items-center justify-center h-11 w-11 text-muted-foreground">
         <MoreHorizontal className="w-5 h-5" />
      </div>
   </div>
);

/**
 * Render an overlay snapshot of a drawer-item row that follows the pointer
 * during a drag. Mirrors `MobileDrawerItem`'s compact / rich shapes with the
 * inline context-menu button on the handedness-leading edge.
 */
const renderItemOverlay = (item: DrawerItem, isCompact: boolean, isLeftHanded: boolean) => {
   const Icon = getItemTypeIconComponent(item.type);
   return (
      <div className={cn(
         "flex rounded-lg border border-border bg-card shadow-2xl overflow-hidden",
         isCompact ? "items-center" : "items-start",
         isLeftHanded && "flex-row-reverse"
      )}>
         <div className="flex flex-1 min-w-0">
            {isCompact ? (
               <div className="flex flex-1 min-w-0 items-center gap-2 p-2 min-h-11">
                  <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                     <p className="font-medium text-foreground break-words">{item.name}</p>
                     <div className="flex items-center gap-2 mt-1">
                        {/* NEUTRAL items are game-agnostic: GameTag renders nothing for them. */}
                        <GameTag game={item.game} />
                     </div>
                  </div>
               </div>
            ) : (
               <div className="flex-1 min-w-0">
                  <DrawerItemPreview item={item} />
               </div>
            )}
         </div>
         <div className="flex shrink-0 items-center justify-center h-11 w-11 text-muted-foreground">
            <MoreHorizontal className="w-5 h-5" />
         </div>
      </div>
   );
};



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
	const [showContextMenu, setShowContextMenu] = useState(false);
	const [contextMenuTarget, setContextMenuTarget] = useState<{
      type: 'item' | 'folder';
		id: string;
		name: string;
	} | null>(null);
	const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
	const [showAddFolderSheet, setShowAddFolderSheet] = useState(false);

	// The search-result context menu (its own target + anchor, distinct from the browse long-press menu).
	const [searchMenuTarget, setSearchMenuTarget] = useState<DrawerItemSummary | null>(null);
	const [searchMenuPos, setSearchMenuPos] = useState<{ x: number; y: number } | null>(null);

	const openResultMenu = (summary: DrawerItemSummary, event: React.MouseEvent<HTMLButtonElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		setSearchMenuTarget(summary);
		setSearchMenuPos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
	};

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

   // One-time long-press hint: shown once when gesture tips are enabled, then
   // remembered so it never repeats. Gated on the setting (never shown when off).
   // The overflow (⋯) button on each row is the always-present fallback.
   const areGestureHintsEnabled = useAppSettingsStore((state) => state.areGestureHintsEnabled);
   const hasSeenDrawerMenuHint = useAppSettingsStore((state) => state.hasSeenDrawerMenuHint);
   const { setHasSeenDrawerMenuHint } = useAppSettingsActions();

   useEffect(() => {
      // StrictMode invokes effect setup twice synchronously; both invocations
      // would see the same committed `hasSeenDrawerMenuHint = false` closure and
      // toast twice. Re-read the store live, and set the flag before toasting so
      // the second invoke's live read is already `true`.
      if (!areGestureHintsEnabled) return;
      if (useAppSettingsStore.getState().hasSeenDrawerMenuHint) return;
      setHasSeenDrawerMenuHint(true);
      toast(t('MobileGestureHints.drawerLongPress'));
   }, [areGestureHintsEnabled, hasSeenDrawerMenuHint, setHasSeenDrawerMenuHint, t]);

   // Drag-to-reorder (folders and items within the current folder). The drawer
   // uses the body of each row as the drag target (no dedicated grip), so the
   // TouchSensor activation delay is bumped to the platform long-press idiom
   // (500ms) - quick taps and scroll flings still fall through to their
   // normal behaviour, while a deliberate press-and-hold picks the row up.
   const DRAWER_LONG_PRESS_DELAY_MS = 500;
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

   // Undo/redo for drawer mutations (rename/move/delete/reorder/add), mirroring how
   // the character sheet exposes undo/redo via the temporal store. Any past state
   // means there is a mutation to undo; any future state means there is one to redo.
   const { canUndo, canRedo, undo, redo } = useDrawerUndoRedo();

	// Handlers
	const handleFolderLongPress = (folderId: string, folderName: string, position: { x: number; y: number }) => {
		setContextMenuTarget({ type: 'folder', id: folderId, name: folderName });
		setContextMenuPosition(position);
		setShowContextMenu(true);
	};

	const handleItemLongPress = (itemId: string, itemName: string, position: { x: number; y: number }) => {
		setContextMenuTarget({ type: 'item', id: itemId, name: itemName });
		setContextMenuPosition(position);
		setShowContextMenu(true);
	};

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
				<div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
					{isSearching ? (
						<p className="py-8 text-center text-sm text-muted-foreground">{t('Drawer.search.searching')}</p>
					) : searchResults && searchResults.length > 0 ? (
						<div className="flex flex-col gap-1">
							{searchResults.map((summary) => (
								<button
									key={summary.id}
									type="button"
									onClick={(event) => openResultMenu(summary, event)}
									className="min-h-11 w-full rounded text-left hover:bg-muted cursor-pointer"
								>
									<DrawerListRow type={summary.type} name={summary.name} game={summary.game} createdAt={summary.createdAt} updatedAt={summary.updatedAt} />
								</button>
							))}
						</div>
					) : (
						<p className="py-8 text-center text-sm text-muted-foreground">{t('Drawer.search.noMatches')}</p>
					)}
				</div>
			) : (
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				modifiers={[restrictToVerticalAxis]}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEndWithCleanup}
				onDragCancel={() => setActiveDrag(null)}
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
								onLongPress={handleFolderLongPress}
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
								onLongPress={handleItemLongPress}
								isLeftHanded={isLeftHanded}
							/>
						))}
					</SortableContext>
				</div>

				{/* Overlay snapshot of the active row, floating with the pointer */}
				<DragOverlay dropAnimation={null}>
					{activeFolder ? renderFolderOverlay(activeFolder, childCounts.get(activeFolder.id)?.folderCount ?? 0, childCounts.get(activeFolder.id)?.itemCount ?? 0, isLeftHanded) : null}
					{activeItem ? renderItemOverlay(activeItem, isCompactView, isLeftHanded) : null}
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
				isOpen={showContextMenu}
				onClose={() => {
					setShowContextMenu(false);
					setContextMenuTarget(null);
					setContextMenuPosition(null);
				}}
				target={contextMenuTarget}
				position={contextMenuPosition}
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
				isOpen={searchMenuTarget != null}
				onClose={() => { setSearchMenuTarget(null); setSearchMenuPos(null); }}
				target={searchMenuTarget ? { type: 'item', id: searchMenuTarget.id, name: searchMenuTarget.name } : null}
				position={searchMenuPos}
				onAddToCharacter={onAddToCharacter}
				onLoadCharacter={onLoadCharacter}
				onJumpTo={searchMenuTarget ? () => { navigateToFolder(searchMenuTarget.parentFolderId); clearSearch(); } : undefined}
			/>
		</div>
	);
}
