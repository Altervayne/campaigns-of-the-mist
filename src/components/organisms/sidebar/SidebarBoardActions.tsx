// -- React Imports --
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Icon Imports --
import { Save, Download, Upload, SaveAll, RefreshCw } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { SidebarButton } from '../../molecules/SidebarButton';
import { ClearBoardControl } from '../../molecules/ClearBoardControl';

interface SidebarBoardActionsProps {
   isCollapsed: boolean;
   saveBoardToDrawer: () => void;
   saveBoardAsToDrawer: () => void;
   onExportBoard: () => void;
   boardImportInputRef: RefObject<HTMLInputElement | null>;
   boardUpdateInputRef: RefObject<HTMLInputElement | null>;
}

// The BOARD cluster: the board save/export/import actions plus the clear-board control.
export function SidebarBoardActions({ isCollapsed, saveBoardToDrawer, saveBoardAsToDrawer, onExportBoard, boardImportInputRef, boardUpdateInputRef }: SidebarBoardActionsProps) {
   const { t } = useTranslation();

   return (
      <>
         <motion.section layout transition={{ duration: 0.2 }} className={cn(
            "flex flex-col items-center gap-2 p-2 bg-popover border-b border-border"
         )}>
            <SidebarButton isCollapsed={isCollapsed} onClick={saveBoardToDrawer} Icon={Save}>
               {t('WorkspacePage.SidebarMenu.saveBoardToDrawer')}
            </SidebarButton>
            <SidebarButton isCollapsed={isCollapsed} onClick={saveBoardAsToDrawer} Icon={SaveAll}>
               {t('WorkspacePage.SidebarMenu.saveBoardToDrawerAs')}
            </SidebarButton>
            <SidebarButton isCollapsed={isCollapsed} onClick={onExportBoard} Icon={Upload}>
               {t('WorkspacePage.SidebarMenu.exportBoard')}
            </SidebarButton>
            <SidebarButton isCollapsed={isCollapsed} onClick={() => boardImportInputRef.current?.click()} Icon={Download}>
               {t('WorkspacePage.SidebarMenu.importBoard')}
            </SidebarButton>
            <SidebarButton isCollapsed={isCollapsed} onClick={() => boardUpdateInputRef.current?.click()} Icon={RefreshCw}>
               {t('WorkspacePage.SidebarMenu.updateBoard')}
            </SidebarButton>
         </motion.section>

         <motion.section layout transition={{ duration: 0.2 }} className={cn(
            "flex flex-col items-center gap-2 p-2 bg-popover border-b border-border"
         )}>
            <ClearBoardControl isCollapsed={isCollapsed} />
         </motion.section>
      </>
   );
}
