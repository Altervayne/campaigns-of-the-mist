// -- Other Library Imports --
import { AnimatePresence } from 'framer-motion';

// -- Component Imports --
import { Drawer } from '@/components/organisms/drawer/Drawer';
import { ExpandedDrawer } from '@/components/organisms/drawer/ExpandedDrawer';

// -- Type Imports --
import type { DrawerDropTarget } from '@/lib/utils/dragFeedback';


interface WorkspaceDrawerRegionProps {
   isDrawerOpen: boolean;
   isDrawerExpanded: boolean;
   /** A sheet item is hovering the drawer, for the save-in highlight. */
   isOverDrawer: boolean;
   /** The dragged item/folder id and the dnd-kit `over` id, shared by both layouts. */
   activeDragId: string | null;
   overDragId: string | null;
   isFolderDragActive: boolean;
   isDrawerItemDragActive: boolean;
   drawerDropTarget: DrawerDropTarget | null;
   springTarget: string | null;
   workspaceDwellKey: string | null;
}

/**
 * The drawer region: the Open side panel and the Expanded takeover, each on its own presence
 * boundary. They are two layouts over one drawer store, and only one is ever mounted.
 */
export function WorkspaceDrawerRegion({ isDrawerOpen, isDrawerExpanded, isOverDrawer, activeDragId, overDragId, isFolderDragActive, isDrawerItemDragActive, drawerDropTarget, springTarget, workspaceDwellKey }: WorkspaceDrawerRegionProps) {
   return (
      <>
         {/* Drawer (Open side panel). Hidden while Expanded - the takeover renders over the whole row. */}
         <AnimatePresence>
            {isDrawerOpen && !isDrawerExpanded &&
               <Drawer
                  isDragHovering={isOverDrawer}
                  activeDragId={activeDragId}
                  isFolderDragActive={isFolderDragActive}
                  drawerDropTarget={drawerDropTarget}
                  overDragId={overDragId}
                  springTargetId={springTarget}
               />
            }
         </AnimatePresence>

         {/* Expanded drawer: an overlay over this whole region (TabStrip + sheet/board + side-panel
             region stay behind it; the sidebar is outside it, so it stays visible). It grows in from
             the right and recedes for See-Workspace - kept MOUNTED throughout so a live drag survives.
             `custom={isDrawerOpen}` drives the dynamic exit: contract (still open) hands back to the side
             panel; close (not open) slides off the right. */}
         <AnimatePresence custom={isDrawerOpen}>
            {isDrawerExpanded &&
               <ExpandedDrawer
                  key="expanded-drawer"
                  isItemDragActive={isDrawerItemDragActive}
                  isFolderDragActive={isFolderDragActive}
                  workspaceDwellKey={workspaceDwellKey}
                  activeDragId={activeDragId}
                  overDragId={overDragId}
                  drawerDropTarget={drawerDropTarget}
                  springTargetId={springTarget}
               />
            }
         </AnimatePresence>
      </>
   );
}
