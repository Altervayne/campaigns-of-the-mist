

// -- React Imports --
import React from 'react';

// -- Hook Imports --
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '@/hooks/useThemeMode';
import { useDeviceType } from '@/hooks/useDeviceType';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Icon Imports --
import { FileUp, FileText, Import, Save, SaveAll, Pencil, Settings, Sparkles, Megaphone, Info, GraduationCap, PanelLeft, PanelLeftOpen, BookOpen, FlipHorizontal, Type, Sun, Moon, Palette, SwatchBook, Undo2, Redo2, FilePlus, ListPlus, ListTree, Dices, UserPlus, LayoutGrid, Layers, Combine, Link, X, ChevronRight, ChevronLeft, Skull, NotebookText, NotebookPen, MousePointer2, Pen, Slash, Waypoints, Pentagon, Shapes, BoxSelect, Eraser, Brush, Highlighter, MessagesSquare, Square, Grip, Grid3x3, Rows3, Columns3, Hexagon, LocateFixed, FolderSearch, DatabaseBackup, ZoomIn, ZoomOut, RotateCcw, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Search, Image as ImageIcon } from 'lucide-react';

// -- Utils Imports --
import { exportCharacterSheet, exportDrawer, exportToFile, generateExportFilename } from '@/lib/utils/export-import';
import { exportFullBackup } from '@/lib/backup/fullBackup';
import { exportPdfMarkup } from '@/lib/pdf/pdfMarkupTransfer';
import { hasAnnotations } from '@/lib/pdf/annotations';

