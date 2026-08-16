// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Icon Imports --
import { BookUser, Dices, Waypoints } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { SidebarButton } from '../../molecules/SidebarButton';

// -- Store and Hook Imports --
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';

interface SidebarSubmenuTogglesProps {
   isCollapsed: boolean;
   isDrawerOpen: boolean;
   onToggleDrawer: () => void;
}

// The panel toggles (Drawer + Dice Tray + Navigator) lead every context, side by side and identical wherever
// you are. Each goes muted while its panel is open.
export function SidebarSubmenuToggles({ isCollapsed, isDrawerOpen, onToggleDrawer }: SidebarSubmenuTogglesProps) {
   const { t } = useTranslation();

   // The app-wide dice tray toggles a bottom panel (reachable from any window).
   const isDiceTrayOpen = useAppSettingsStore((state) => state.diceTray.isOpen);
   const { toggleDiceTray } = useAppSettingsActions();

   // The Navigator toggles a left slide-over that crawls the portal graph (reachable from any window).
   const navigatorOpen = useAppSettingsStore((state) => state.navigatorOpen);
   const { toggleNavigator } = useAppSettingsActions();

   return (
      <motion.section layout transition={{ duration: 0.2 }} className={cn(
         "flex flex-col items-center gap-2 py-2 bg-popover border-b border-border",
         isCollapsed ? "px-0" : "px-2"
      )}>
         <SidebarButton data-tutorial="drawer-toggle" isCollapsed={isCollapsed} onClick={onToggleDrawer} variant={isDrawerOpen ? 'secondary' : 'default'} Icon={BookUser}>
            {t('Common.drawer')}
         </SidebarButton>
         <SidebarButton data-tutorial="dice-tray-button" isCollapsed={isCollapsed} onClick={toggleDiceTray} variant={isDiceTrayOpen ? 'secondary' : 'default'} Icon={Dices}>
            {t('Common.diceTray')}
         </SidebarButton>
         <SidebarButton data-tutorial="navigator-button" isCollapsed={isCollapsed} onClick={toggleNavigator} variant={navigatorOpen ? 'secondary' : 'default'} Icon={Waypoints}>
            {t('Common.navigator')}
         </SidebarButton>
      </motion.section>
   );
}
