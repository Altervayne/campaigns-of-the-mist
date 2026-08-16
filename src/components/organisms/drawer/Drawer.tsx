// -- React Imports --
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { AnimatePresence, motion } from 'framer-motion';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import cuid from 'cuid';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { Plus, ArrowLeft, Inbox, ArrowUpToLine, Download, Upload, Maximize2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { staticListSortingStrategy } from '@/lib/utils/dnd';
import { SPRING_BACK_KEY } from '@/lib/utils/dragFeedback';
import type { DrawerDropTarget } from '@/lib/utils/dragFeedback';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';
import { ACCEPT_DRAWER_IMPORT } from '@/lib/utils/fileAccept';

// -- Component Imports --
import { DrawerFolderEntry } from '@/components/molecules/drawer/DrawerFolderEntry';
import { DrawerItemEntry } from '@/components/molecules/drawer/DrawerItemEntry';
import { DrawerCompactItemEntry } from '@/components/molecules/drawer/DrawerCompactItemEntry';
import { SpringDwellAffordance } from '@/components/molecules/drawer/SpringDwellAffordance';
import { DrawerModificationWindow } from '@/components/organisms/drawer/DrawerModificationWindow';
import { DrawerSearchResultEntry } from '@/components/molecules/drawer/DrawerSearchResultEntry';
import { DrawerSearchResultCard } from '@/components/molecules/drawer/DrawerSearchResultCard';
import { DrawerSortControl } from '@/components/molecules/drawer/DrawerSortControl';
import { Breadcrumb } from '@/components/molecules/Breadcrumbs';
import FolderDropZone from '@/components/molecules/drawer/FolderDropZone';
import { DrawerHeader } from '@/components/molecules/drawer/DrawerHeader';
import { DrawerItemsSkeleton } from '@/components/molecules/drawer/DrawerContentSkeleton';

// -- Store and Hook Imports --
import { useDrawerStore } from '@/lib/stores/drawerStore';
import { useDrawerNavigation } from '@/hooks/drawer/useDrawerNavigation';
import { useDrawerActionState } from '@/hooks/drawer/useDrawerActionState';
import { useDrawerFileImport } from '@/hooks/drawer/useDrawerFileImport';
import { useDrawerMountLoad } from '@/hooks/drawer/useDrawerMountLoad';
import { useIsDrawerSearchActive, useJumpToSearchResult } from '@/hooks/drawer/useDrawerSearchSurface';
import { useAppSettingsActions, useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';

// -- Type Imports --
import type { Variants } from 'framer-motion';


const drawerVariants: Variants = {
   initial: {
      width: 0,
   },
   animate: {
      // Side-panel width. A touch narrower than before so the fixed-aspect Rich cards are shorter and a
      // couple more fit; List view stays the high-density surface. Keep in sync with the `w-88` inner panels.
      width: "22rem",
   },
   exit: {
      width: 0,
   },
};

const contentVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { delay: 0.1, duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};


export function Drawer({ isDragHovering, activeDragId, isFolderDragActive = false, drawerDropTarget = null, overDragId, springTargetId = null }: { isDragHovering : boolean, activeDragId: string | null, isFolderDragActive?: boolean, drawerDropTarget?: DrawerDropTarget | null, overDragId: string | null; springTargetId?: string | null; }) {
   const { t: t } = useTranslation();
   const { t: tActions } = useTranslation()

   const {
      currentFolderId,
      navigateToFolder,
      currentItems,
      currentFolders,
      parentFolderId,
      breadcrumbPath,
      isContentLoading,
   } = useDrawerNavigation();

   useDrawerMountLoad();

   const {
      activeAction,
      setActiveAction,
      inputRef,
      handleAddFolder,
      handleConfirmAction,
      handleCloseModificationWindow,
      handleAnimationComplete,
   } = useDrawerActionState(currentFolderId);

   // The flat results + active flag come from the shared store (the search bar owns the input).
   const searchResults = useDrawerStore((state) => state.searchResults);
   const isSearchActive = useIsDrawerSearchActive();
   const handleJumpToResult = useJumpToSearchResult();

   const {
      getRootProps,
      isDragActive,
      handleFileSelected,
      handleExportDrawer,
      formRef,
      fileInputRef,
   } = useDrawerFileImport(currentFolderId);


   const isCompactDrawer = useAppSettingsStore((state) => state.isCompactDrawer);
   const { toggleCompactDrawer } = useAppSettingsActions();
   const { setDrawerOpen, expandDrawer } = useAppGeneralStateActions();


   const folderIds = useMemo(() => currentFolders.map(f => f.id), [currentFolders]);
   // Index of the dragged folder within this view (-1 when an item/nothing is dragged),
   // used to suppress expansion of the two no-op slots flanking it.
   const activeFolderIndex = useMemo(() => {
      if (!activeDragId) return -1;
      return currentFolders.findIndex(f => f.id === activeDragId);
   }, [activeDragId, currentFolders]);

   const droppableId = `drawer-drop-zone-${currentFolderId || 'root'}`;
   const { setNodeRef } = useDroppable({id: droppableId});

   const { setNodeRef: backButtonRef, isOver: isOverBackButton } = useDroppable({
      id: `drawer-back-button-${currentFolderId}`,
      data: {
         type: DRAG_TYPES.DRAWER_BACK_BUTTON,
         destinationId: parentFolderId,
      },
      disabled: !currentFolderId,
   });


   return (
      <motion.aside
         data-tutorial="drawer"
         data-drawer-panel
         variants={drawerVariants}
         initial="initial"
         animate="animate"
         exit="exit"
         // Same easing/duration as the Library grow/shrink, so open/expand/contract/close read as one
         // right-anchored drawer.
         transition={{ duration: 0.3, ease: 'easeInOut' }}
         className="bg-card border-l-2 border-border h-full flex flex-col overflow-hidden"
      >
         <div {...getRootProps()} className="relative w-88 h-full">

            <div className="relative w-88 h-full">
               <motion.div
                  variants={contentVariants}
                  className="w-full p-0 h-full flex flex-col"
               >
                     {/* Shared header (identical to the Library's) - only the mode button differs: Expand here. */}
                     <DrawerHeader
                        title={t('Common.drawer')}
                        isCompactDrawer={isCompactDrawer}
                        onToggleView={toggleCompactDrawer}
                        modeIcon={<Maximize2 className="h-6 w-6" />}
                        modeLabel={t('Drawer.expand')}
                        onMode={expandDrawer}
                        onClose={() => setDrawerOpen(false)}
                     >
                        {/* The breadcrumb is browse-only - hidden while searching (you are not in a folder). */}
                        {!isSearchActive && breadcrumbPath.length > 0 && (
                           <div className="flex items-center gap-2 mt-2">
                              <div onClick={() => navigateToFolder(null)} className="rounded p-1 hover:bg-muted cursor-pointer shrink-0" role="button" aria-label={t('Drawer.backToRoot')}>
                                 <ArrowUpToLine className="h-4 w-4" />
                              </div>
                              <Breadcrumb path={breadcrumbPath} onNavigate={navigateToFolder} />
                           </div>
                        )}
                     </DrawerHeader>

                     <motion.div
                        // Cross-fade the BODY across expand<->reduce: it fades out, the vertical (here)
                        // <-> horizontal (Library) layout swaps while it is invisible, then it fades back
                        // in. The header above and the panel resize are untouched. Quick so it stays snappy.
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.15, delay: 0.1 }}
                        exit={{ opacity: 0, transition: { duration: 0.12 } }}
                        className="grow bg-popover overflow-y-auto flex flex-col"
                     >
                        {isSearchActive ? (
                           /* Flat results: a light row per matching item; the browse chrome (back / folders /
                              add-folder / items) is absent, not overlaid. Results are not draggable/reorderable. */
                           <div className="flex flex-1 flex-col gap-2 p-2">
                              {/* Sort control: ordering is frequently changed, so it sits at the results header. */}
                              <DrawerSortControl />
                              {searchResults && searchResults.length > 0 ? (
                                 searchResults.map((summary) => {
                                    const resultProps = {
                                       summary,
                                       onJumpTo: () => handleJumpToResult(summary.parentFolderId),
                                       onRename: () => setActiveAction({ id: cuid(), type: 'rename-item', target: summary }),
                                       onDelete: () => setActiveAction({ id: cuid(), type: 'delete-item', target: summary }),
                                       onMove: () => setActiveAction({ id: cuid(), type: 'move-item', target: summary }),
                                    };
                                    // Rich -> the lazy rich card (preview loads when scrolled to); List -> the light row.
                                    return isCompactDrawer
                                       ? <DrawerSearchResultEntry key={summary.id} {...resultProps} />
                                       : <DrawerSearchResultCard key={summary.id} {...resultProps} />;
                                 })
                              ) : (
                                 <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                                    <Inbox className="mx-auto h-16 w-16 text-muted-foreground" />
                                    <p className="mt-2 text-lg text-muted-foreground">{t('Drawer.search.noMatches')}</p>
                                 </div>
                              )}
                           </div>
                        ) : (
                        <>
                        {/* Folders render from the in-memory cache, so they are present instantly on
                            navigation - no skeleton here. Only the items area (below) shows a skeleton
                            while its query runs. */}
                        {/* Reflow containers animate POSITION not size: a full `layout` scales the box to
                            its new size, which stretches the non-`layout` children (folder rows, cards)
                            mid-animation. `layout="position"` slides them into place without that distortion. */}
                        <motion.div data-tutorial="drawer-folders" layout="position" transition={{ duration: 0.1 }} className="flex flex-col w-full p-2 pt-0 border-b-2 border-border overflow-hidden shrink-0">
                           {currentFolderId && (
                              <motion.div
                                 layout="position"
                                 transition={{ duration: 0.1 }}
                                 ref={backButtonRef}
                                 data-drawer-back
                                 onClick={() => navigateToFolder(parentFolderId)}
                                 className={cn(
                                    'relative flex h-10 items-center gap-2 p-2 bg-card rounded hover:bg-muted cursor-pointer mt-2 transition-colors',
                                    { 'bg-muted': isOverBackButton && activeDragId }
                                 )}
                                 role="button"
                              >
                                 <ArrowLeft className="h-5 w-5" />
                                 <span className="font-medium text-sm">{tActions('Drawer.Actions.moveUp')}</span>
                                 <SpringDwellAffordance active={springTargetId === SPRING_BACK_KEY} />
                              </motion.div>
                           )}
                           {currentFolders.length > 0 && (
                              <SortableContext items={folderIds} strategy={staticListSortingStrategy}>
                                 {/* Folder reorder slots are always rendered: each is a thin, constant
                                     gap between folders, so the layout never jumps on drag start and
                                     spacing stays even. During a folder drag the slot under the cursor
                                     expands + highlights as the drop target, while the folder rows
                                     themselves stay free for spring-nav (dwell) and nest. */}
                                 {currentFolders.map((folder, index) => (
                                    <React.Fragment key={folder.id}>
                                       {/* These slots reorder FOLDERS, so they expand only during a folder drag
                                           (an item/card/tracker drag never expands them). When the dragged folder
                                           is in THIS view, the two slots flanking it are no-ops (skip them); when
                                           it was dragged in from elsewhere (not in view) every slot is valid, so
                                           it can be placed at any position here. */}
                                       <FolderDropZone
                                          id={`drop-zone-before-${folder.id}`}
                                          activeId={activeDragId}
                                          overId={overDragId}
                                          canExpand={isFolderDragActive && (activeFolderIndex === -1 || (index !== activeFolderIndex && index !== activeFolderIndex + 1))}
                                          data={{ type: 'drawer-drop-zone', targetId: folder.id, position: 'before' }}
                                       />
                                       <DrawerFolderEntry
                                          folder={folder}
                                          parentFolderId={currentFolderId}
                                          isOver={drawerDropTarget?.kind === 'folder' && drawerDropTarget.id === folder.id}
                                          isSpringTarget={springTargetId === folder.id}
                                          onNavigate={navigateToFolder}
                                          onRename={() => setActiveAction({ id: cuid(), type: 'rename-folder', target: folder })}
                                          onDelete={() => setActiveAction({ id: cuid(), type: 'delete-folder', target: folder })}
                                          onMove={() => setActiveAction({ id: cuid(), type: 'move-folder', target: folder })}
                                       />
                                    </React.Fragment>
                                 ))}
                                 {/* Folder-drag only; no-op when the dragged in-view folder is already last (a
                                     dragged-in folder, not in view, can always land last). */}
                                 <FolderDropZone
                                    id={`drop-zone-after-last`}
                                    activeId={activeDragId}
                                    overId={overDragId}
                                    canExpand={isFolderDragActive && (activeFolderIndex === -1 || activeFolderIndex !== currentFolders.length - 1)}
                                    data={{ type: 'drawer-drop-zone', targetId: 'last', position: 'after' }}
                                 />
                              </SortableContext>
                           )}
                           <motion.div layout="position" transition={{ duration: 0.1 }} className="bg-card mt-1 border-2 border-dashed border-border rounded">
                              <Button variant="ghost" className="w-full justify-start cursor-pointer" onClick={handleAddFolder}>
                                 <Plus className="mr-2 h-4 w-4" />
                                 {t('Drawer.addFolder')}
                              </Button>
                           </motion.div>
                        </motion.div>

                        <motion.div data-tutorial="drawer-items" layout="position" transition={{ duration: 0.1 }} className="flex-1 p-1 flex flex-col">
                           <div
                              ref={setNodeRef}
                              data-drawer-items-area
                              className={cn(
                                 "w-full grow min-h-full rounded-md border-2 border-dashed border-transparent transition-all duration-200 ease-in-out p-1",
                                 // Highlight when something is positioned to drop into THIS folder body:
                                 // a sheet item saving in (`isDragHovering`, still dnd-kit-routed) OR a
                                 // drawer move whose resolved target is the current folder (full-row,
                                 // resolver-driven, matches the drop). Same-folder reorder resolves to a
                                 // folder ROW target, so the body does not light up for it.
                                 (isDragHovering || drawerDropTarget?.kind === 'current-folder') && "border-primary bg-primary/10"
                              )}
                           >
                              {isContentLoading ? (
                                 // Navigating: a layout-matched ITEM skeleton (threshold-gated, so an
                                 // instant load never flashes it); the folder list above stays put.
                                 <DrawerItemsSkeleton compact={isCompactDrawer} />
                              ) : currentItems.length > 0 ? (
                                 <div className="flex flex-col gap-2">
                                    {/* Live shuffle: siblings animate aside to open a real gap where the
                                        dragged item will land. The `over` is resolved by live geometry in
                                        customCollisionDetection, so the shuffle lands correctly. */}
                                    <SortableContext items={currentItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
                                       {currentItems.map((item) => {
                                          const commonProps = {
                                             item,
                                             parentFolderId: currentFolderId,
                                             onRename: () => setActiveAction({ id: cuid(), type: 'rename-item', target: item }),
                                             onDelete: () => setActiveAction({ id: cuid(), type: 'delete-item', target: item }),
                                             onMove: () => setActiveAction({ id: cuid(), type: 'move-item', target: item }),
                                          };

                                          return isCompactDrawer
                                             ? <DrawerCompactItemEntry key={item.id} {...commonProps} />
                                             : <DrawerItemEntry key={item.id} {...commonProps} />;
                                       })}
                                    </SortableContext>
                                 </div>
                              ) : (
                                 <motion.div layout="position" transition={{ duration: 0.1 }} className="text-center py-8 h-full flex flex-col justify-center items-center">
                                    <Inbox className="mx-auto h-16 w-16 text-muted-foreground" />
                                    <p className="text-lg text-muted-foreground mt-2">{t('Drawer.emptyFolder')}</p>
                                 </motion.div>
                              )}
                           </div>
                        </motion.div>
                        </>
                        )}
                     </motion.div>

                     <div className="flex flex-col shrink-0 p-2 mt-auto gap-2 bg-card border-t-2 border-border">
                        <form ref={formRef} className="hidden">
                           <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileSelected}
                              accept={ACCEPT_DRAWER_IMPORT}
                           />
                        </form>
                        <Button
                           data-tutorial="drawer-import"
                           variant="default"
                           className="w-full cursor-pointer"
                           onClick={() => fileInputRef.current?.click()}
                        >
                           <Download className="mr-2 h-4 w-4" />
                           {tActions('Drawer.Actions.import')}
                        </Button>
                        <Button
                           data-tutorial="drawer-export"
                           variant="default"
                           className="w-full cursor-pointer"
                           onClick={handleExportDrawer}
                        >
                           <Upload className="mr-2 h-4 w-4" />
                           {tActions('Drawer.Actions.exportFull')}
                        </Button>
                     </div>
               </motion.div>


               {activeAction && <div className="absolute inset-0 bg-black/40" />}

               <AnimatePresence>
                  {activeAction && (
                     <motion.div
                        key={activeAction.id}
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                        onAnimationComplete={activeAction ? handleAnimationComplete : undefined}
                        className="absolute inset-0 z-10 flex flex-col justify-end"
                     >
                        <div className="relative z-20">
                           <DrawerModificationWindow
                              ref={inputRef}
                              action={activeAction}
                              onClose={handleCloseModificationWindow}
                              onConfirm={handleConfirmAction}
                           />
                        </div>
                     </motion.div>
                  )}
               </AnimatePresence>
            </div>

            <AnimatePresence>
               {isDragActive && (
                  <motion.div
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     exit={{ opacity: 0 }}
                     className="absolute inset-0 z-20 flex items-center justify-center p-3 bg-card/80 backdrop-blur-sm"
                  >
                     <div className="flex flex-col items-center justify-center w-full h-full text-center p-12 border-4 border-dashed border-primary/30">
                        <Download className="mx-auto h-12 w-12 text-primary" />
                        <p className="mt-2 font-semibold text-foreground">
                           {t('Drawer.dropToImport')}
                        </p>
                     </div>
                  </motion.div>
               )}
            </AnimatePresence>

         </div>
      </motion.aside>
   );
};
