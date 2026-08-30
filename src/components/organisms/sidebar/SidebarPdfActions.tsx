// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Icon Imports --
import { Save, Upload, Highlighter, FileDown } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { SidebarButton } from '../../molecules/SidebarButton';

interface SidebarPdfActionsProps {
   isCollapsed: boolean;
   onSaveToDrawer: () => void;
   onExportPdf: () => void;
   onExportAnnotations: () => void;
   onApplyAnnotations: () => void;
}

// The PDF cluster: keep the pdf in the drawer, export the raw original file, export just its markup, or apply a shared markup file.
export function SidebarPdfActions({ isCollapsed, onSaveToDrawer, onExportPdf, onExportAnnotations, onApplyAnnotations }: SidebarPdfActionsProps) {
   const { t } = useTranslation();

   return (
      <motion.section layout transition={{ duration: 0.2 }} className={cn(
         "flex flex-col items-center gap-2 p-2 bg-popover border-b border-border"
      )}>
         <SidebarButton isCollapsed={isCollapsed} onClick={onSaveToDrawer} Icon={Save}>
            {t('WorkspacePage.SidebarMenu.savePdfToDrawer')}
         </SidebarButton>
         <SidebarButton isCollapsed={isCollapsed} onClick={onExportPdf} Icon={Upload}>
            {t('WorkspacePage.SidebarMenu.exportPdf')}
         </SidebarButton>
         <SidebarButton isCollapsed={isCollapsed} onClick={onExportAnnotations} Icon={Highlighter}>
            {t('WorkspacePage.SidebarMenu.exportPdfAnnotations')}
         </SidebarButton>
         <SidebarButton isCollapsed={isCollapsed} onClick={onApplyAnnotations} Icon={FileDown}>
            {t('WorkspacePage.SidebarMenu.applyPdfAnnotations')}
         </SidebarButton>
      </motion.section>
   );
}
