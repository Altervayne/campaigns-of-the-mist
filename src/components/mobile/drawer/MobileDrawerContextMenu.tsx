// -- React Imports --
import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Component Imports --
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import MobileFolderPicker from '@/components/mobile/drawer/MobileFolderPicker';
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';

// -- Icon Imports --
import {
	Edit3,
	FolderInput,
	Download,
	Trash2,
	PlusCircle,
	CornerUpRight,
	UserRoundCheck
} from 'lucide-react';

// -- Store Imports --
import { useDrawerActions } from '@/lib/stores/drawerStore';
import { useCharacterStore } from '@/lib/stores/characterStore';

// -- Drawer Data Layer Imports --
import { exportFolderAsNestedTree, getItem } from '@/lib/drawer/drawerRepository';
import { hasDrawerItemCapability } from '@/lib/drawer/drawerItemCapabilities';

// -- Utils Imports --
import { deriveExportHandle, exportToFile, generateExportFilename, toExportableItemContent } from '@/lib/utils/export-import';

// -- Utils Imports --
import { readSafeAreaInsetBottom } from '@/lib/utils/safeArea';

// -- Type Imports --
import type { DrawerItem } from '@/lib/types/drawer';
import type { DrawerItemRecord } from '@/lib/drawer/drawerRecords';



interface MobileDrawerContextMenuProps {
	isOpen: boolean;
	onClose: () => void;
	target: { type: 'item' | 'folder'; id: string; name: string } | null;
	position?: { x: number; y: number } | null;
	onAddToCharacter?: (item: DrawerItem) => void;
	/** Loads a saved character (FULL_CHARACTER_SHEET) as the active sheet; only that type offers it. */
	onLoadCharacter?: (item: DrawerItem) => void;
	/** When set (the search sheet's result menu), adds a "Jump to folder" row atop the list; the browse
	    drawer omits it, so its menu is unchanged. */
	onJumpTo?: () => void;
}

