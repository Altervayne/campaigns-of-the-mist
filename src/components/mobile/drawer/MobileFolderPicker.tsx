// -- React Imports --
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Button } from '@/components/ui/button';
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';
import { FolderCountLabel } from '@/components/mobile/shared/FolderCountLabel';

// -- Icon Imports --
import { Folder, Home, ChevronRight } from 'lucide-react';

// -- Drawer Data Layer Imports --
import { getBreadcrumbPath, getChildCountsForFolders, getFolderChildren, isFolderSelfOrDescendant } from '@/lib/drawer/drawerRepository';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { DrawerFolderRecord } from '@/lib/drawer/drawerRecords';



interface MobileFolderPickerProps {
	isOpen: boolean;
	onClose: () => void;
	onSelect: (folderId: string | null) => void;
	excludeFolderId?: string; // Can't move folder into itself or its children
}

export default function MobileFolderPicker({
	isOpen,
	onClose,
	onSelect,
	excludeFolderId
}: MobileFolderPickerProps) {
	const { t } = useTranslation();

	// State for navigating within the picker, loaded per-folder from the store.
	const [pickerFolderId, setPickerFolderId] = useState<string | null>(null);
	const [availableFolders, setAvailableFolders] = useState<DrawerFolderRecord[]>([]);
	const [breadcrumbPath, setBreadcrumbPath] = useState<DrawerFolderRecord[]>([]);
	const [childCounts, setChildCounts] = useState<Map<string, { folderCount: number; itemCount: number }>>(new Map());

	// Load the browsed folder's subfolders, breadcrumb, and child counts. When a
	// folder is being moved, exclude it and its descendants (can't move into self).
	useEffect(() => {
		if (!isOpen) return;
		let cancelled = false;
		void (async () => {
			const [{ folders }, breadcrumb] = await Promise.all([
				getFolderChildren(pickerFolderId),
				getBreadcrumbPath(pickerFolderId),
			]);

			let visibleFolders = folders;
			if (excludeFolderId) {
				const excluded = await Promise.all(folders.map((folder) => isFolderSelfOrDescendant(folder.id, excludeFolderId)));
				visibleFolders = folders.filter((_, index) => !excluded[index]);
			}

			const counts = await getChildCountsForFolders(visibleFolders.map((folder) => folder.id));
			if (!cancelled) {
				setAvailableFolders(visibleFolders);
				setBreadcrumbPath(breadcrumb);
				setChildCounts(counts);
			}
		})();
		return () => { cancelled = true; };
	}, [isOpen, pickerFolderId, excludeFolderId]);

	const handleNavigate = (folderId: string | null) => {
		setPickerFolderId(folderId);
	};

	const handleSelectCurrent = () => {
		onSelect(pickerFolderId);
		// Reset picker state immediately, onClose will be called by parent after animation
		setPickerFolderId(null);
		onClose();
	};

	const handleCancel = () => {
		// Reset picker state immediately, onClose will be called by parent after animation
		setPickerFolderId(null);
		onClose();
	};

	return (
		<MobileBottomSheet isOpen={isOpen} onClose={handleCancel} fullHeight>
                  <div className="p-4 pb-3 border-b border-border shrink-0">
                     <h2 className="text-lg font-semibold">
                        {t('Drawer.Actions.selectFolder')}
                     </h2>
                  </div>

                  {/* Folder list */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                     {availableFolders.length === 0 && (
                        <div className="text-center text-muted-foreground py-8">
                           {t('Drawer.noSubfolders')}
                        </div>
                     )}

                     {availableFolders.map((folder) => (
                        <button
                           key={folder.id}
                           onClick={() => handleNavigate(folder.id)}
                           className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted transition-colors cursor-pointer"
                        >
                           <Folder className="w-5 h-5 text-primary shrink-0" />
                           <div className="flex-1 min-w-0 text-left">
                              <p className="font-medium text-foreground truncate">
                                 {folder.name}
                              </p>
                              <FolderCountLabel folders={childCounts.get(folder.id)?.folderCount ?? 0} items={childCounts.get(folder.id)?.itemCount ?? 0} />
                           </div>
                        </button>
                     ))}
                  </div>

                  {/* Breadcrumbs */}
                  <div className="flex items-center gap-1 overflow-x-auto py-2 px-4 border-t border-border scrollbar-hide shrink-0">
                     <button
                        onClick={() => handleNavigate(null)}
                        className={cn(
                           "flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0",
                           pickerFolderId === null
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                     >
                        <Home className="w-4 h-4" />
                        <span>{t('Drawer.root')}</span>
                     </button>

                     {breadcrumbPath.map((folder, index) => {
                        const isLast = index === breadcrumbPath.length - 1;

                        return (
                           <div key={folder.id} className="flex items-center gap-1 shrink-0">
                              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                              <button
                                 onClick={() => handleNavigate(folder.id)}
                                 className={cn(
                                    "px-2 py-1 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                                    isLast
                                       ? "bg-primary text-primary-foreground"
                                       : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                 )}
                              >
                                 {folder.name}
                              </button>
                           </div>
                        );
                     })}
                  </div>

                  {/* Action buttons */}
                  <div className="p-4 border-t border-border flex gap-2 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                     <Button
                        variant="outline"
                        onClick={handleCancel}
                        className="flex-1 cursor-pointer h-11"
                     >
                        {t('Common.cancel')}
                     </Button>
                     <Button
                        onClick={handleSelectCurrent}
                        className="flex-1 cursor-pointer h-11"
                     >
                        {pickerFolderId
                           ? t('Drawer.selectThisFolder')
                           : t('Drawer.Actions.selectRoot')}
                     </Button>
                  </div>
		</MobileBottomSheet>
	);
}
