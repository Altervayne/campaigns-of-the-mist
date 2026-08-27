// -- React Imports --
import React from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- DnD Component Imports --
import { Sortable, DragStaticWrapper } from '@/components/dnd';

// -- Component Imports --
import { SpringDwellAffordance } from '@/components/molecules/drawer/SpringDwellAffordance';

// -- Basic UI Imports --
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { Folder, MoreHorizontal, Pencil, Trash2, Move, GripVertical, Upload, ChevronRight } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { DRAWER_MENU_TRIGGER_CLASS } from '@/components/molecules/drawer/drawerMenuTrigger';
import { exportToFile, generateExportFilename } from '@/lib/utils/export-import';
import { exportFolderAsNestedTree } from '@/lib/drawer/drawerRepository';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

// -- Type Imports --
import type { DrawerFolderRecord } from '@/lib/drawer/drawerRecords';



export function DrawerFolderEntry({ folder, parentFolderId, isOver, isSpringTarget = false, onNavigate, onRename, onDelete, onMove }: { folder: DrawerFolderRecord, parentFolderId: string | null, isOver: boolean, isSpringTarget?: boolean, onNavigate: (id: string) => void, onRename: () => void, onDelete: () => void, onMove: () => void }) {
   const { t } = useTranslation();

   // The folder row is now a flat record; reassemble its full subtree from the
   // repository before exporting it to the nested `.cotm` shape.
   const handleExport = async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
         const nestedFolder = await exportFolderAsNestedTree(folder.id);
         const fileName = generateExportFilename('NEUTRAL', 'FOLDER', folder.name);
         await exportToFile(nestedFolder, 'FOLDER', 'NEUTRAL', fileName);
         toast.success(t('Notifications.drawer.folderExported'));
      } catch {
         toast.error(t('Notifications.drawer.actionFailed'));
      }
   };

   return (
      <Sortable
         id={folder.id}
         data={{
            type: DRAG_TYPES.DRAWER_FOLDER,
            item: folder,
            parentFolderId,
            isDrawer: true
         }}
      >
         {({ dragAttributes, dragListeners, isBeingDragged }) => (
            <div data-folder-id={folder.id} onClick={() => onNavigate(folder.id)}>
               <DragStaticWrapper isBeingDragged={isBeingDragged}>
                  <div
                     className={cn(
                        "group relative flex items-center justify-between gap-2 py-1 pl-1 pr-2 rounded hover:bg-muted data-[state=open]:bg-muted",
                        {
                           // Full-row "drop INTO this folder" treatment, driven by the resolved
                           // drop target so it matches the full-row drop: a clear ring + fill,
                           // visibly distinct from the plain hover state above.
                           "ring-2 ring-inset ring-primary bg-primary/10": isOver,
                        }
                     )}
                  >
                     <SpringDwellAffordance active={isSpringTarget} />
                     <div
                        className="flex min-h-8 min-w-0 items-center gap-2"
                        onClick={() => onNavigate(folder.id)}
                     >
                        {/* The grip carries the drag listeners on a wrapper span (not the bare SVG) so a
                            coarse-pointer `touch-target` slop can extend the hold-to-drag area past the 20px
                            glyph; a `::before` never renders on an `<svg>`. Layout + visual are unchanged. */}
                        <span className="touch-target flex shrink-0 cursor-grab" {...dragAttributes} {...dragListeners}>
                           <GripVertical className="h-5 w-5 text-muted-foreground" />
                        </span>
                        {/* Folders use the app `accent` token, not a per-type identity color - they hold
                            mixed types, so the filled tile just reads "enterable container". */}
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                           <Folder className="h-4 w-4" />
                        </span>
                        {/* A long name wraps to two lines (then ellipsis) rather than truncating on one; the
                            row grows to fit. Full name on hover. Short names are unaffected. */}
                        <span title={folder.name} className="min-w-0 line-clamp-2 font-medium text-sm">{folder.name}</span>
                     </div>

                     {/* The chevron signals "enterable" at rest and cedes its slot to the actions menu on
                         hover, so the two never fight for the trailing space. */}
                     <div className="relative flex size-6 shrink-0 items-center justify-center">
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-opacity group-hover:opacity-0" />
                        <DropdownMenu>
                           <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()} className="cursor-pointer">
                              <Button variant="ghost" size="icon" className={`absolute inset-0 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ${DRAWER_MENU_TRIGGER_CLASS}`}>
                                 <MoreHorizontal className="h-4 w-4" />
                              </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename(); }} className="cursor-pointer">
                                 <Pencil className="mr-2 h-4 w-4" />
                                 <span>{t('Drawer.Actions.rename')}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMove(); }} className="cursor-pointer">
                                 <Move className="mr-2 h-4 w-4" />
                                 <span>{t('Common.move')}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={handleExport} className="cursor-pointer">
                                 <Upload className="mr-2 h-4 w-4" />
                                 <span>{t('Drawer.Actions.export')}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive cursor-pointer">
                                 <Trash2 className="mr-2 h-4 w-4" />
                                 <span>{t('Drawer.Actions.delete')}</span>
                              </DropdownMenuItem>
                           </DropdownMenuContent>
                        </DropdownMenu>
                     </div>
                  </div>
               </DragStaticWrapper>
            </div>
         )}
      </Sortable>
   );
};
