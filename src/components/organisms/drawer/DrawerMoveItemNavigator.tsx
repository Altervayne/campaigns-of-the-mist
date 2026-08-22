// -- React Imports --
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { Folder, ArrowLeft, ArrowUpToLine } from 'lucide-react';

// -- Component Imports --
import { Breadcrumb } from '@/components/molecules/Breadcrumbs';

// -- Drawer Data Layer Imports --
import { getBreadcrumbPath, getFolderChildren } from '@/lib/drawer/drawerRepository';
import { DRAWER_ROOT_PARENT_ID } from '@/lib/drawer/drawerRecords';

// -- Type Imports --
import type { ActiveAction } from '@/hooks/drawer/useDrawerActionState';
import type { DrawerFolderRecord } from '@/lib/drawer/drawerRecords';



export function DrawerMoveItemNavigator({ action, onConfirm, onClose }: { action: ActiveAction, onConfirm: (destinationId?: string) => void, onClose: () => void }) {
   const { t } = useTranslation();
   const [currentNavFolderId, setCurrentNavFolderId] = useState<string | null>(null);
   const [childFolders, setChildFolders] = useState<DrawerFolderRecord[]>([]);
   const [breadcrumbPath, setBreadcrumbPath] = useState<DrawerFolderRecord[]>([]);

   // The action target is a flat record (or a content-free search summary) carrying its own parent id
   // - no tree walk needed. Folders/items/summaries all carry `name`; a pending dropped item does not.
   const itemToMove = action.target && 'name' in action.target ? action.target : null;
   const parentOfItemToMoveId = itemToMove
      ? (itemToMove.parentFolderId === DRAWER_ROOT_PARENT_ID ? null : itemToMove.parentFolderId)
      : null;

   // Load the browsed folder's subfolders and breadcrumb on navigation.
   useEffect(() => {
      let cancelled = false;
      void (async () => {
         const [{ folders }, breadcrumb] = await Promise.all([
            getFolderChildren(currentNavFolderId),
            getBreadcrumbPath(currentNavFolderId),
         ]);
         if (!cancelled) {
            setChildFolders(folders);
            setBreadcrumbPath(breadcrumb);
         }
      })();
      return () => { cancelled = true; };
   }, [currentNavFolderId]);

   const parentOfCurrentNavId = breadcrumbPath.length >= 2 ? breadcrumbPath[breadcrumbPath.length - 2].id : null;

   return (
      <div className="flex flex-col h-150">
         <header className="p-4 border-y">
            <div className="flex justify-between items-center mb-2">
               <div>
                  <h3 className="font-semibold">{(action.type == 'move-folder') && t('Drawer.Actions.moveFolderTitle')}{(action.type == 'move-item') && t('Drawer.Actions.moveItemTitle')}</h3>
                  <p className="text-sm text-muted-foreground">{`${t('Drawer.Actions.moveVerb')}:  ${itemToMove?.name ?? t('Drawer.movingUnknown')}`}</p>
               </div>
               {currentNavFolderId && (
                  <div onClick={() => setCurrentNavFolderId(null)} className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-muted cursor-pointer shrink-0 coarse:size-11" role="button" aria-label={t('Drawer.backToRoot')}>
                        <ArrowUpToLine className="h-5 w-5" />
                  </div>
               )}
            </div>

            <div className="mt-2 flex items-center gap-2">
               <Breadcrumb path={breadcrumbPath} onNavigate={setCurrentNavFolderId} />
            </div>
         </header>

         <div className="grow overflow-y-auto p-2">

            {currentNavFolderId && (
               <div onClick={() => setCurrentNavFolderId(parentOfCurrentNavId)} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                  <ArrowLeft className="h-6 w-6" /> <span>{t('Drawer.Actions.moveUp')}</span>
               </div>
            )}
            {childFolders.map(folder => {
               // Hide the folder being moved so it cannot be moved into itself.
               if (action.type === 'move-folder' && folder.id === itemToMove?.id) {
                  return null;
               }
               return (
                  <div
                     key={folder.id}
                     onClick={() => setCurrentNavFolderId(folder.id)}
                     className="flex px-2 h-10 items-center gap-2 truncate rounded hover:bg-muted"
                  >
                     <Folder className="h-6 w-6 shrink-0 text-muted-foreground"/>
                     <span className="truncate font-medium text-sm">{folder.name}</span>
                  </div>
               );
            })}
         </div>

         <footer className="p-4 border-t flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose} className="cursor-pointer">{t('Common.cancel')}</Button>
            <Button
               onClick={() => onConfirm(currentNavFolderId ?? undefined)}
               disabled={parentOfItemToMoveId === currentNavFolderId}
            >
               {t('Drawer.Actions.moveHere')}
            </Button>
         </footer>
      </div>
   );
}
