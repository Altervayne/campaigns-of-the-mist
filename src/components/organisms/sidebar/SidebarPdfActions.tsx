// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Icon Imports --
import { Upload, Highlighter } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { SidebarButton } from '../../molecules/SidebarButton';

interface SidebarPdfActionsProps {
   isCollapsed: boolean;
   onExportPdf: () => void;
   onExportAnnotations: () => void;
}

// The PDF cluster: export the raw original file, or just its markup.
export function SidebarPdfActions({ isCollapsed, onExportPdf, onExportAnnotations }: SidebarPdfActionsProps) {
   const { t } = useTranslation();

   return (
      <motion.section layout transition={{ duration: 0.2 }} className={cn(
         "flex flex-col items-center gap-2 p-2 bg-popover border-b border-border"
      )}>
         <SidebarButton isCollapsed={isCollapsed} onClick={onExportPdf} Icon={Upload}>
            {t('WorkspacePage.SidebarMenu.exportPdf')}
         </SidebarButton>
         <SidebarButton isCollapsed={isCollapsed} onClick={onExportAnnotations} Icon={Highlighter}>
            {t('WorkspacePage.SidebarMenu.exportPdfAnnotations')}
         </SidebarButton>
      </motion.section>
   );
}
