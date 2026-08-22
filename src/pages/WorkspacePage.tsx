// -- React Imports --
import { lazy, Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// -- Custom Hooks --
import { useDeviceType } from '@/hooks/useDeviceType';
import { useDesktopDragSensors } from '@/hooks/useDesktopDragSensors';
import { useCharacterSheetDnD } from '@/hooks/character-sheet/useCharacterSheetDnD';
import { useSheetZoomShortcuts } from '@/hooks/character-sheet/useSheetZoomShortcuts';
import { useCharacterSheetFileImport } from '@/hooks/character-sheet/useCharacterSheetFileImport';
import { useCharacterSheetExport } from '@/hooks/character-sheet/useCharacterSheetExport';
import { useCharacterSheetUndoRedo } from '@/hooks/character-sheet/useCharacterSheetUndoRedo';
import { useCardDialogState } from '@/hooks/character-sheet/useCardDialogState';
import { importBoardView, importNoteView, usePrefetchTabChunks } from '@/hooks/character-sheet/useLazyTabViews';
import { useNavigatorShortcut } from '@/hooks/character-sheet/useNavigatorShortcut';
import { useSheetChromeState } from '@/hooks/character-sheet/useSheetChromeState';

// -- Other Library Imports --
import { DndContext, MeasuringStrategy } from '@dnd-kit/core';
import { AnimatePresence } from 'framer-motion';

// -- Utils Imports --
import { customCollisionDetection } from '@/lib/utils/dnd';
import { resolveActiveWindow } from '@/lib/character/activeWindow';

// -- Component Imports --
import { CharacterSheetSurface } from '@/components/organisms/character-sheet/CharacterSheetSurface';
import { WorkspaceContentOverlays } from '@/components/organisms/workspace/WorkspaceContentOverlays';
import { WorkspaceDrawerRegion } from '@/components/organisms/workspace/WorkspaceDrawerRegion';
import { WorkspaceDialogStack } from '@/components/organisms/workspace/WorkspaceDialogStack';
import { WorkspaceDragOverlayLayer } from '@/components/organisms/workspace/WorkspaceDragOverlayLayer';
import { DiceTrayPanel } from '@/components/organisms/dice/DiceTrayPanel';
import { SidebarMenu } from '@/components/organisms/SidebarMenu';
import { TabStrip } from '@/components/organisms/tabs/TabStrip';
import { PortalTrailBar } from '@/components/organisms/tabs/PortalTrailBar';
import { NavigatorPanel } from '@/components/organisms/navigator/NavigatorPanel';
import MainMenu from '@/components/organisms/MainMenu';
import MobileCharacterSheetPage from '@/components/mobile/character-sheet/MobileCharacterSheetPage';
import { CharacterBootLoading } from '@/components/molecules/CharacterBootLoading';
import { TabViewLoading } from '@/components/molecules/TabViewLoading';

// -- Store and Hook Imports --
import { useCharacterStore, useCharacterActions } from '@/lib/stores/characterStore';
import { useActiveBoardInstance } from '@/lib/board/ActiveBoardStoreContext';
import { useActiveNoteInstance } from '@/lib/notes/ActiveNoteStoreContext';
import { useIsBootHydrating } from '@/lib/character/characterPersistence';
import { useActiveSheetZoom, useTabManagerStore } from '@/lib/character/tabManagerStore';
import { useCommandPaletteActions } from '@/hooks/useCommandPaletteActions';
import { useNoteMarkdownIO } from '@/hooks/useNoteMarkdownIO';

// Both surfaces resolve from their own deferred chunk (see `useLazyTabViews` for why, and for the
// on-idle prefetch that warms them). The `.then` unwrap is because both modules are named exports.
const NoteView = lazy(() => importNoteView().then((m) => ({ default: m.NoteView })));
const BoardView = lazy(() => importBoardView().then((m) => ({ default: m.BoardView })));

function DesktopWorkspacePage() {
   // ==================
   //  Localization
   // ==================
   const { t: t } = useTranslation();

   // ==================
   //  Data Stores
   // ==================
   const character = useCharacterStore((state) => state.character);
   // The active board / note contexts are the surface switch: each is non-null only under
   // its own tab kind (else null under another kind or the menu). Together with `character`
   // they make the workspace a 3-way pick (note / board / character), so the page never
   // re-derives the active tab type. Exactly one is ever non-null at a time (the TabManager's
   // 3-way pointer park guarantees it), so the render order below is unambiguous.
   const activeBoard = useActiveBoardInstance();
   const activeNote = useActiveNoteInstance();
   const isBootHydrating = useIsBootHydrating();
   const { updateCharacterName, addStatus, addStoryTag, addPortrait, addJournal } = useCharacterActions();

   // Per-tab sheet zoom: a plain content scale, remembered per character tab. The scroll `<main>`
   // hosts the Ctrl/Cmd+wheel gesture; the control + shortcuts drive it (character tabs only).
   const sheetZoom = useActiveSheetZoom();
   const activeTabId = useTabManagerStore((state) => state.activeTabId);
   const sheetScrollRef = useRef<HTMLElement>(null);

   // ==================
   //  General App Stores
   // ==================
   const {
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
   } = useSheetChromeState();

   useNavigatorShortcut(toggleNavigator);

   // ==================
   //  Drag and Drop
   // ==================
   const {
      activeDragItem,
      activeTabDrag,
      overDragId,
      isOverDrawer,
      drawerDropTarget,
      statusIds,
      storyTagIds,
      storyThemeIds,
      handleDragStart,
      handleDragOver,
      handleDragEnd,
      handleDragCancel,
      isOverTabLane,
      springTarget,
      sheetHighlight,
      isIncompatibleComponentDrag,
      isDrawerItemDragActive,
      isFolderDragActive,
      workspaceDwellKey,
      renderClone,
      renderCluster,
   } = useCharacterSheetDnD();

   // One sensor config for every sheet drag (tabs, cards, trackers, drawer). Fine pointer: a 5px
   // activation distance lets a tab single-click still activate/close while a drag past the threshold
   // reorders. Coarse pointer (touch tablet): a press-and-hold arms the drag so a quick touch-move
   // scrolls the drawer/list instead of dragging a row. KeyboardSensor preserves the a11y drag.
   const sensors = useDesktopDragSensors();


   // #########################################
   // ###   CARD CREATION DIALOG HANDLERS   ###
   // #########################################

   const {
      isCardDialogOpen,
      setCardDialogOpen,
      dialogMode,
      cardToEdit,
      challengeCardToEdit,
      closeChallengeEditor,
      handleCreateChallenge,
      handleEditCard,
      handleAddCardClick,
      handleDialogConfirm,
   } = useCardDialogState();


   // ########################################
   // ###   IMPORT/EXPORT LOGIC HANDLERS   ###
   // ########################################

   const { handleExportComponent } = useCharacterSheetExport();

   const { getRootProps, isDragActive: isFileDragActive, handleFileSelected, triggerImport, formRef, fileInputRef } = useCharacterSheetFileImport();

   // Plain-`.md` note export (portable text), alongside the full-fidelity `.cotm` note path. Its
   // warning dialog renders once below; markdown IMPORT rides the sidebar's "Import Note" picker.
   const { exportActiveNoteAsMarkdown, importMarkdownFile, dialogs: noteMarkdownDialogs } = useNoteMarkdownIO();


   // ##############################
   // ###   UNDO/REDO SHORTCUT   ###
   // ##############################

   useCharacterSheetUndoRedo();


   // ###########################
   // ###   COMMAND PALETTE   ###
   // ###########################

   const commands = useCommandPaletteActions({
      onToggleEditMode: () => setIsEditing(!isEditing),
      onToggleDrawer: () => setDrawerOpen(!isDrawerOpen),
      onOpenSettings: () => openSettingsHub('general'),
      onImportFile: triggerImport,
      onExportNoteMarkdown: exportActiveNoteAsMarkdown,
      onCreateChallenge: handleCreateChallenge,
      onCreateJournal: addJournal,
   });


   // Sheet-zoom gestures (Ctrl/Cmd+wheel over the scroller, Ctrl/Cmd +/-/0). Character tabs only.
   useSheetZoomShortcuts(sheetScrollRef, character ? activeTabId : null);

   // Warm the note + board lazy chunks on idle, so the first tab open doesn't cold-block on its fetch.
   usePrefetchTabChunks();


   // While the active character is still being read from IndexedDB, show a neutral
   // loading screen rather than flashing the main menu before the sheet resolves.
   // All hooks above run unconditionally.
   if (isBootHydrating && !character) {
      return <CharacterBootLoading />;
   }

   // Under CSS `zoom`, per-frame droppable re-measuring makes a card near the flex-wrap boundary
   // bistable - it flips between rows and the reorder gap jitters vertically. Freeze the layout at
   // drag start when zoomed; keep continuous measuring at 100%. The sheet->board drop resolves by
   // cursor geometry (not this measurement), so it's unaffected either way.
   const droppableMeasuringStrategy = sheetZoom !== 1 ? MeasuringStrategy.BeforeDragging : MeasuringStrategy.Always;

   // The one copy of the surface precedence: the sidebar's action set and the surface switch below both
   // dispatch on it, so they can never disagree about which surface is showing. The switch re-tests
   // `character` on the play-area branch only to narrow it non-null for the sheet.
   const activeWindow = resolveActiveWindow({ hasNote: !!activeNote, hasBoard: !!activeBoard, hasCharacter: !!character });

   return (
      <DndContext sensors={sensors} onDragOver={handleDragOver} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel} collisionDetection={customCollisionDetection} measuring={{ droppable: { strategy: droppableMeasuringStrategy } }}>
         {/* The shell is a fixed viewport: `relative` anchors the Expanded overlay, `overflow-hidden`
             clips its recede off-screen so no state ever scrolls the page. */}
         <div className="relative flex overflow-hidden bg-background text-foreground" style={{ height: '100%', width: '100%' }}>
            {/* Raised above the Expanded overlay so the sidebar always stays exposed (the overlay's left
                edge tucks behind it). */}
            <div className="relative z-40 flex">
               <SidebarMenu
                  isEditing={isEditing}
                  isDrawerOpen={isDrawerOpen}
                  isCollapsed={isSidebarCollapsed}
                  activeWindow={activeWindow}
                  onExportNoteMarkdown={exportActiveNoteAsMarkdown}
                  onImportNoteMarkdownFile={importMarkdownFile}
                  onToggleEditing={() => setIsEditing(!isEditing)}
                  onToggleDrawer={() => setDrawerOpen(!isDrawerOpen)}
                  onToggleCollapse={toggleSidebarCollapsed}
                  onOpenSettings={() => openSettingsHub('general')}
                  onOpenWhatsNew={() => openSettingsHub('whatsNew')}
                  onOpenHelp={() => openSettingsHub('learn')}
               />
            </div>

            {/* Everything right of the sidebar: the workspace column + the side panel, and the Expanded
                overlay that covers exactly this region (so it starts at the sidebar's right edge, never
                under it). `overflow-hidden` clips the overlay's recede off-screen - no page scroll. */}
            <div className="relative flex flex-1 min-w-0 overflow-hidden">

            {/* Navigator: an in-flow LEFT panel crawling the portal graph - a flex sibling (like the Drawer,
                mirrored left) that SHRINKS the workspace rather than overlaying it. Mounted here (above the
                per-tab surface switch) so a jump-induced tab change never unmounts it mid-crawl. Opposite the
                right-side Layers panel + Drawer. */}
            <AnimatePresence>
               {navigatorOpen && <NavigatorPanel />}
            </AnimatePresence>

            {/* Character Sheet Area. `min-w-0` caps this flex item to its allocation so
                the tab strip scrolls instead of growing the item and pushing the
                sidebar/drawer off-screen. */}
            {/* `isolate`: contain the workspace's own stacking (the board's z-40 toolbar/name pill, floating
                windows, etc.) so the whole column reads as one layer BELOW the Expanded drawer overlay, which
                sits above it as the takeover it is. Without this the board chrome leaks over the drawer. */}
            <div {...getRootProps()} className="relative isolate w-full h-full flex-1 min-w-0 flex flex-col">

               {/* Multi-character tab strip (desktop top bar) */}
               <TabStrip forceDropHighlight={isOverTabLane} />

               {/* Portal trail: a docked breadcrumb bar in its own row between the tabs and the work area,
                   shown only during a portal dive - so it never floats over a surface's toolbar. */}
               <PortalTrailBar />

               {/* Content area: own positioning context for the absolutely-filled
                   sheet/menu so they sit below the strip rather than over it. */}
               <div className="relative flex-1 min-h-0">
                  { activeWindow === 'NOTE' ? (
                     <Suspense fallback={<TabViewLoading kind="note" />}>
                        <NoteView />
                     </Suspense>
                  ) : activeWindow === 'BOARD' ? (
                     <Suspense fallback={<TabViewLoading kind="board" />}>
                        <BoardView />
                     </Suspense>
                  ) : activeWindow === 'PLAY_AREA' && character ? (
                     <CharacterSheetSurface
                        scrollRef={sheetScrollRef}
                        character={character}
                        namePlaceholder={t('CharacterSheetPage.characterNamePlaceholder')}
                        onCommitName={updateCharacterName}
                        sheetZoom={sheetZoom}
                        isEditing={isEditing}
                        areTrackersEditable={areTrackersEditable}
                        onExportComponent={handleExportComponent}
                        onAddStatus={addStatus}
                        onAddStoryTag={addStoryTag}
                        statusIds={statusIds}
                        storyTagIds={storyTagIds}
                        storyThemeIds={storyThemeIds}
                        onEditCard={handleEditCard}
                        onAddCard={handleAddCardClick}
                        onAddPortrait={addPortrait}
                        onAddChallenge={handleCreateChallenge}
                        onAddJournal={addJournal}
                        sheetHighlight={sheetHighlight}
                     />
                  )           : (
                     <MainMenu />
                  )}


                  <WorkspaceContentOverlays
                     activeDragItem={activeDragItem}
                     isBoardActive={!!activeBoard || !!activeNote}
                     isIncompatibleComponentDrag={isIncompatibleComponentDrag}
                     isFileDragActive={isFileDragActive}
                     hasCharacter={!!character}
                  />
               </div>

            </div>

            <WorkspaceDrawerRegion
               isDrawerOpen={isDrawerOpen}
               isDrawerExpanded={isDrawerExpanded}
               isOverDrawer={isOverDrawer}
               activeDragId={activeDragItem?.id ?? null}
               overDragId={overDragId}
               isFolderDragActive={isFolderDragActive}
               isDrawerItemDragActive={isDrawerItemDragActive}
               drawerDropTarget={drawerDropTarget}
               springTarget={springTarget}
               workspaceDwellKey={workspaceDwellKey}
            />
            </div>
         </div>

         {/* App-wide dice tray: a bottom panel overlaying any tab (mounted at the shell, not a page). */}
         <DiceTrayPanel />


         <WorkspaceDialogStack
            formRef={formRef}
            fileInputRef={fileInputRef}
            onFileSelected={handleFileSelected}
            noteMarkdownDialogs={noteMarkdownDialogs}
            commands={commands}
            isCardDialogOpen={isCardDialogOpen}
            onCardDialogOpenChange={setCardDialogOpen}
            onCardDialogConfirm={handleDialogConfirm}
            cardDialogMode={dialogMode}
            cardToEdit={cardToEdit}
            game={character?.game ?? 'LEGENDS'}
            challengeCardToEdit={challengeCardToEdit}
            onCloseChallengeEditor={closeChallengeEditor}
            isSettingsOpen={isSettingsOpen}
            onSettingsOpenChange={setSettingsOpen}
         />

         <WorkspaceDragOverlayLayer
            activeDragItem={activeDragItem}
            activeTabDrag={activeTabDrag}
            isEditing={isEditing}
            isCompactDrawer={isCompactDrawer}
            sheetZoom={sheetZoom}
            renderClone={renderClone}
            renderCluster={renderCluster}
         />
      </DndContext>
   );
}

export default function WorkspacePage() {
   const { isMobile } = useDeviceType();

   // The ActiveCharacterStoreProvider is mounted in App.tsx (above
   // AppStartManagerProvider, which also consumes the store), so it already covers
   // both shells here; no provider needed at this level.
   if (isMobile) {
      return <MobileCharacterSheetPage />;
   }

   return <DesktopWorkspacePage />;
}