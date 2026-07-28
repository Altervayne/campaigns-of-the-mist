// -- Store Imports --
import { useAppGeneralStateActions, useAppGeneralStateStore } from '@/lib/stores/appGeneralStateStore';
import { useAppSettingsActions, useAppSettingsStore } from '@/lib/stores/appSettingsStore';



/**
 * Reads the app-shell chrome: the drawer / sidebar / Navigator / edit-mode / settings flags, the actions
 * that drive them, and the two values derived from them.
 *
 * One selector call per value, on purpose. A single selector returning an object hands back a fresh
 * reference on every write to either store, which re-renders the whole shell - including mid-drag - for
 * writes it does not read.
 *
 * @returns The chrome flags, the actions the shell hands to the sidebar and the palette, the settings-hub
 *   opener, and whether trackers are currently editable.
 */
export function useSheetChromeState() {
   const isCompactDrawer = useAppSettingsStore((state) => state.isCompactDrawer);
   const isTrackersAlwaysEditable = useAppSettingsStore((state) => state.isTrackersAlwaysEditable);
   const isDrawerOpen = useAppGeneralStateStore((state) => state.isDrawerOpen);
   const isDrawerExpanded = useAppGeneralStateStore((state) => state.isDrawerExpanded);
   const isSidebarCollapsed = useAppSettingsStore((state) => state.isSidebarCollapsed);
   const navigatorOpen = useAppSettingsStore((state) => state.navigatorOpen);
   const isEditing = useAppGeneralStateStore((state) => state.isEditing);
   const isSettingsOpen = useAppGeneralStateStore((state) => state.isSettingsOpen);
   const { setDrawerOpen, setIsEditing, setSettingsOpen, setSettingsInitialSection } = useAppGeneralStateActions();
   const { toggleSidebarCollapsed, toggleNavigator } = useAppSettingsActions();

   // The three sidebar doors all open the one hub, each deep-linked to its section (Settings lands on the default).
   const openSettingsHub = (section: 'general' | 'whatsNew' | 'learn') => {
      setSettingsInitialSection(section === 'general' ? null : section);
      setSettingsOpen(true);
   };

   const areTrackersEditable = isEditing || isTrackersAlwaysEditable;

   return {
      isCompactDrawer,
      isDrawerOpen,
      isDrawerExpanded,
      isSidebarCollapsed,
      navigatorOpen,
      isEditing,
      isSettingsOpen,
      setDrawerOpen,
      setIsEditing,
      setSettingsOpen,
      toggleSidebarCollapsed,
      toggleNavigator,
      openSettingsHub,
      areTrackersEditable,
   };
}