// -- Store and Hook Imports --
import { useCharacterStore, useCharacterActions } from '@/lib/stores/characterStore';
import { useAppSettingsActions } from '@/lib/stores/appSettingsStore';
import { useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';
import { getActiveSheetZoom, useTabManagerStore, useTabManagerActions } from '@/lib/character/tabManagerStore';
import { DEFAULT_SHEET_ZOOM, stepSheetZoom } from '@/lib/character/sheetZoom';
import { useActiveNoteInstance } from '@/lib/notes/ActiveNoteStoreContext';
import { useActivePdfInstance } from '@/lib/pdf/ActivePdfStoreContext';
import { exportEntireDrawerAsNestedTree } from '@/lib/drawer/drawerRepository';
import { revealDrawerItem } from '@/lib/portals/revealDrawerItem';
import { getActiveBoardStore } from '@/lib/board/boardStoreRegistry';
import { collectBoardEmbeddedEntities } from '@/lib/board/collectBoardEmbeddedEntities';
import { undoActiveContext, redoActiveContext } from '@/lib/history/undoRouting';
import { useSaveToDrawer } from '@/hooks/useSaveToDrawer';
import { CREATABLE_REGISTRY } from '@/lib/creation/creatableRegistry';
import { CHALLENGE_GAME_OPTIONS } from '@/lib/constants/gameVisuals';
import { hasChallengeVariant } from '@/lib/utils/character';
import { getTutorialsForPlatform } from '@/lib/tutorial/definitions';

// -- Type Imports --
import type { Board } from '@/lib/types/board';



interface CommandActionArgs {
   onToggleEditMode: () => void;
   onToggleDrawer: () => void;
   onOpenSettings: () => void;
   onImportFile: () => void;
   onExportNoteMarkdown: () => void;
   onCreateChallenge: () => void;
   onCreateJournal: () => void;
}

export interface CommandAction {
   id: string;
   label: string;
   icon: React.ElementType;
   group: string;
   /** Hidden alias tokens cmdk matches on alongside the label (English, not user-facing). */
   keywords?: string[];
   action?: () => void;
   pageId?: string;
}

/** The workspace a command applies to. `global` shows everywhere; `character`/`board`/`note`/`pdf` only on that tab kind. */
type CommandScope = 'global' | 'character' | 'board' | 'note' | 'pdf';

type ScopedCommand = CommandAction & { scope: CommandScope };

/** PascalCases a hyphenated creatable kind for a stable command id (`post-it` -> `PostIt`, `zone` -> `Zone`). */
function boardCommandId(kind: string): string {
   return kind.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

export function useCommandPaletteActions({ onToggleEditMode, onToggleDrawer, onOpenSettings, onImportFile, onExportNoteMarkdown, onCreateChallenge, onCreateJournal }: CommandActionArgs): CommandAction[] {
   const { t: t } = useTranslation();
   const { t: tNotifications } = useTranslation();
   const character = useCharacterStore((state) => state.character);
   const { resetCharacter, addPortrait } = useCharacterActions();
   const { setSideBySideView, toggleDiceTray, toggleNoteOutline, toggleLayersPanel, toggleNavigator } = useAppSettingsActions();
   const { setSettingsOpen, setSettingsInitialSection, requestBoardAction, requestDrawerImport, requestPdfMarkupApply } = useAppGeneralStateActions();

   // Deep-link the hub to a section (What's new / About / Learn), mirroring the sidebar doors.
   const openSettingsSection = (section: string) => {
      setSettingsInitialSection(section);
      setSettingsOpen(true);
   };
   const { setMode } = useThemeMode();
   const { deviceType } = useDeviceType();
   // The jump-to-a-tutorial picker only earns a slot when there's something to start (empty until the real
   // tutorials are authored; the `dev.` scenarios surface it in dev). openTutorials -> hub@learn stays regardless.
   const hasTutorials = getTutorialsForPlatform(deviceType).length > 0;
   const { saveCharacterToDrawer, saveBoardToDrawer } = useSaveToDrawer();
   const { createBoardTab, createNoteTab, closeActiveTab, setActiveTab, setTabZoom } = useTabManagerActions();
   const activeNote = useActiveNoteInstance();
   const activePdf = useActivePdfInstance();

   const openTabs = useTabManagerStore((state) => state.openTabs);
   const activeTabId = useTabManagerStore((state) => state.activeTabId);

   // The active workspace is the active tab's kind (null active = the menu). A tab-scoped command shows
   // only on its own kind (character/board); the menu gets the global set.
   const activeWorkspace = openTabs.find((tab) => tab.id === activeTabId)?.type ?? 'menu';

   // Neighbour tabs of the active one, wrapping at the ends. Only used when a tab is active
   // and there's more than one, so the index is always valid.
   const activeIndex = openTabs.findIndex((tab) => tab.id === activeTabId);
   const nextTabId = openTabs.length > 0 ? openTabs[(activeIndex + 1) % openTabs.length]?.id : undefined;
   const prevTabId = openTabs.length > 0 ? openTabs[(activeIndex - 1 + openTabs.length) % openTabs.length]?.id : undefined;
   const hasActiveTab = activeTabId !== null;

   // Reveal the active workspace's saved drawer entry (open + navigate + pulse); a deleted item toasts.
   const findInDrawer = (drawerItemId: string) => void revealDrawerItem(drawerItemId, { onMissing: () => toast.error(tNotifications('Notifications.drawer.itemNotInDrawer')) });

   const handleExportCharacter = async () => {
      if (!character) {
         toast.error(tNotifications('Notifications.character.exportFailedNoChar'));
         return;
      };
      try {
         await exportCharacterSheet(character);
         toast.success(tNotifications('Notifications.character.exported'));
      } catch {
         toast.error(tNotifications('Notifications.general.exportError'));
      }
   };

   const handleExportDrawer = async () => {
      try {
         const drawer = await exportEntireDrawerAsNestedTree();
         await exportDrawer(drawer);
         toast.success(tNotifications('Notifications.drawer.exported'));
      } catch {
         toast.error(tNotifications('Notifications.drawer.actionFailed'));
      }
   };

   const handleExportBackup = async () => {
      try {
         await exportFullBackup();
         toast.success(tNotifications('Notifications.backup.exported'));
      } catch {
         toast.error(tNotifications('Notifications.backup.exportFailed'));
      }
   };

   // Export the LIVE active board (unsaved edits included), embedding its referenced characters so the
   // board survives on another machine. `exportToFile` folds each character's portrait into the asset map.
   const handleExportBoard = async () => {
      const store = getActiveBoardStore();
      if (!store) return;
      try {
         const s = store.getState();
         const board: Board = { id: s.boardId!, name: s.name, viewport: s.viewport, grid: s.grid, nextLayerSeq: s.nextLayerSeq, items: Object.values(s.items) };
         const embedded = await collectBoardEmbeddedEntities(board);
         const fileName = generateExportFilename('NEUTRAL', 'FULL_BOARD', board.name);
         await exportToFile(board, 'FULL_BOARD', 'NEUTRAL', fileName, embedded);
         toast.success(tNotifications('Notifications.board.exported'));
      } catch {
         toast.error(tNotifications('Notifications.general.exportError'));
      }
   };

   // Export the active pdf's ANNOTATIONS as a bytes-free markup file (no PDF bytes) - the licensing-safe share path.
   const handleExportPdfMarkup = () => {
      const doc = activePdf?.getState().doc;
      if (!doc) return;
      try {
         exportPdfMarkup(doc, doc.title);
         toast.success(tNotifications('Notifications.pdf.markupExported'));
      } catch {
         toast.error(tNotifications('Notifications.general.exportError'));
      }
   };

   // Creation commands need a game with cards/trackers; NEUTRAL has none.
   const currentGame = character?.game;
   const showCreationCommands = currentGame && currentGame !== 'NEUTRAL';
   // A challenge adopts the character's game, so its create command only shows for a game with a challenge variant.
   const showCreateChallenge = !!currentGame && hasChallengeVariant(currentGame);
   // The portrait is a sheet singleton, so its create command hides once one exists (like the add menu's row).
   const showCreatePortrait = !!character && !character.cards.some((c) => c.cardType === 'IMAGE_CARD');

   // Labels are clean i18n text; cmdk narrows on `keywords` (English alias tokens) too.
   const allCommands: ScopedCommand[] = [

      // #########################
      // ###   GENERAL GROUP   ###
      // #########################
      { id: 'toggleEdit', scope: 'character', label: t('CommandPalette.commands.toggleEdit'), keywords: ['edit', 'toggle'], icon: Pencil, group: t('Common.general'), action: onToggleEditMode },
      { id: 'toggleDrawer', scope: 'global', label: t('CommandPalette.commands.toggleDrawer'), keywords: ['drawer', 'toggle'], icon: PanelLeftOpen, group: t('Common.general'), action: onToggleDrawer },
      { id: 'toggleNavigator', scope: 'global', label: t('CommandPalette.commands.toggleNavigator'), keywords: ['navigator', 'portals', 'graph', 'links', 'crawl', 'jump', 'toggle', 'panel'], icon: Waypoints, group: t('Common.general'), action: toggleNavigator },
      { id: 'openSettings', scope: 'global', label: t('CommandPalette.commands.openSettings'), keywords: ['settings', 'preferences', 'config'], icon: Settings, group: t('Common.general'), action: onOpenSettings },
      { id: 'openWhatsNew', scope: 'global', label: t('CommandPalette.commands.openWhatsNew'), keywords: ['what', 'new', 'patch', 'notes', 'release', 'changelog', 'update'], icon: Sparkles, group: t('Common.general'), action: () => openSettingsSection('whatsNew') },
      { id: 'viewAnnouncements', scope: 'global', label: t('CommandPalette.commands.viewAnnouncements'), keywords: ['announcements', 'notices', 'news', 'messages', 'banner', 'alerts'], icon: Megaphone, group: t('Common.general'), action: () => openSettingsSection('announcements') },
      { id: 'openAbout', scope: 'global', label: t('CommandPalette.commands.openAbout'), keywords: ['about', 'info', 'license', 'credits', 'version'], icon: Info, group: t('Common.general'), action: () => openSettingsSection('about') },
      { id: 'openTutorials', scope: 'global', label: t('CommandPalette.commands.openTutorials'), keywords: ['tutorials', 'learn', 'help', 'onboarding', 'guide', 'teach'], icon: GraduationCap, group: t('Common.general'), action: () => openSettingsSection('learn') },
      ...(hasTutorials ? [
         { id: 'startTutorial', scope: 'global' as const, label: t('CommandPalette.commands.startTutorial'), keywords: ['tutorial', 'start', 'learn', 'lesson', 'teach', 'guide', 'run'], icon: GraduationCap, group: t('Common.general'), pageId: 'startTutorial' },
      ] : []),
      { id: 'importFile', scope: 'global', label: t('CommandPalette.commands.importFile'), keywords: ['import', 'file', 'load', 'open', '.cotm'], icon: Import, group: t('Common.general'), action: onImportFile },
      // Routes to the DRAWER's PDF-capable picker (via the store signal), not the sheet importer - only
      // the drawer import accepts `.pdf`. Signals through the store like the board actions, so it needs
      // no prop threading; the side-panel Drawer opens its file input in response.
      { id: 'importPdf', scope: 'global', label: t('CommandPalette.commands.importPdf'), keywords: ['import', 'pdf', 'rulebook', 'document', 'load'], icon: FileText, group: t('Common.general'), action: requestDrawerImport },
      // Undo/Redo route themselves (drawer / board / character), so they show in any workspace.
      { id: 'undo', scope: 'global', label: t('CommandPalette.commands.undo'), keywords: ['undo', 'revert', 'back'], icon: Undo2, group: t('Common.general'), action: undoActiveContext },
      { id: 'redo', scope: 'global', label: t('CommandPalette.commands.redo'), keywords: ['redo', 'forward'], icon: Redo2, group: t('Common.general'), action: redoActiveContext },

      // ######################
      // ###   TABS GROUP   ###
      // ######################
      // New character/board are always available; close/next/prev only when the tab state warrants.
      { id: 'newCharacter', scope: 'global', label: t('CommandPalette.commands.newCharacter'), keywords: ['tab', 'new', 'character', 'sheet'], icon: UserPlus, group: t('CommandPalette.groups.tabs'), pageId: 'newCharacter_Game' },
      { id: 'newBoard', scope: 'global', label: t('CommandPalette.commands.newBoard'), keywords: ['tab', 'new', 'board'], icon: LayoutGrid, group: t('CommandPalette.groups.tabs'), action: () => { void createBoardTab(); } },
      { id: 'newNote', scope: 'global', label: t('CommandPalette.commands.newNote'), keywords: ['tab', 'new', 'note', 'document', 'handout'], icon: NotebookPen, group: t('CommandPalette.groups.tabs'), action: () => { void createNoteTab(); } },
      ...(hasActiveTab ? [
         { id: 'closeTab', scope: 'global' as const, label: t('CommandPalette.commands.closeTab'), keywords: ['tab', 'close'], icon: X, group: t('CommandPalette.groups.tabs'), action: closeActiveTab },
      ] : []),
      ...(hasActiveTab && openTabs.length > 1 ? [
         { id: 'nextTab', scope: 'global' as const, label: t('CommandPalette.commands.nextTab'), keywords: ['tab', 'next', 'switch'], icon: ChevronRight, group: t('CommandPalette.groups.tabs'), action: () => nextTabId && setActiveTab(nextTabId) },
         { id: 'prevTab', scope: 'global' as const, label: t('CommandPalette.commands.prevTab'), keywords: ['tab', 'previous', 'switch'], icon: ChevronLeft, group: t('CommandPalette.groups.tabs'), action: () => prevTabId && setActiveTab(prevTabId) },
      ] : []),

      // ######################
      // ###   DICE GROUP   ###
      // ######################
      // Both dice commands share a group so the search score ranks them (Roll leads "roll"; the tray toggle
      // leads "dice"/"die") - cmdk sorts within a group, not across, so they must sit together.
      { id: 'toggleDiceTray', scope: 'global', label: t('CommandPalette.commands.toggleDiceTray'), keywords: ['dice', 'die', 'tray', 'roll'], icon: Dices, group: t('CommandPalette.groups.dice'), action: toggleDiceTray },
      // Type a formula on the next page; the app tray applies it, opens, and rolls it.
      { id: 'rollDice', scope: 'global', label: t('CommandPalette.commands.rollDice'), keywords: ['roll', 'd20', 'd6', 'dice', 'die', 'tray'], icon: Dices, group: t('CommandPalette.groups.dice'), pageId: 'rollDice' },

      // ##########################
      // ###   SETTINGS GROUP   ###
      // ##########################
      { id: 'setThemeModeLight', scope: 'global', label: t('CommandPalette.commands.setThemeModeLight'), keywords: ['light', 'mode', 'theme'], icon: Sun, group: t('CommandPalette.groups.settings'), action: () => setMode('light') },
      { id: 'setThemeModeDark', scope: 'global', label: t('CommandPalette.commands.setThemeModeDark'), keywords: ['dark', 'mode', 'theme'], icon: Moon, group: t('CommandPalette.groups.settings'), action: () => setMode('dark') },
      { id: 'setThemePalette', scope: 'global', label: t('CommandPalette.commands.setThemePalette'), keywords: ['palette', 'theme', 'color'], icon: Palette, group: t('CommandPalette.groups.settings'), pageId: 'setThemePalette' },
      { id: 'manageThemes', scope: 'global', label: t('CommandPalette.commands.manageThemes'), keywords: ['theme', 'themes', 'editor', 'manage', 'custom', 'palette'], icon: SwatchBook, group: t('CommandPalette.groups.settings'), action: () => openSettingsSection('appearance') },
      { id: 'openCardPalettes', scope: 'global', label: t('CommandPalette.commands.openCardPalettes'), keywords: ['card', 'palette', 'palettes', 'game', 'color', 'theme'], icon: Layers, group: t('CommandPalette.groups.settings'), action: () => openSettingsSection('cardPalettes') },
      { id: 'openStencilLibrary', scope: 'global', label: t('CommandPalette.commands.openStencilLibrary'), keywords: ['stencil', 'mask', 'shape', 'image', 'cutout'], icon: Shapes, group: t('CommandPalette.groups.settings'), action: () => openSettingsSection('stencils') },
      { id: 'viewFlipping', scope: 'character', label: t('CommandPalette.commands.viewFlipping'), keywords: ['flip', 'view', 'card'], icon: FlipHorizontal, group: t('CommandPalette.groups.settings'), action: () => setSideBySideView(false) },
      { id: 'viewSideBySide', scope: 'character', label: t('CommandPalette.commands.viewSideBySide'), keywords: ['side', 'view', 'card'], icon: BookOpen, group: t('CommandPalette.groups.settings'), action: () => setSideBySideView(true) },

      // ########################
      // ###   EXPORT GROUP   ###
      // ########################
      { id: 'exportCharacter', scope: 'character', label: t('CommandPalette.commands.exportCharacter'), keywords: ['export', 'character', 'save'], icon: FileUp, group: t('CommandPalette.groups.export'), action: handleExportCharacter },
      { id: 'saveCharacterToDrawer', scope: 'character', label: t('CommandPalette.commands.saveCharacterToDrawer'), keywords: ['save', 'drawer', 'store', 'persist', 'character'], icon: Save, group: t('CommandPalette.groups.export'), action: saveCharacterToDrawer },
      { id: 'exportBoard', scope: 'board', label: t('CommandPalette.commands.exportBoard'), keywords: ['export', 'board', 'save', 'file', '.cotm'], icon: FileUp, group: t('CommandPalette.groups.export'), action: handleExportBoard },
      { id: 'saveBoardToDrawer', scope: 'board', label: t('CommandPalette.commands.saveBoardToDrawer'), keywords: ['save', 'drawer', 'store', 'persist', 'board'], icon: Save, group: t('CommandPalette.groups.export'), action: saveBoardToDrawer },
      // The selected board card/tracker copy saves to the drawer. The canvas owns the selection, so both
      // route through requestBoardAction (like createChallengeOnBoard); the board guards an unusable selection.
      { id: 'saveItemToDrawer', scope: 'board', label: t('CommandPalette.commands.saveItemToDrawer'), keywords: ['save', 'drawer', 'store', 'persist', 'item', 'card', 'tracker'], icon: Save, group: t('CommandPalette.groups.export'), action: () => requestBoardAction('saveItemToDrawer') },
      { id: 'saveItemToDrawerAs', scope: 'board', label: t('CommandPalette.commands.saveItemToDrawerAs'), keywords: ['save', 'as', 'drawer', 'store', 'fork', 'copy', 'item', 'card', 'tracker'], icon: SaveAll, group: t('CommandPalette.groups.export'), action: () => requestBoardAction('saveItemToDrawerAs') },
      { id: 'exportDrawer', scope: 'global', label: t('CommandPalette.commands.exportDrawer'), keywords: ['export', 'drawer', 'save'], icon: FileUp, group: t('CommandPalette.groups.export'), action: handleExportDrawer },
      // Full app backup (every store + settings) as one file. Restore is destructive, so it stays button-only in Data settings.
      { id: 'exportBackup', scope: 'global', label: t('CommandPalette.commands.exportBackup'), keywords: ['backup', 'export', 'full', 'everything', 'data', 'save'], icon: DatabaseBackup, group: t('CommandPalette.groups.export'), action: handleExportBackup },
      // Plain-`.md` note export, alongside the full-fidelity `.cotm` note path. Needs an active note
      // (note scope). Markdown IMPORT rides the existing "Import Note" picker (routed by extension), so
      // it has no separate command.
      { id: 'exportNoteMarkdown', scope: 'note', label: t('CommandPalette.commands.exportNoteMarkdown'), keywords: ['export', 'note', 'markdown', 'md', 'text'], icon: FileUp, group: t('CommandPalette.groups.export'), action: onExportNoteMarkdown },

      // Find-in-Drawer: jump to the active workspace's saved drawer entry. Each is gated on that workspace
      // having a saved id (mirroring the toolbar buttons); the active-tab scope keeps only the relevant one visible.
      ...(character?.drawerItemId ? [
         { id: 'findCharacterInDrawer', scope: 'character' as const, label: t('Common.findInDrawer'), keywords: ['find', 'locate', 'reveal', 'drawer', 'folder', 'character'], icon: FolderSearch, group: t('Common.characterSheet'), action: () => { if (character.drawerItemId) findInDrawer(character.drawerItemId); } },
      ] : []),
      ...(activeNote?.getState().drawerItemId ? [
         { id: 'findNoteInDrawer', scope: 'note' as const, label: t('Common.findInDrawer'), keywords: ['find', 'locate', 'reveal', 'drawer', 'folder', 'note'], icon: FolderSearch, group: t('CommandPalette.groups.note'), action: () => { const id = activeNote.getState().drawerItemId; if (id) findInDrawer(id); } },
      ] : []),
      ...(activePdf?.getState().drawerItemId ? [
         { id: 'findPdfInDrawer', scope: 'pdf' as const, label: t('Common.findInDrawer'), keywords: ['find', 'locate', 'reveal', 'drawer', 'folder', 'pdf'], icon: FolderSearch, group: t('CommandPalette.groups.pdf'), action: () => { const id = activePdf.getState().drawerItemId; if (id) findInDrawer(id); } },
      ] : []),
      ...(getActiveBoardStore()?.getState().drawerItemId ? [
         { id: 'findBoardInDrawer', scope: 'board' as const, label: t('Common.findInDrawer'), keywords: ['find', 'locate', 'reveal', 'drawer', 'folder', 'board'], icon: FolderSearch, group: t('CommandPalette.groups.tools'), action: () => { const id = getActiveBoardStore()?.getState().drawerItemId; if (id) findInDrawer(id); } },
      ] : []),

      // #######################
      // ###   NOTE GROUP    ###
      // #######################
      { id: 'toggleNoteOutline', scope: 'note', label: t('CommandPalette.commands.toggleNoteOutline'), keywords: ['outline', 'toc', 'contents', 'headings', 'sections', 'sidebar', 'note'], icon: ListTree, group: t('CommandPalette.groups.note'), action: toggleNoteOutline },
      { id: 'jumpToSection', scope: 'note', label: t('CommandPalette.commands.jumpToSection'), keywords: ['jump', 'goto', 'section', 'heading', 'outline', 'navigate', 'note'], icon: ListTree, group: t('CommandPalette.groups.note'), pageId: 'jumpToSection' },
      // Opens the toolbar's search-first link picker at the caret (flips to Live first). Note-scoped.
      { id: 'insertLink', scope: 'note', label: t('CommandPalette.commands.insertLink'), keywords: ['link', 'insert', 'url', 'portal', 'anchor', 'reference', 'section', 'note'], icon: Link, group: t('CommandPalette.groups.note'), action: () => activeNote?.getState().actions.openLinkPicker() },

      // #####################
      // ###   PDF GROUP   ###
      // #####################
      // Gated on an active pdf tab; both drive the active pdf instance's own markup state.
      ...(activePdf ? [
         { id: 'pdfToggleMarkup', scope: 'pdf' as const, label: t('CommandPalette.commands.pdfToggleMarkup'), keywords: ['pdf', 'markup', 'annotate', 'draw', 'mark', 'notes'], icon: Pencil, group: t('CommandPalette.groups.pdf'), action: () => { const state = activePdf.getState(); state.actions.setMarkupMode(state.markupMode === 'markup' ? 'read' : 'markup'); } },
         { id: 'pdfToggleComments', scope: 'pdf' as const, label: t('CommandPalette.commands.pdfToggleComments'), keywords: ['pdf', 'comments', 'notes', 'panel', 'annotations'], icon: MessagesSquare, group: t('CommandPalette.groups.pdf'), action: () => activePdf.getState().actions.toggleCommentsPanel() },
         { id: 'pdfToggleNav', scope: 'pdf' as const, label: t('CommandPalette.commands.pdfToggleNav'), keywords: ['pdf', 'outline', 'thumbnails', 'navigation', 'sidebar', 'panel', 'bookmarks', 'pages', 'contents'], icon: PanelLeft, group: t('CommandPalette.groups.pdf'), action: () => activePdf.getState().actions.toggleNavPanel() },
         { id: 'pdfFind', scope: 'pdf' as const, label: t('CommandPalette.commands.pdfFind'), keywords: ['pdf', 'search', 'find', 'text', 'lookup', 'query'], icon: Search, group: t('CommandPalette.groups.pdf'), action: () => activePdf.getState().actions.openSearch() },
         // Apply a shared markup file onto this pdf; the reader opens the picker + Add/Replace dialog.
         { id: 'pdfApplyMarkup', scope: 'pdf' as const, label: t('CommandPalette.commands.pdfApplyMarkup'), keywords: ['pdf', 'apply', 'markup', 'annotations', 'import', 'marks', 'share'], icon: Import, group: t('CommandPalette.groups.pdf'), action: requestPdfMarkupApply },
         // Export this pdf's annotations as a bytes-free share file; only when there's markup to share.
         ...(hasAnnotations(activePdf.getState().doc) ? [
            { id: 'pdfExportMarkup', scope: 'pdf' as const, label: t('CommandPalette.commands.pdfExportMarkup'), keywords: ['pdf', 'export', 'markup', 'annotations', 'share', 'marks'], icon: Highlighter, group: t('CommandPalette.groups.pdf'), action: handleExportPdfMarkup },
         ] : []),
      ] : []),

      // #################################
      // ###   CHARACTER SHEET GROUP   ###
      // #################################
      { id: 'renameCharacter', scope: 'character', label: t('CommandPalette.commands.renameCharacter'), keywords: ['rename', 'character', 'name'], icon: Type, group: t('Common.characterSheet'), pageId: 'renameCharacter' },
      { id: 'resetCharacter', scope: 'character', label: t('CommandPalette.commands.resetCharacter'), keywords: ['reset', 'character', 'clear'], icon: Undo2, group: t('Common.characterSheet'), action: resetCharacter },
      // Sheet zoom (desktop content scale, per tab). Reset is the anchor; in/out step the nice levels.
      { id: 'resetSheetZoom', scope: 'character', label: t('CommandPalette.commands.resetSheetZoom'), keywords: ['zoom', 'reset', 'scale', 'size', '100', 'sheet'], icon: RotateCcw, group: t('Common.characterSheet'), action: () => activeTabId && setTabZoom(activeTabId, DEFAULT_SHEET_ZOOM) },
      { id: 'zoomInSheet', scope: 'character', label: t('CommandPalette.commands.zoomInSheet'), keywords: ['zoom', 'in', 'scale', 'bigger', 'larger', 'sheet'], icon: ZoomIn, group: t('Common.characterSheet'), action: () => activeTabId && setTabZoom(activeTabId, stepSheetZoom(getActiveSheetZoom(), 1)) },
      { id: 'zoomOutSheet', scope: 'character', label: t('CommandPalette.commands.zoomOutSheet'), keywords: ['zoom', 'out', 'scale', 'smaller', 'sheet'], icon: ZoomOut, group: t('Common.characterSheet'), action: () => activeTabId && setTabZoom(activeTabId, stepSheetZoom(getActiveSheetZoom(), -1)) },

      // ##########################
      // ###   CREATION GROUP   ###
      // ##########################
      ...(showCreationCommands ? [
         { id: 'createCard', scope: 'character' as const, label: t('CommandPalette.commands.createCard'), keywords: ['create', 'new', 'card'], icon: FilePlus, group: t('CommandPalette.groups.creation'), pageId: 'createCard_Type' },
         { id: 'createTracker', scope: 'character' as const, label: t('CommandPalette.commands.createTracker'), keywords: ['create', 'new', 'tracker', 'status', 'tag'], icon: ListPlus, group: t('CommandPalette.groups.creation'), pageId: 'createTracker_Type' },
      ] : []),
      // A challenge adopts the character's game; the command hides on a game with no challenge variant (NEUTRAL).
      ...(showCreateChallenge ? [
         { id: 'createChallenge', scope: 'character' as const, label: t('CommandPalette.commands.createChallengeCard'), keywords: ['challenge', 'threat', 'adversary', 'card', 'create', 'new'], icon: Skull, group: t('CommandPalette.groups.creation'), action: onCreateChallenge },
      ] : []),
      // A journal is game-agnostic (the character's own notebook), so it's creatable on any character tab too.
      { id: 'createJournal', scope: 'character', label: t('CommandPalette.commands.createJournal'), keywords: ['journal', 'notebook', 'notes', 'pages', 'create', 'new'], icon: NotebookText, group: t('CommandPalette.groups.creation'), action: onCreateJournal },
      // The portrait is a game-agnostic singleton; the command drops away once the sheet has one.
      ...(showCreatePortrait ? [
         { id: 'createPortrait', scope: 'character' as const, label: t('CommandPalette.commands.createPortrait'), keywords: ['portrait', 'image', 'picture', 'photo', 'avatar', 'create', 'new'], icon: ImageIcon, group: t('CommandPalette.groups.creation'), action: addPortrait },
      ] : []),
      // The board's sticky pointer tools, mirroring the top-left segment. Ephemeral (the canvas owns the
      // active tool), so both route through the same one-shot request bridge the creates use.
      { id: 'setToolSelect', scope: 'board', label: t('CommandPalette.commands.setToolSelect'), keywords: ['tool', 'select', 'pointer', 'move', 'board'], icon: MousePointer2, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setTool:select') },
      { id: 'setToolPen', scope: 'board', label: t('CommandPalette.commands.setToolPen'), keywords: ['tool', 'pen', 'draw', 'pencil', 'sketch', 'ink', 'board'], icon: Pen, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setTool:pen') },
      { id: 'setToolLine', scope: 'board', label: t('CommandPalette.commands.setToolLine'), keywords: ['tool', 'line', 'straight', 'segment', 'shape', 'draw', 'board'], icon: Slash, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setTool:line') },
      { id: 'setToolFreeformPolygon', scope: 'board', label: t('CommandPalette.commands.setToolFreeformPolygon'), keywords: ['tool', 'freeform', 'polygon', 'shape', 'vertices', 'draw', 'board'], icon: Waypoints, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setTool:freeformPolygon') },
      { id: 'setToolRegularPolygon', scope: 'board', label: t('CommandPalette.commands.setToolRegularPolygon'), keywords: ['tool', 'regular', 'polygon', 'shape', 'pentagon', 'hexagon', 'draw', 'board'], icon: Pentagon, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setTool:regularPolygon') },
      { id: 'setToolShape', scope: 'board', label: t('CommandPalette.commands.setToolShape'), keywords: ['tool', 'shape', 'circle', 'square', 'ellipse', 'rectangle', 'fill', 'draw', 'board'], icon: Shapes, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setTool:shape') },
      { id: 'setToolTransform', scope: 'board', label: t('CommandPalette.commands.setToolTransform'), keywords: ['tool', 'transform', 'select', 'move', 'strokes', 'draw', 'board'], icon: BoxSelect, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setTool:transform') },
      { id: 'setToolEraser', scope: 'board', label: t('CommandPalette.commands.setToolEraser'), keywords: ['tool', 'eraser', 'erase', 'rub', 'delete', 'draw', 'board'], icon: Eraser, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setTool:eraser') },
      // Brush picks double as the pen tool (the canvas switches to pen on a brush request).
      { id: 'setBrushPen', scope: 'board', label: t('CommandPalette.commands.setBrushPen'), keywords: ['brush', 'pen', 'draw', 'ink', 'thin', 'board'], icon: Pen, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setBrush:pen') },
      { id: 'setBrushBrush', scope: 'board', label: t('CommandPalette.commands.setBrushBrush'), keywords: ['brush', 'calligraphy', 'nib', 'draw', 'ink', 'board'], icon: Brush, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setBrush:brush') },
      { id: 'setBrushHighlighter', scope: 'board', label: t('CommandPalette.commands.setBrushHighlighter'), keywords: ['brush', 'highlighter', 'highlight', 'draw', 'ink', 'board'], icon: Highlighter, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setBrush:highlighter') },
      // The background grid styles, mirroring the toolbar grid selector. Each swaps the whole grid via the
      // one-shot bridge (the canvas owns the board's grid state).
      { id: 'setGridNone', scope: 'board', label: t('CommandPalette.commands.setGridNone'), keywords: ['grid', 'none', 'off', 'blank', 'board'], icon: Square, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setGrid:none') },
      { id: 'setGridDots', scope: 'board', label: t('CommandPalette.commands.setGridDots'), keywords: ['grid', 'dots', 'board'], icon: Grip, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setGrid:dots') },
      { id: 'setGridCrosshatch', scope: 'board', label: t('CommandPalette.commands.setGridCrosshatch'), keywords: ['grid', 'crosshatch', 'lines', 'both', 'graph', 'board'], icon: Grid3x3, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setGrid:lines') },
      { id: 'setGridHorizontalLines', scope: 'board', label: t('CommandPalette.commands.setGridHorizontalLines'), keywords: ['grid', 'horizontal', 'lines', 'rows', 'rules', 'board'], icon: Rows3, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setGrid:h-lines') },
      { id: 'setGridVerticalLines', scope: 'board', label: t('CommandPalette.commands.setGridVerticalLines'), keywords: ['grid', 'vertical', 'lines', 'columns', 'rules', 'board'], icon: Columns3, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setGrid:v-lines') },
      { id: 'setGridHex', scope: 'board', label: t('CommandPalette.commands.setGridHex'), keywords: ['grid', 'hex', 'hexagon', 'honeycomb', 'hive', 'board'], icon: Hexagon, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setGrid:hex') },
      // The surface textures, mirroring the board-surface menu tiles. Each sets the board's texture (keeping any fill) via the bridge.
      { id: 'setTextureNone', scope: 'board', label: t('CommandPalette.commands.setTextureNone'), keywords: ['surface', 'texture', 'none', 'off', 'smooth', 'board'], icon: Palette, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setTexture:none') },
      { id: 'setTexturePaper', scope: 'board', label: t('CommandPalette.commands.setTexturePaper'), keywords: ['surface', 'texture', 'paper', 'parchment', 'mottle', 'board'], icon: SwatchBook, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setTexture:paper') },
      { id: 'setTextureLinen', scope: 'board', label: t('CommandPalette.commands.setTextureLinen'), keywords: ['surface', 'texture', 'linen', 'cloth', 'weave', 'fabric', 'board'], icon: SwatchBook, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('setTexture:linen') },
      // No coordinate rides the one-shot bridge, so this just focuses the bar's X field for the user to type.
      { id: 'jumpToCoordinate', scope: 'board', label: t('CommandPalette.commands.jumpToCoordinate'), keywords: ['jump', 'go', 'goto', 'coordinate', 'position', 'center', 'navigate', 'pan', 'board'], icon: LocateFixed, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('focusJumpToCoordinate') },
      // The layers panel is a plain appSettings toggle (no board instance needed), like the dice tray.
      { id: 'toggleLayersPanel', scope: 'board', label: t('CommandPalette.commands.toggleLayersPanel'), keywords: ['layers', 'panel', 'stack', 'z-order', 'order', 'elements', 'board'], icon: Layers, group: t('CommandPalette.groups.tools'), action: toggleLayersPanel },
      // Merge needs the live selection, so it rides the request bridge and reuses the footer's mergeable
      // reasoning (no-op + toast if the current selection isn't a contiguous drawing run).
      { id: 'mergeSelectedLayers', scope: 'board', label: t('CommandPalette.commands.mergeSelectedLayers'), keywords: ['merge', 'combine', 'flatten', 'layers', 'drawings', 'board'], icon: Combine, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('mergeSelectedLayers') },
      { id: 'resetRotation', scope: 'board', label: t('CommandPalette.commands.resetRotation'), keywords: ['reset', 'rotation', 'rotate', 'angle', 'orientation', 'straighten', 'unrotate', 'board'], icon: RotateCcw, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('resetRotation') },
      // Align / distribute the current multi-selection to its bounding box. The canvas owns the selection,
      // so each routes through the request bridge; align no-ops under 2 items, distribute under 3.
      { id: 'alignLeft', scope: 'board', label: t('CommandPalette.commands.alignLeft'), keywords: ['align', 'left', 'edge', 'selection', 'board'], icon: AlignStartVertical, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('align:left') },
      { id: 'alignCenterX', scope: 'board', label: t('CommandPalette.commands.alignCenterX'), keywords: ['align', 'center', 'horizontal', 'middle', 'selection', 'board'], icon: AlignCenterVertical, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('align:centerX') },
      { id: 'alignRight', scope: 'board', label: t('CommandPalette.commands.alignRight'), keywords: ['align', 'right', 'edge', 'selection', 'board'], icon: AlignEndVertical, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('align:right') },
      { id: 'alignTop', scope: 'board', label: t('CommandPalette.commands.alignTop'), keywords: ['align', 'top', 'edge', 'selection', 'board'], icon: AlignStartHorizontal, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('align:top') },
      { id: 'alignMiddleY', scope: 'board', label: t('CommandPalette.commands.alignMiddleY'), keywords: ['align', 'middle', 'vertical', 'center', 'selection', 'board'], icon: AlignCenterHorizontal, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('align:middleY') },
      { id: 'alignBottom', scope: 'board', label: t('CommandPalette.commands.alignBottom'), keywords: ['align', 'bottom', 'edge', 'selection', 'board'], icon: AlignEndHorizontal, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('align:bottom') },
      { id: 'distributeHorizontal', scope: 'board', label: t('CommandPalette.commands.distributeHorizontal'), keywords: ['distribute', 'spread', 'horizontal', 'space', 'gaps', 'even', 'selection', 'board'], icon: AlignHorizontalDistributeCenter, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('distribute:horizontal') },
      { id: 'distributeVertical', scope: 'board', label: t('CommandPalette.commands.distributeVertical'), keywords: ['distribute', 'spread', 'vertical', 'space', 'gaps', 'even', 'selection', 'board'], icon: AlignVerticalDistributeCenter, group: t('CommandPalette.groups.tools'), action: () => requestBoardAction('distribute:vertical') },
      // One board challenge command per game (mirroring the toolbar/radial submenu). The board mints its own
      // copy (no drawer source) and auto-opens the Expanded overlay; the active canvas consumes the request
      // since it owns the drop point + selection/expand state.
      ...CHALLENGE_GAME_OPTIONS.map((game) => ({
         id: `createChallengeOnBoard_${game}`,
         scope: 'board' as const,
         label: t('CommandPalette.commands.createChallengeCardForGame', { game: t(`Drawer.Types.${game}`) }),
         keywords: ['challenge', 'threat', 'adversary', 'card', 'create', 'new', 'board', game],
         icon: Skull,
         group: t('CommandPalette.groups.creation'),
         action: () => requestBoardAction(`createChallenge:${game}`),
      })),
      // The board-native element create commands, mirroring the toolbar/radial. Icon + label come from
      // the shared registry so the palette can't drift from the other surfaces; each drops at view center
      // via the same `create:<kind>` bridge (the canvas owns the drop point).
      ...CREATABLE_REGISTRY.map((entry) => ({
         id: `create${boardCommandId(entry.kind)}OnBoard`,
         scope: 'board' as const,
         label: t(`BoardView.${entry.labelKey}`),
         keywords: ['create', 'new', 'board', entry.kind],
         icon: entry.icon,
         group: t('CommandPalette.groups.creation'),
         action: () => requestBoardAction(`create:${entry.kind}`),
      })),
      // Embed an EXISTING saved note as a live reference tile: pick a note on the next page, then the canvas
      // drops it at view center (it owns the drop point, like the create commands).
      { id: 'embedNote', scope: 'board', label: t('CommandPalette.commands.embedNote'), keywords: ['embed', 'note', 'handout', 'document', 'reference', 'board'], icon: NotebookText, group: t('CommandPalette.groups.creation'), pageId: 'embedNote' },
   ];

   // Each tab kind gets the global commands plus its own scope (character/board/note); the menu gets globals only.
   return allCommands.filter((command) => command.scope === 'global' || command.scope === activeWorkspace);
};