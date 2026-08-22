// -- React Imports --
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Icon Imports --
import { X } from 'lucide-react';

// -- Component Imports --
import { DrawerMoveItemNavigator } from '@/components/organisms/drawer/DrawerMoveItemNavigator';

// -- Type Imports --
import type { ActiveAction } from '@/hooks/drawer/useDrawerActionState';
import type { PendingDrawerItem } from '@/lib/stores/drawerStore';



interface DrawerModificationWindowProps {
   action: ActiveAction;
   onClose: () => void;
   onConfirm: (value?: string) => void;
   // 'slideUp' (side panel, default) keeps the top border for the bottom sheet; 'modal' (Library) drops
   // it so it doesn't double up the centered card's own chrome, which the wrapper owns.
   variant?: 'slideUp' | 'modal';
};

export const DrawerModificationWindow = React.forwardRef<HTMLInputElement, DrawerModificationWindowProps>(
   function DrawerModificationWindow({ action, onClose, onConfirm, variant = 'slideUp' }, ref) {
      const { t } = useTranslation();

      const handleSubmit = (e: React.FormEvent) => {
         e.preventDefault();
         onConfirm(inputValue);
      };


      let initialName = (action.target && 'defaultName' in action.target) ? action.target.defaultName : action.target?.name ?? '';
      if (!initialName && action.type === 'add-item' && action.target && 'type' in action.target) {
         const itemType = (action.target as PendingDrawerItem).type;
         switch (itemType) {
            case 'CHARACTER_CARD':        initialName = t('Common.characterCard'); break;
            case 'FULL_CHARACTER_SHEET':  initialName = t('Drawer.Actions.defaultNames.fullSheet'); break;
            case 'CHARACTER_THEME':       initialName = t('Drawer.Actions.defaultNames.characterTheme'); break;
            case 'GROUP_THEME':           initialName = t('Drawer.Actions.defaultNames.groupTheme'); break;
            case 'STATUS_TRACKER':        initialName = t('Drawer.Actions.defaultNames.statusTracker'); break;
            case 'STORY_TAG_TRACKER':     initialName = t('Drawer.Actions.defaultNames.storyTagTracker'); break;
            default:                      initialName = t('Drawer.Actions.defaultNames.defaultItem'); break;
         }
      }

      const [inputValue, setInputValue] = useState(initialName);

      const isFolder = action.type.includes('folder');
      let title = '';
      let confirmText = '';
      let isDelete = false;

      switch (action.type) {
         case 'add-folder':
            title = t('Drawer.Actions.addFolderTitle');
            confirmText = t('Drawer.Actions.createFolder');
            break;

         case 'add-item':
            title = t('Drawer.Actions.nameItemTitle');
            confirmText = t('Drawer.Actions.saveChanges');
            break;

         case 'rename-folder':
            title = t('Drawer.Actions.renameFolderTitle');
            confirmText = t('Drawer.Actions.saveChanges');
            break;

         case 'rename-item':
            title = t('Drawer.Actions.renameItemTitle');
            confirmText = t('Drawer.Actions.saveChanges');
            break;

         case 'delete-folder':
            title = t('Drawer.Actions.deleteFolderTitle');
            confirmText = t('Drawer.Actions.confirmDelete');
            isDelete = true;
            break;

         case 'delete-item':
            title = t('Drawer.Actions.deleteItemTitle');
            confirmText = t('Drawer.Actions.confirmDelete');
            isDelete = true;
            break;
      }



      if (action.type === 'move-item' || action.type === 'move-folder') {
         return (
            <div className="bg-background">
               <DrawerMoveItemNavigator
                  action={action}
                  onConfirm={(destinationId) => onConfirm(destinationId)}
                  onClose={onClose}
               />
            </div>
         );
      }



      return (
         <div className={cn('bg-background p-4', variant === 'slideUp' && 'border-t')}>
            <div className="flex justify-between items-center mb-4">
               <h3 className="font-semibold">{title}</h3>
               <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer touch-target" onClick={onClose}>
                  <X className="h-4 w-4" />
               </Button>
            </div>
            {!isDelete ? (
               <form onSubmit={handleSubmit}>
                  <Label htmlFor="item-name" className="sr-only">{t('Common.name')}</Label>
                  <Input ref={ref} id="item-name" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
               </form>
            ) : (
               <p className="text-sm text-muted-foreground">{t(isFolder ? 'Drawer.Actions.deleteFolderMessage' : 'Drawer.Actions.deleteItemMessage', { name: (action.target && 'name' in action.target) ? action.target.name : '' })}</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
               <Button variant="ghost" onClick={onClose} className="cursor-pointer">{t('Common.cancel')}</Button>
               <Button variant={isDelete ? 'destructive' : 'default'} onClick={() => onConfirm(inputValue)} className="cursor-pointer">
                  {confirmText}
               </Button>
            </div>
         </div>
      );
   }
)
