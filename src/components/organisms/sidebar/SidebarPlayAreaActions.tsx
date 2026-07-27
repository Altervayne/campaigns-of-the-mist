// -- React Imports --
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Icon Imports --
import { Edit, Save, Download, Upload, Layers, Trash2, SaveAll, RefreshCw } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { SidebarButton } from '../../molecules/SidebarButton';

interface SidebarPlayAreaActionsProps {
   isCollapsed: boolean;
   isEditing: boolean;
   canReset: boolean;
   onToggleEditing: () => void;
   saveCharacterToDrawer: () => void;
   saveCharacterAsToDrawer: () => void;
   onExportCharacter: () => void;
   characterImportInputRef: RefObject<HTMLInputElement | null>;
   characterUpdateInputRef: RefObject<HTMLInputElement | null>;
   componentImportInputRef: RefObject<HTMLInputElement | null>;
   onOpenResetDialog: () => void;
}

// The PLAY_AREA cluster: edit toggle, the character save/export/import actions, and the destructive reset.
export function SidebarPlayAreaActions({ isCollapsed, isEditing, canReset, onToggleEditing, saveCharacterToDrawer, saveCharacterAsToDrawer, onExportCharacter, characterImportInputRef, characterUpdateInputRef, componentImportInputRef, onOpenResetDialog }: SidebarPlayAreaActionsProps) {
   const { t } = useTranslation();

   return (
      <>
         <motion.section data-tutorial="menu-edit-drawer-buttons" layout transition={{ duration: 0.2 }} className={cn(
            "flex flex-col items-center gap-2 py-2 bg-popover border-b border-border",
            isCollapsed ? "px-0" : "px-2"
         )}>
            <SidebarButton data-tutorial="edit-mode-toggle" isCollapsed={isCollapsed} onClick={onToggleEditing} variant={isEditing ? 'secondary' : 'default'} Icon={Edit}>
               {t('CharacterSheetPage.SidebarMenu.editMode')}
            </SidebarButton>
         </motion.section>

         <motion.section layout transition={{ duration: 0.2 }} className={cn(
            "flex flex-col items-center gap-2 p-2 bg-popover border-b border-border"
         )}>
            <SidebarButton data-tutorial="save-character-button" isCollapsed={isCollapsed} onClick={saveCharacterToDrawer} Icon={Save}>
               {t('CharacterSheetPage.SidebarMenu.saveToDrawer')}
            </SidebarButton>
            <SidebarButton data-tutorial="save-character-as-button" isCollapsed={isCollapsed} onClick={saveCharacterAsToDrawer} Icon={SaveAll}>
               {t('CharacterSheetPage.SidebarMenu.saveToDrawerAs')}
            </SidebarButton>
            <SidebarButton data-tutorial="export-character-button" isCollapsed={isCollapsed} onClick={onExportCharacter} Icon={Upload}>
               {t('CharacterSheetPage.SidebarMenu.exportCharacter')}
            </SidebarButton>
            <SidebarButton data-tutorial="import-character-button" isCollapsed={isCollapsed} onClick={() => characterImportInputRef.current?.click()} Icon={Download}>
               {t('CharacterSheetPage.SidebarMenu.importCharacter')}
            </SidebarButton>
            <SidebarButton isCollapsed={isCollapsed} onClick={() => characterUpdateInputRef.current?.click()} Icon={RefreshCw}>
               {t('CharacterSheetPage.SidebarMenu.updateCharacter')}
            </SidebarButton>
            <SidebarButton data-tutorial="import-component-button" isCollapsed={isCollapsed} onClick={() => componentImportInputRef.current?.click()} Icon={Layers}>
               {t('CharacterSheetPage.SidebarMenu.importComponent')}
            </SidebarButton>
         </motion.section>

         <motion.section layout transition={{ duration: 0.2 }} className={cn(
            "flex flex-col items-center gap-2 p-2 bg-popover border-b border-border"
         )}>
            <SidebarButton data-tutorial="reset-character-button" disabled={!canReset} variant="destructive" isCollapsed={isCollapsed} onClick={onOpenResetDialog} Icon={Trash2}>
               {t('CharacterSheetPage.SidebarMenu.resetCharacter')}
            </SidebarButton>
         </motion.section>
      </>
   );
}
