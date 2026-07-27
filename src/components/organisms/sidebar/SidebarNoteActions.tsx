// -- React Imports --
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Icon Imports --
import { Save, Download, Upload, SaveAll, RefreshCw, FileUp } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { SidebarButton } from '../../molecules/SidebarButton';

interface SidebarNoteActionsProps {
   isCollapsed: boolean;
   saveNoteToDrawer: () => void;
   saveNoteAsToDrawer: () => void;
   onExportNote: () => void;
   onExportNoteMarkdown: () => void;
   noteImportInputRef: RefObject<HTMLInputElement | null>;
   noteUpdateInputRef: RefObject<HTMLInputElement | null>;
}

// The NOTE cluster: the note save/export/import actions plus the markdown export.
export function SidebarNoteActions({ isCollapsed, saveNoteToDrawer, saveNoteAsToDrawer, onExportNote, onExportNoteMarkdown, noteImportInputRef, noteUpdateInputRef }: SidebarNoteActionsProps) {
   const { t } = useTranslation();

   return (
      <motion.section layout transition={{ duration: 0.2 }} className={cn(
         "flex flex-col items-center gap-2 p-2 bg-popover border-b border-border"
      )}>
         <SidebarButton isCollapsed={isCollapsed} onClick={saveNoteToDrawer} Icon={Save}>
            {t('CharacterSheetPage.SidebarMenu.saveNoteToDrawer')}
         </SidebarButton>
         <SidebarButton isCollapsed={isCollapsed} onClick={saveNoteAsToDrawer} Icon={SaveAll}>
            {t('CharacterSheetPage.SidebarMenu.saveNoteToDrawerAs')}
         </SidebarButton>
         <SidebarButton isCollapsed={isCollapsed} onClick={onExportNote} Icon={Upload}>
            {t('CharacterSheetPage.SidebarMenu.exportNote')}
         </SidebarButton>
         <SidebarButton isCollapsed={isCollapsed} onClick={() => noteImportInputRef.current?.click()} Icon={Download}>
            {t('CharacterSheetPage.SidebarMenu.importNote')}
         </SidebarButton>
         <SidebarButton isCollapsed={isCollapsed} onClick={onExportNoteMarkdown} Icon={FileUp}>
            {t('CharacterSheetPage.SidebarMenu.exportNoteMarkdown')}
         </SidebarButton>
         <SidebarButton isCollapsed={isCollapsed} onClick={() => noteUpdateInputRef.current?.click()} Icon={RefreshCw}>
            {t('CharacterSheetPage.SidebarMenu.updateNote')}
         </SidebarButton>
      </motion.section>
   );
}
