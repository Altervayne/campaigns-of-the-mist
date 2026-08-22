// -- React Imports --
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Library Imports --
import toast from 'react-hot-toast';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { useDesktopDragSensors } from '@/hooks/useDesktopDragSensors';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// -- Icon Imports --
import { Check, Copy, Download, GripVertical, MoreHorizontal, Palette, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';

// -- DnD Component Imports --
import { Sortable, DragStaticWrapper } from '@/components/dnd';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { DRAWER_MENU_TRIGGER_CLASS } from '@/components/molecules/drawer/drawerMenuTrigger';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';
import { restrictToParentElement, restrictToVerticalAxis } from '@/lib/utils/dndModifiers';
import { exportCardPalette, importFromFile } from '@/lib/utils/export-import';
import { ACCEPT_CARD_PALETTE_IMPORT } from '@/lib/utils/fileAccept';

// -- Theme Imports --
import { CARD_TYPES_BY_GAME } from '@/lib/theme/cardPalettes';
import { defaultCardTypesForGame } from '@/lib/theme/cardPaletteProbe';
import { useCreateCardPalette } from '@/lib/theme/useCreateCardPalette';
import { useCardPaletteImport } from '@/lib/theme/useCardPaletteImport';

// -- Store Imports --
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { DragEndEvent } from '@dnd-kit/core';
import type { SortableChildProps } from '@/components/dnd';
import type { PaperSet } from '@/lib/theme/themeTokens';
import type { CardPalette, CardPaletteGame } from '@/lib/theme/cardPalettes';

/*
 * The card-palette manager for one game: a pinned read-only Default row + a scrollable Customs section. Each
 * palette is a ROW whose body selects it on click (active = selected), with a hover-revealed "..." menu:
 * the Default is immutable so it only Duplicates; customs also Rename (inline) + Delete (confirmed). Duplicate
 * copies any entry's card-type colors into a fresh custom and selects it. Mirrors the chrome ThemeManager,
 * scoped to this game. No editing here (that lands with the palette editor).
 */

/** The drag listeners a custom row's grip carries (from the Sortable render props). */
type DragHandleProps = Pick<SortableChildProps, 'dragAttributes' | 'dragListeners'>;

/** A selectable row: 'default' for the built-in, or a custom's id, plus the card-type colors a duplicate copies. */
interface PaletteRow {
   id: string;
   label: string;
   isCustom: boolean;
   cardTypes: Record<string, PaperSet>;
}

/** A small uppercase section heading, matching the manager's group labels. */
function SectionHeading({ children }: { children: React.ReactNode }) {
   return <span className="px-1 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>;
}

/** The PaperSet a game's first card type resolves to, used for a row's preview swatch (null when none read). */
function representativeSet(game: CardPaletteGame, cardTypes: Record<string, PaperSet>): PaperSet | null {
   for (const def of CARD_TYPES_BY_GAME[game]) {
      if (cardTypes[def.slug]) return cardTypes[def.slug];
   }
   return null;
}

/** A three-chip preview of a palette's header / background / accent, so a palette reads at a glance. */
function PaletteSwatch({ set, className }: { set: PaperSet | null; className?: string }) {
   return (
      <span className={cn('flex h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border', className)}>
         {set ? (
            <>
               <span className="flex-1" style={{ backgroundColor: set['paper-primary'] }} />
               <span className="flex-1" style={{ backgroundColor: set['paper-background'] }} />
               <span className="flex-1" style={{ backgroundColor: set['paper-accent'] }} />
            </>
         ) : (
            <span className="flex-1 bg-muted" />
         )}
      </span>
   );
}

/**
 * Lists, selects, and CRUDs one game's card palettes; editing a palette's contents opens the editor takeover.
 * `onEnterEditor` drops into that editor after selecting a palette (the per-custom pencil + the New button);
 * `guardedSwitch` routes every draft-abandoning action (select, New, Duplicate) through the pane's dirty guard.
 * Both default to inert so the manager still renders standalone.
 */
export function CardPaletteManager({ game, onEnterEditor, guardedSwitch = (proceed) => proceed() }: { game: CardPaletteGame; onEnterEditor?: () => void; guardedSwitch?: (proceed: () => void) => void }) {
   const { t } = useTranslation();
   const cardPalettes = useAppSettingsStore((state) => state.cardPalettes);
   const activeCardPalettes = useAppSettingsStore((state) => state.activeCardPalettes);
   const { setActiveCardPalette, updateCardPalette, deleteCardPalette, reorderCardPalettes } = useAppSettingsActions();

   // The built-in colors, read once per game from the live stylesheet; seed both the Default swatch and its
   // duplicate.
   const defaultCardTypes = useMemo(() => defaultCardTypesForGame(game), [game]);
   const activeId = activeCardPalettes[game];
   const customs = cardPalettes.filter((entry) => entry.game === game);

   // A LOCAL drag context, scoped to this game's customs list, never the app-wide DnD. The small activation
   // distance lets a click (select) or a grip tap fire without starting a drag.
   const sensors = useDesktopDragSensors();
   const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) reorderCardPalettes(String(active.id), String(over.id));
   };

   const [renamingId, setRenamingId] = useState<string | null>(null);
   const [renameDraft, setRenameDraft] = useState('');
   const [pendingDelete, setPendingDelete] = useState<CardPalette | null>(null);

   const createFrom = useCreateCardPalette();
   // Duplicate any entry into a new, independent custom (deep-copied card-type colors), then select it.
   const duplicate = (row: PaletteRow) => guardedSwitch(() => createFrom(game, row.cardTypes, t('SettingsDialog.cardPalettes.copyName', { name: row.label })));
   // Start a fresh palette from the Default (also the empty-state action), select it, then edit it.
   const createNew = () => guardedSwitch(() => { createFrom(game, defaultCardTypes, t('SettingsDialog.cardPalettes.newPaletteName')); onEnterEditor?.(); });
   // Per-custom one-click edit: select the row's palette, then drop into the editor takeover on it.
   const editCustom = (row: PaletteRow) => guardedSwitch(() => { if (row.id !== activeId) setActiveCardPalette(game, row.id); onEnterEditor?.(); });

   const startRename = (id: string, current: string) => { setRenamingId(id); setRenameDraft(current); };
   const commitRename = (id: string) => {
      const trimmed = renameDraft.trim();
      if (trimmed) updateCardPalette(id, { name: trimmed });
      setRenamingId(null);
   };

   const importInputRef = useRef<HTMLInputElement>(null);
   const importFormRef = useRef<HTMLFormElement>(null);

   // Export one custom palette to a .cotm file (its game + name + every card-type's colors).
   const exportPalette = async (id: string) => {
      const palette = customs.find((entry) => entry.id === id);
      if (!palette) return;
      try {
         await exportCardPalette(palette);
         toast.success(t('Notifications.cardPalette.exported'));
      } catch (error) {
         console.error('Card palette export failed:', error);
         toast.error(t('Notifications.general.exportError'));
      }
   };

   // Import a .cotm palette from the file dialog. It routes to its OWN game's list (game is intrinsic), which
   // may differ from this pane's game - that is correct, so no filter by the current game here.
   const importPalette = useCardPaletteImport();
   const handleImportFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
         const imported = await importFromFile(file);
         guardedSwitch(() => importPalette(imported));
      } catch (error) {
         console.error('Card palette import failed:', error);
         toast.error(t('Notifications.general.importFailed'));
      }
      importFormRef.current?.reset();
   };

   const defaultRow: PaletteRow = { id: 'default', label: t('SettingsDialog.cardPalettes.default'), isCustom: false, cardTypes: defaultCardTypes };
   const customRows: PaletteRow[] = customs.map((palette) => ({ id: palette.id, label: palette.name, isCustom: true, cardTypes: palette.cardTypes }));

   const renderRow = (row: PaletteRow, dragHandle?: DragHandleProps) => {
      const isActive = activeId === row.id;

      // A custom row mid-rename swaps its body for the inline input (commit on Enter/Check, cancel on Esc/X).
      if (row.isCustom && renamingId === row.id) {
         return (
            <div key={row.id} className="flex items-center gap-1.5">
               <Input
                  autoFocus
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') commitRename(row.id); if (event.key === 'Escape') setRenamingId(null); }}
                  placeholder={t('SettingsDialog.cardPalettes.renamePlaceholder')}
                  className="h-9 flex-1"
               />
               <Button variant="default" size="icon" onClick={() => commitRename(row.id)} title={t('SettingsDialog.themes.save')} className="shrink-0 cursor-pointer">
                  <Check className="h-4 w-4" />
               </Button>
               <Button variant="outline" size="icon" onClick={() => setRenamingId(null)} title={t('SettingsDialog.dangerZone.resetDialog.cancel')} className="shrink-0 cursor-pointer">
                  <X className="h-4 w-4" />
               </Button>
            </div>
         );
      }

      return (
         <div
            key={row.id}
            onClick={() => { if (row.id !== activeId) guardedSwitch(() => setActiveCardPalette(game, row.id)); }}
            className={cn(
               'group/row relative flex cursor-pointer items-center rounded-md',
               isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
            )}
         >
            {/* Custom rows get a hover-revealed grip that carries the drag listeners; the Default has none.
                Its click is swallowed so a grip tap never toggles selection. */}
            {dragHandle && (
               <button
                  type="button"
                  {...dragHandle.dragAttributes}
                  {...dragHandle.dragListeners}
                  onClick={(event) => event.stopPropagation()}
                  title={t('SettingsDialog.themes.reorder')}
                  aria-label={t('SettingsDialog.themes.reorder')}
                  className="ml-1 flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground"
               >
                  <GripVertical className="h-4 w-4" />
               </button>
            )}
            {/* Leading swatch, so a palette reads at a glance. */}
            <PaletteSwatch set={representativeSet(game, row.cardTypes)} className={cn('h-6 w-6', dragHandle ? 'ml-1' : 'ml-3')} />
            <span className="min-w-0 flex-1 truncate py-2 pl-2 pr-1 text-sm">{row.label}</span>

            {/* Custom rows get a hover-revealed pencil (left of the `...`) for one-click edit; the Default is
                immutable, so it never shows it. */}
            {row.isCustom && (
               <Button
                  variant="ghost"
                  size="icon"
                  onClick={(event) => { event.stopPropagation(); editCustom(row); }}
                  title={t('Common.edit')}
                  aria-label={t('Common.edit')}
                  className={`absolute right-8 top-1/2 h-6 w-6 -translate-y-1/2 shrink-0 cursor-pointer opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 ${DRAWER_MENU_TRIGGER_CLASS}`}
               >
                  <Pencil className="h-4 w-4" />
               </Button>
            )}

            <DropdownMenu>
               <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
                  <Button
                     variant="ghost"
                     size="icon"
                     title={t('SettingsDialog.cardPalettes.actionsMenu')}
                     className={`absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 shrink-0 cursor-pointer opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 ${DRAWER_MENU_TRIGGER_CLASS}`}
                  >
                     <MoreHorizontal className="h-4 w-4" />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent onClick={(event) => event.stopPropagation()}>
                  <DropdownMenuItem onClick={() => duplicate(row)} className="cursor-pointer">
                     <Copy className="mr-2 h-4 w-4" /><span>{t('SettingsDialog.cardPalettes.duplicate')}</span>
                  </DropdownMenuItem>
                  {row.isCustom && (
                     <>
                        <DropdownMenuItem onClick={() => editCustom(row)} className="cursor-pointer">
                           <Palette className="mr-2 h-4 w-4" /><span>{t('Common.edit')}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => startRename(row.id, row.label)} className="cursor-pointer">
                           <Pencil className="mr-2 h-4 w-4" /><span>{t('SettingsDialog.cardPalettes.rename')}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportPalette(row.id)} className="cursor-pointer">
                           <Upload className="mr-2 h-4 w-4" /><span>{t('SettingsDialog.cardPalettes.export')}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                           onClick={() => setPendingDelete(customs.find((palette) => palette.id === row.id) ?? null)}
                           className="cursor-pointer text-destructive"
                        >
                           <Trash2 className="mr-2 h-4 w-4" /><span>{t('SettingsDialog.cardPalettes.delete')}</span>
                        </DropdownMenuItem>
                     </>
                  )}
               </DropdownMenuContent>
            </DropdownMenu>
         </div>
      );
   };

   return (
      <div className="flex flex-col gap-3">
         {/* The Default stays pinned at the top. */}
         <div className="flex flex-col gap-1">
            <SectionHeading>{t('SettingsDialog.cardPalettes.default')}</SectionHeading>
            <div className="flex flex-col gap-1">{renderRow(defaultRow)}</div>
         </div>

         {/* Customs sit below a divider; only this section is sortable - a local DndContext + SortableContext
             over the game's custom ids. The Default stays outside it. */}
         <div className="flex flex-col gap-1 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
               <SectionHeading>{t('SettingsDialog.cardPalettes.customsHeading')}</SectionHeading>
               {/* Icon-only to leave the heading room; the label lives in the tooltip + aria-label/title. */}
               <Tooltip>
                  <TooltipTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => importInputRef.current?.click()}
                        aria-label={t('SettingsDialog.cardPalettes.importPalette')}
                        title={t('SettingsDialog.cardPalettes.importPalette')}
                        className="h-6 w-6 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                     >
                        <Download className="h-3.5 w-3.5" />
                     </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('SettingsDialog.cardPalettes.importPalette')}</TooltipContent>
               </Tooltip>
            </div>
            {customRows.length > 0 ? (
               <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={handleDragEnd}>
                  <SortableContext items={customs.map((palette) => palette.id)} strategy={verticalListSortingStrategy}>
                     <div className="flex flex-col gap-1">
                        {customRows.map((row) => (
                           <Sortable key={row.id} id={row.id} data={{ type: DRAG_TYPES.CARD_PALETTE, item: row }}>
                              {({ dragAttributes, dragListeners, isBeingDragged }) => (
                                 <DragStaticWrapper isBeingDragged={isBeingDragged}>
                                    {renderRow(row, { dragAttributes, dragListeners })}
                                 </DragStaticWrapper>
                              )}
                           </Sortable>
                        ))}
                     </div>
                  </SortableContext>
               </DndContext>
            ) : (
               <p className="px-1 py-2 text-xs text-muted-foreground">{t('SettingsDialog.cardPalettes.noCustoms')}</p>
            )}

            {/* Below the scroller so it never scrolls away; the empty-state action too (works with zero customs). */}
            <Button variant="outline" size="sm" onClick={createNew} className="mt-1 w-full shrink-0 cursor-pointer">
               <Plus className="mr-1 h-4 w-4" />{t('SettingsDialog.cardPalettes.newPalette')}
            </Button>
         </div>

         <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>{t('SettingsDialog.cardPalettes.deleteConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                     {t('SettingsDialog.cardPalettes.deleteConfirmDescription', { name: pendingDelete?.name ?? '' })}
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">{t('SettingsDialog.dangerZone.resetDialog.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={() => { if (pendingDelete) deleteCardPalette(pendingDelete.id); setPendingDelete(null); }}
                     className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
                  >
                     {t('SettingsDialog.cardPalettes.deleteConfirmButton')}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>

         <form ref={importFormRef} className="hidden">
            <input type="file" ref={importInputRef} onChange={handleImportFileSelected} accept={ACCEPT_CARD_PALETTE_IMPORT} />
         </form>
      </div>
   );
}
