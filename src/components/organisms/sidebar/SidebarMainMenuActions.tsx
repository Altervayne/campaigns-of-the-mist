// -- React Imports --
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Icon Imports --
import { FileUp } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { SidebarButton } from '../../molecules/SidebarButton';

interface SidebarMainMenuActionsProps {
   isCollapsed: boolean;
   workspaceImportInputRef: RefObject<HTMLInputElement | null>;
}

// The MAIN_MENU cluster: import a whole workspace file.
export function SidebarMainMenuActions({ isCollapsed, workspaceImportInputRef }: SidebarMainMenuActionsProps) {
   const { t } = useTranslation();

   return (
      <motion.section layout transition={{ duration: 0.2 }} className={cn(
         "flex flex-col items-center gap-2 py-2 bg-popover border-b border-border",
         isCollapsed ? "px-0" : "px-2"
      )}>
         <SidebarButton isCollapsed={isCollapsed} onClick={() => workspaceImportInputRef.current?.click()} Icon={FileUp}>
            {t('CharacterSheetPage.SidebarMenu.importWorkspace')}
         </SidebarButton>
      </motion.section>
   );
}
