// -- React Imports --
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Library Imports --
import toast from 'react-hot-toast';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// -- Icon Imports --
import { Check, Download, GripVertical, MoreHorizontal, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';

// -- DnD Component Imports --
import { Sortable, DragStaticWrapper } from '@/components/dnd';

// -- Component Imports --
import { StencilMaskGlyph } from '@/components/molecules/StencilMaskGlyph';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { DRAWER_MENU_TRIGGER_CLASS } from '@/components/molecules/drawer/drawerMenuTrigger';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';
import { restrictToParentElement, restrictToVerticalAxis } from '@/lib/utils/dndModifiers';
import { ACCEPT_MASK_IMAGE, ACCEPT_STENCIL_IMPORT } from '@/lib/utils/fileAccept';
import { exportStencil, importFromFile } from '@/lib/utils/export-import';
import { MaskHasNoTransparencyError } from '@/lib/assets/normalizeMaskUpload';

// -- Store / Hook Imports --
import { useStencilLibraryStore } from '@/lib/stores/stencilLibraryStore';
import { addUploadedStencil } from '@/lib/stores/addUploadedStencil';
import { useStencilImport } from '@/hooks/useStencilImport';

// -- Type Imports --
import type { DragEndEvent } from '@dnd-kit/core';
import type { SortableChildProps } from '@/components/dnd';
import type { StencilRecord } from '@/lib/assets/stencilRecords';

/*
 * The stencil-library manager: the user's saved masks as a searchable, drag-reorderable list. Each row is a mask
 * glyph + its name + a hover "..." menu (Rename inline / Export / Delete-confirmed). "Add stencil" uploads a mask
 * straight into the library (normalize -> store -> add) and drops the new row into inline rename; Import reads a
 * `.cotm` stencil file (its mask bytes ride along). Deleting is SAFE - an image only soft-references a stencil and
 * keeps its own baked asset, so a delete never breaks an image, only removes re-apply-by-name. Reorder writes the
 * whole order through the store, so it is disabled while a search filter is active (a partial order would collide).
 * Board is desktop-only, so there is no mobile twin. All chrome stays on theme tokens.
 */

/** The drag listeners a row's grip carries (from the Sortable render props). */
type DragHandleProps = Pick<SortableChildProps, 'dragAttributes' | 'dragListeners'>;

export function StencilLibraryManager() {
   const { t } = useTranslation();
   const stencils = useStencilLibraryStore((state) => state.stencils);
   const { load, rename, remove, reorder } = useStencilLibraryStore((state) => state.actions);

   // The section can mount without the picker ever running, so hydrate the library on first view (idempotent).
   useEffect(() => { void load(); }, [load]);

   const [query, setQuery] = useState('');
   const [renamingId, setRenamingId] = useState<string | null>(null);
   const [renameDraft, setRenameDraft] = useState('');
   const [pendingDelete, setPendingDelete] = useState<StencilRecord | null>(null);
   const [busy, setBusy] = useState(false);
   // The row to reveal + flash after an add/import, so a new entry is never lost below the fold.
   const [highlightId, setHighlightId] = useState<string | null>(null);

   const uploadInputRef = useRef<HTMLInputElement>(null);
   const uploadFormRef = useRef<HTMLFormElement>(null);
   const importInputRef = useRef<HTMLInputElement>(null);
   const importFormRef = useRef<HTMLFormElement>(null);

   const importStencil = useStencilImport();

   const isFiltering = query.trim().length > 0;
   const filtered = useMemo(() => {
      const needle = query.trim().toLowerCase();
      if (!needle) return stencils;
      return stencils.filter((entry) => entry.name.toLowerCase().includes(needle));
   }, [stencils, query]);

   // Clear the reveal-flash after a moment; a new highlight (or unmount) cancels the pending clear.
   useEffect(() => {
      if (!highlightId) return;
      const timer = window.setTimeout(() => setHighlightId(null), 1600);
      return () => window.clearTimeout(timer);
   }, [highlightId]);

   // A LOCAL drag context, scoped to this list, never the app-wide DnD. The small activation distance lets a
   // grip tap fire without starting a drag.
   const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
      useSensor(KeyboardSensor),
   );
   const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = stencils.map((entry) => entry.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from < 0 || to < 0) return;
      void reorder(arrayMove(ids, from, to));
   };

   const startRename = (id: string, current: string) => { setRenamingId(id); setRenameDraft(current); };
   const commitRename = (id: string) => {
      const trimmed = renameDraft.trim();
      if (trimmed) void rename(id, trimmed);
      setRenamingId(null);
   };

   // Upload a mask straight into the library, then drop the new row into inline rename (its input auto-focuses,
   // which also scrolls it into view). Surfaces a friendly warning for a no-transparency mask.
   const handleUploadSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
         const record = await addUploadedStencil(file, t('BoardStencil.untitledStencil'));
         startRename(record.id, record.name);
         setHighlightId(record.id);
      } catch (error) {
         toast.error(error instanceof MaskHasNoTransparencyError ? t('BoardStencil.maskNoTransparency') : t('BoardStencil.maskUploadFailed'));
      } finally {
         setBusy(false);
         uploadFormRef.current?.reset();
      }
   };

   // Export one stencil to a .cotm file (its name + the embedded mask bytes).
   const exportOne = async (entry: StencilRecord) => {
      try {
         await exportStencil(entry.name, entry.maskAssetId);
         toast.success(t('Notifications.stencil.exported'));
      } catch (error) {
         console.error('Stencil export failed:', error);
         toast.error(t('Notifications.general.exportError'));
      }
   };

   const handleImportSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
         const imported = await importFromFile(file);
         const newId = await importStencil(imported);
         if (newId) { setQuery(''); setHighlightId(newId); }
      } catch (error) {
         console.error('Stencil import failed:', error);
         toast.error(t('Notifications.general.importFailed'));
      }
      importFormRef.current?.reset();
   };

   const renderRow = (entry: StencilRecord, dragHandle?: DragHandleProps) => {
      // A row mid-rename swaps its body for the inline input (commit on Enter/Check, cancel on Esc/X).
      if (renamingId === entry.id) {
         return (
            <div key={entry.id} className="flex items-center gap-1.5">
               <Input
                  autoFocus
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') commitRename(entry.id); if (event.key === 'Escape') setRenamingId(null); }}
                  placeholder={t('SettingsDialog.stencils.renamePlaceholder')}
                  className="h-9 flex-1"
               />
               <Button variant="default" size="icon" onClick={() => commitRename(entry.id)} title={t('SettingsDialog.themes.save')} className="shrink-0 cursor-pointer">
                  <Check className="h-4 w-4" />
               </Button>
               <Button variant="outline" size="icon" onClick={() => setRenamingId(null)} title={t('Common.cancel')} className="shrink-0 cursor-pointer">
                  <X className="h-4 w-4" />
               </Button>
            </div>
         );
      }

      return (
         <div
            key={entry.id}
            className={cn(
               'group/row relative flex items-center rounded-md transition-colors',
               highlightId === entry.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
            )}
         >
            {/* A hover-revealed grip carries the drag listeners; absent while filtering (order writes the full
                list, so a partial-order drag is disabled). */}
            {dragHandle && (
               <button
                  type="button"
                  {...dragHandle.dragAttributes}
                  {...dragHandle.dragListeners}
                  title={t('SettingsDialog.themes.reorder')}
                  aria-label={t('SettingsDialog.themes.reorder')}
                  className="ml-1 flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground"
               >
                  <GripVertical className="h-4 w-4" />
               </button>
            )}
            {/* Leading glyph, so a stencil reads at a glance. */}
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border text-foreground', dragHandle ? 'ml-1' : 'ml-3')}>
               <StencilMaskGlyph maskAssetId={entry.maskAssetId} className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1 truncate py-2 pl-2 pr-1 text-sm">{entry.name}</span>

            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button
                     variant="ghost"
                     size="icon"
                     title={t('SettingsDialog.stencils.actionsMenu')}
                     className={`absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 shrink-0 cursor-pointer opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 ${DRAWER_MENU_TRIGGER_CLASS}`}
                  >
                     <MoreHorizontal className="h-4 w-4" />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => startRename(entry.id, entry.name)} className="cursor-pointer">
                     <Pencil className="mr-2 h-4 w-4" /><span>{t('SettingsDialog.stencils.rename')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportOne(entry)} className="cursor-pointer">
                     <Upload className="mr-2 h-4 w-4" /><span>{t('SettingsDialog.stencils.export')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPendingDelete(entry)} className="cursor-pointer text-destructive">
                     <Trash2 className="mr-2 h-4 w-4" /><span>{t('SettingsDialog.stencils.delete')}</span>
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
         </div>
      );
   };

   return (
      <div className="flex flex-col gap-3">
         {/* Toolbar: a name filter (only useful with rows), plus Add + Import. */}
         <div className="flex items-center justify-between gap-2">
            {stencils.length > 0 ? (
               <Input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('BoardStencil.searchLibrary')}
                  className="h-9 w-56 max-w-full"
               />
            ) : (
               <span />
            )}
            <div className="flex shrink-0 items-center gap-1.5">
               <Button variant="outline" size="sm" onClick={() => uploadInputRef.current?.click()} disabled={busy} className="cursor-pointer">
                  <Plus className="mr-1 h-4 w-4" />{t('SettingsDialog.stencils.add')}
               </Button>
               <Tooltip>
                  <TooltipTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => importInputRef.current?.click()}
                        aria-label={t('SettingsDialog.stencils.import')}
                        title={t('SettingsDialog.stencils.import')}
                        className="h-8 w-8 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                     >
                        <Download className="h-4 w-4" />
                     </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('SettingsDialog.stencils.import')}</TooltipContent>
               </Tooltip>
            </div>
         </div>

         {stencils.length === 0 ? (
            // Empty state: a friendly hint plus the add affordance.
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-10 text-center">
               <p className="text-sm text-muted-foreground">{t('SettingsDialog.stencils.empty')}</p>
               <Button variant="outline" size="sm" onClick={() => uploadInputRef.current?.click()} disabled={busy} className="cursor-pointer">
                  <Plus className="mr-1 h-4 w-4" />{t('SettingsDialog.stencils.add')}
               </Button>
            </div>
         ) : filtered.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">{t('SettingsDialog.stencils.noMatches')}</p>
         ) : isFiltering ? (
            // Filtered view: static rows (no grips), since reorder writes the whole order.
            <div className="flex flex-col gap-1">{filtered.map((entry) => renderRow(entry))}</div>
         ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={handleDragEnd}>
               <SortableContext items={stencils.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-1">
                     {stencils.map((entry) => (
                        <Sortable key={entry.id} id={entry.id} data={{ type: DRAG_TYPES.STENCIL, item: entry }}>
                           {({ dragAttributes, dragListeners, isBeingDragged }) => (
                              <DragStaticWrapper isBeingDragged={isBeingDragged}>
                                 {renderRow(entry, { dragAttributes, dragListeners })}
                              </DragStaticWrapper>
                           )}
                        </Sortable>
                     ))}
                  </div>
               </SortableContext>
            </DndContext>
         )}

         <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>{t('SettingsDialog.stencils.deleteConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                     {t('SettingsDialog.stencils.deleteConfirmDescription', { name: pendingDelete?.name ?? '' })}
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">{t('Common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={() => { if (pendingDelete) void remove(pendingDelete.id); setPendingDelete(null); }}
                     className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
                  >
                     {t('SettingsDialog.stencils.deleteConfirmButton')}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>

         <form ref={uploadFormRef} className="hidden">
            <input type="file" ref={uploadInputRef} onChange={handleUploadSelected} accept={ACCEPT_MASK_IMAGE} />
         </form>
         <form ref={importFormRef} className="hidden">
            <input type="file" ref={importInputRef} onChange={handleImportSelected} accept={ACCEPT_STENCIL_IMPORT} />
         </form>
      </div>
   );
}