export default function MobileDrawerContextMenu({
	isOpen,
	onClose,
	target,
	position,
	onAddToCharacter,
	onLoadCharacter,
	onJumpTo
}: MobileDrawerContextMenuProps) {
	const { t } = useTranslation();
	const character = useCharacterStore((state) => state.character);
	const {
		renameFolder,
		renameItem,
		moveFolder,
		moveItem,
		deleteFolder,
		deleteItem
	} = useDrawerActions();

	const [showRenameDialog, setShowRenameDialog] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [showFolderPicker, setShowFolderPicker] = useState(false);
	const [newName, setNewName] = useState('');

	// Resolve the targeted item's record (for export content + add-to-character).
	// Folder export needs only the id/name carried by `target`, so no folder fetch.
	const [resolvedItem, setResolvedItem] = useState<DrawerItemRecord | null>(null);
	useEffect(() => {
		// Only resolve for item targets; a folder target keeps the previous item's record. That stale value
		// is neutralized where `item` is derived (folder -> null), so no item-only control reads it.
		if (!isOpen || !target || target.type === 'folder') return;
		let cancelled = false;
		void (async () => {
			const item = await getItem(target.id);
			if (!cancelled) setResolvedItem(item ?? null);
		})();
		return () => { cancelled = true; };
	}, [isOpen, target]);

	// Finger-anchored menu position, clamped to the menu's real rendered rect.
	const menuRef = useRef<HTMLDivElement>(null);
	const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);

	// Measure the rendered menu and clamp it on-screen. The menu is min-w-55 with
	// variable height, so we read its actual rect rather than guessing a size.
	// Runs before paint so the menu never flashes at an unclamped position.
	useLayoutEffect(() => {
		if (!isOpen || !position || !menuRef.current) {
			return;
		}
		const rect = menuRef.current.getBoundingClientRect();
		const safeAreaBottom = readSafeAreaInsetBottom();
		const maxLeft = window.innerWidth - rect.width;
		const maxTop = window.innerHeight - rect.height - safeAreaBottom;
		const left = Math.max(0, Math.min(position.x, maxLeft));
		const top = Math.max(0, Math.min(position.y, maxTop));
		setMenuPosition({ left, top });
	}, [isOpen, position]);

	if (!target) return null;

	const isFolder = target.type === 'folder';
	// The targeted item record (folders carry their id/name on `target`). Null on a folder target so no
	// item-only control reads the previous item's still-resolved record - e.g. "Load character" on a folder.
	const item = isFolder ? null : resolvedItem;

	const handleRename = () => {
		setNewName(target.name);
		setShowRenameDialog(true);
	};

	const confirmRename = async () => {
		if (newName.trim()) {
			try {
				if (isFolder) {
					await renameFolder(target.id, newName.trim());
					toast.success(t('Notifications.drawer.folderRenamed'));
				} else {
					await renameItem(target.id, newName.trim());
					toast.success(t('Notifications.drawer.itemRenamed'));
				}
			} catch {
				toast.error(t('Notifications.drawer.actionFailed'));
			}
		}
		// Delay closing to allow exit animation
		setShowRenameDialog(false);
		setTimeout(onClose, 300);
	};

	const handleMove = () => {
		setShowFolderPicker(true);
	};

	const handleMoveConfirm = async (destinationFolderId: string | null) => {
		try {
			if (isFolder) {
				await moveFolder(target.id, destinationFolderId ?? undefined);
				toast.success(t('Notifications.drawer.folderMoved'));
			} else {
				await moveItem(target.id, destinationFolderId ?? undefined);
				toast.success(t('Notifications.drawer.itemMoved'));
			}
		} catch {
			toast.error(t('Notifications.drawer.actionFailed'));
		}
		setShowFolderPicker(false);
		onClose();
	};

	const handleExport = async () => {
		try {
			if (isFolder) {
				// Reassemble the folder's full subtree before exporting.
				const nestedFolder = await exportFolderAsNestedTree(target.id);
				const fileName = generateExportFilename('NEUTRAL', 'FOLDER', nestedFolder.name);
				exportToFile(nestedFolder, 'FOLDER', 'NEUTRAL', fileName);
				toast.success(t('Notifications.drawer.folderExported'));
			} else if (item) {
				const { content, type, game, name } = item;
				const exportable = toExportableItemContent(type, content);
				if (!exportable) return;
				const handle = deriveExportHandle(exportable, name);
				const fileName = generateExportFilename(game, type, handle);
				exportToFile(exportable, type, game, fileName);
				toast.success(t('Notifications.drawer.itemExported'));
			}
		} catch {
			toast.error(t('Notifications.general.exportError'));
		}
		onClose();
	};

	const handleDelete = () => {
		setShowDeleteConfirm(true);
	};

	const confirmDelete = async () => {
		try {
			if (isFolder) {
				await deleteFolder(target.id);
				toast.success(t('Notifications.drawer.folderDeleted'));
			} else {
				await deleteItem(target.id);
				toast.success(t('Notifications.drawer.itemDeleted'));
			}
		} catch {
			toast.error(t('Notifications.drawer.actionFailed'));
		}
		// Delay closing to allow exit animation
		setShowDeleteConfirm(false);
		setTimeout(onClose, 300);
	};

	const handleAddToCharacter = () => {
		if (item && onAddToCharacter) {
			onAddToCharacter(item);
			onClose();
		}
	};

	const handleLoadCharacter = () => {
		if (item && onLoadCharacter) {
			onLoadCharacter(item);
			onClose();
		}
	};

	// A saved character loads INTO the sheet (replacing the active one) - no game-match needed. Adding to
	// the loaded character is offered only by the types that declare it, and needs a character present.
	// Both key off `item`, which is null on a folder target, so neither offers on a folder.
	const isSheetItem = item?.type === 'FULL_CHARACTER_SHEET';
	const canLoadCharacter = isSheetItem && !!onLoadCharacter;
	const canAddToCharacter = hasDrawerItemCapability(item?.type, 'ADD_TO_CHARACTER')
		&& !!character
		&& !!onAddToCharacter;

	// Position the menu at the clamped coordinates once measured; before the
	// layout effect runs, anchor at the raw finger position (size is unaffected
	// by position, so the pre-clamp measurement is still accurate).
	// The stacking level comes from the `layer-panel` class on the element; only
	// positioning is set inline here.
	const menuStyle: CSSProperties | undefined = position ? {
		position: 'fixed',
		left: `${menuPosition ? menuPosition.left : position.x}px`,
		top: `${menuPosition ? menuPosition.top : position.y}px`,
	} : undefined;

	if (!isOpen) return null;

	return (
		<>
         {/* Backdrop */}
         <div
            className="fixed inset-0 bg-black/20 layer-backdrop"
            onClick={onClose}
         />

         {/* Floating Context Menu */}
         <div
            ref={menuRef}
            style={menuStyle}
            className="bg-card border border-border rounded-lg shadow-lg overflow-hidden min-w-55 layer-panel"
         >
            <div className="p-2 border-b border-border bg-muted/50">
               <p className="text-sm font-medium truncate px-2">{target?.name}</p>
            </div>

            <div className="flex flex-col p-1">
               {/* Jump to folder (search results only): navigate browse to the item's folder, then leave search. */}
               {onJumpTo && (
                  <Button
                     variant="ghost"
                     className="w-full justify-start cursor-pointer"
                     onClick={() => { onJumpTo(); onClose(); }}
                  >
                     <CornerUpRight className="w-4 h-4 mr-3" />
                     {t('Drawer.search.jumpTo')}
                  </Button>
               )}

               {/* Load character in sheet (a saved character only): make it the active sheet. */}
               {canLoadCharacter && (
                  <Button
                     variant="ghost"
                     className="w-full justify-start cursor-pointer"
                     onClick={handleLoadCharacter}
                  >
                     <UserRoundCheck className="w-4 h-4 mr-3" />
                     {t('Drawer.Actions.loadCharacter')}
                  </Button>
               )}

               {/* Add to Character (types declaring ADD_TO_CHARACTER, if a character is loaded) */}
               {canAddToCharacter && (
                  <Button
                     variant="ghost"
                     className="w-full justify-start cursor-pointer"
                     onClick={handleAddToCharacter}
                  >
                     <PlusCircle className="w-4 h-4 mr-3" />
                     {t('Drawer.Actions.addToCharacter')}
                  </Button>
               )}

               {/* Rename */}
               <Button
                  variant="ghost"
                  className="w-full justify-start cursor-pointer"
                  onClick={handleRename}
               >
                  <Edit3 className="w-4 h-4 mr-3" />
                  {t('Drawer.Actions.rename')}
               </Button>

               {/* Move to */}
               <Button
                  variant="ghost"
                  className="w-full justify-start cursor-pointer"
                  onClick={handleMove}
               >
                  <FolderInput className="w-4 h-4 mr-3" />
                  {t('Common.move')}
               </Button>

               {/* Export */}
               <Button
                  variant="ghost"
                  className="w-full justify-start cursor-pointer"
                  onClick={handleExport}
               >
                  <Download className="w-4 h-4 mr-3" />
                  {t('Drawer.Actions.export')}
               </Button>

               {/* Delete */}
               <Button
                  variant="ghost"
                  className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                  onClick={handleDelete}
               >
                  <Trash2 className="w-4 h-4 mr-3" />
                  {t('Drawer.Actions.delete')}
               </Button>
            </div>
         </div>

         {/* Rename Bottom Sheet */}
         <MobileBottomSheet
            isOpen={showRenameDialog}
            onClose={() => {
               setShowRenameDialog(false);
               setTimeout(onClose, 300);
            }}
         >
                  <div className="p-4 pb-3 border-b border-border">
                     <h2 className="text-lg font-semibold">
                        {isFolder
                           ? t('Drawer.Actions.rename')
                           : t('Drawer.Actions.rename')}
                     </h2>
                  </div>

                  <div className="p-4 space-y-4">
                     <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder={t('Common.name')}
                        onKeyDown={(e) => {
                           if (e.key === 'Enter') {
                              confirmRename();
                           }
                        }}
                        autoFocus
                        className="text-base"
                     />

                     <div className="flex gap-2 pb-safe">
                        <Button
                           variant="outline"
                           onClick={() => {
                              setShowRenameDialog(false);
                              setTimeout(onClose, 300);
                           }}
                           className="flex-1 cursor-pointer h-11"
                        >
                           {t('Common.cancel')}
                        </Button>
                        <Button
                           onClick={confirmRename}
                           disabled={!newName.trim()}
                           className="flex-1 cursor-pointer h-11"
                        >
                           {t('Drawer.Actions.confirm')}
                        </Button>
                     </div>
                  </div>
         </MobileBottomSheet>

         {/* Folder Picker for Move */}
         <MobileFolderPicker
            isOpen={showFolderPicker}
            onClose={() => {
               setShowFolderPicker(false);
               setTimeout(onClose, 300);
            }}
            onSelect={handleMoveConfirm}
            excludeFolderId={isFolder ? target.id : undefined}
         />

         {/* Delete Confirmation Bottom Sheet */}
         <MobileBottomSheet
            isOpen={showDeleteConfirm}
            onClose={() => {
               setShowDeleteConfirm(false);
               setTimeout(onClose, 300);
            }}
         >
                     <div className="p-4 pb-3 border-b border-border">
                        <h2 className="text-lg font-semibold">
                           {isFolder
                              ? t('Drawer.Actions.deleteFolderTitle')
                              : t('Drawer.Actions.deleteItemTitle')}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-2">
                           {isFolder
                              ? t('Drawer.Actions.deleteFolderMessage')
                              : t('Drawer.Actions.deleteItemMessage')}
                        </p>
                     </div>

                     <div className="p-4">
                        <div className="flex gap-2 pb-safe">
                           <Button
                              variant="outline"
                              onClick={() => {
                                 setShowDeleteConfirm(false);
                                 setTimeout(onClose, 300);
                              }}
                              className="flex-1 cursor-pointer h-11"
                           >
                              {t('Common.cancel')}
                           </Button>
                           <Button
                              onClick={confirmDelete}
                              variant="destructive"
                              className="flex-1 cursor-pointer h-11"
                           >
                              {t('Drawer.Actions.confirmDelete')}
                           </Button>
                        </div>
                     </div>
         </MobileBottomSheet>
		</>
	);
}
