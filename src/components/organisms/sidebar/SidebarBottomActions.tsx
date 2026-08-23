// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Icon Imports --
import { SquareMenu, Settings, Sparkles, LifeBuoy } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { SidebarButton } from '../../molecules/SidebarButton';

// -- Store and Hook Imports --
import { useHasUnreadPatchNotes } from '@/hooks/useHasUnreadPatchNotes';

type WindowTypes = 'MAIN_MENU' | 'PLAY_AREA' | 'BOARD' | 'NOTE';

interface SidebarBottomActionsProps {
   isCollapsed: boolean;
   activeWindow: WindowTypes;
   onOpenMenu: () => void;
   onOpenSettings: () => void;
   onOpenWhatsNew: () => void;
   onOpenHelp: () => void;
}

// The bottom cluster: the Open-menu navigation action plus the Settings / What's-new / Help meta trio.
export function SidebarBottomActions({ isCollapsed, activeWindow, onOpenMenu, onOpenSettings, onOpenWhatsNew, onOpenHelp }: SidebarBottomActionsProps) {
   const { t } = useTranslation();

   // The New! dot rides the What's-new door until the user opens that section.
   const hasUnreadPatchNotes = useHasUnreadPatchNotes();

   return (
      <div className="flex flex-col shrink-0 w-full">
         {/* "Open menu" is a navigation action (leave the sheet/board, go home), set
             apart from the meta utilities below by a divider. It has nowhere to go
             from the main menu itself, so it shows in the play area and on a board. */}
         { (activeWindow === 'PLAY_AREA' || activeWindow === 'BOARD' || activeWindow === 'NOTE') &&
            <motion.section layout transition={{ duration: 0.2 }} className={cn(
               "flex flex-col items-center gap-2 p-2 bg-card border-t-2 border-b border-border"
            )}>
               <SidebarButton data-tutorial="open-menu-button" isCollapsed={isCollapsed} onClick={onOpenMenu} Icon={SquareMenu}>
                  {t('WorkspacePage.SidebarMenu.openMenu')}
               </SidebarButton>
            </motion.section>
         }
         {/* The trio anchors the bottom region with the top border when the Open-menu
             section above is hidden. */}
         <motion.section layout transition={{ duration: 0.2 }} className={cn(
            "flex flex-col items-center gap-2 p-2 bg-card",
            activeWindow === 'MAIN_MENU' && "border-t-2 border-border"
         )}>
            <SidebarButton data-tutorial="settings-button" isCollapsed={isCollapsed} onClick={onOpenSettings} Icon={Settings}>
               {t('WorkspacePage.SidebarMenu.settings')}
            </SidebarButton>
            {/* What's new carries the New! dot in its corner until the section is opened. */}
            <div className="relative">
               <SidebarButton data-tutorial="whats-new-button" isCollapsed={isCollapsed} onClick={onOpenWhatsNew} Icon={Sparkles}>
                  {t('Common.whatSNew')}
               </SidebarButton>
               {hasUnreadPatchNotes && (
                  <span className="pointer-events-none absolute right-2 top-2 size-2 rounded-full bg-primary" aria-hidden />
               )}
            </div>
            <SidebarButton data-tutorial="help-button" isCollapsed={isCollapsed} onClick={onOpenHelp} Icon={LifeBuoy}>
               {t('Common.help')}
            </SidebarButton>
         </motion.section>
      </div>
   );
}
