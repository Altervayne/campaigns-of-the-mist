// -- React Imports --
import React, { useRef, useState } from 'react';
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
import { Check, Copy, Download, GripVertical, MoreHorizontal, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';

// -- DnD Component Imports --
import { Sortable, DragStaticWrapper } from '@/components/dnd';

// -- Component Imports --
import { ThemeSwatch } from '@/components/molecules/theme/ThemeSwatch';

// -- Hook Imports --
import { useThemeMode } from '@/hooks/useThemeMode';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { PRESET_LABELS, PRESET_THEMES, customThemeClass, resolveThemeTokens } from '@/lib/theme/themeTokens';
import { useCreateCustomTheme } from '@/lib/theme/useCreateCustomTheme';
import { restrictToParentElement, restrictToVerticalAxis } from '@/lib/utils/dndModifiers';
import { DRAWER_MENU_TRIGGER_CLASS } from '@/components/molecules/drawer/drawerMenuTrigger';
import { DRAG_TYPES } from '@/lib/constants/dragDrop';
import { exportCustomTheme, importFromFile } from '@/lib/utils/export-import';
import { ACCEPT_THEME_IMPORT } from '@/lib/utils/fileAccept';
import { useThemeImport } from '@/lib/theme/useThemeImport';
import { useThemeSwitchGuard } from '@/components/organisms/dialogs/themeSwitchGuard';

// -- Store Imports --
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { DragEndEvent } from '@dnd-kit/core';
import type { SortableChildProps } from '@/components/dnd';
import type { CustomTheme, PaperSet, TokenSet } from '@/lib/theme/themeTokens';
import type { ActiveTheme } from '@/lib/stores/appSettingsStore';

/** The drag listeners a custom row's grip carries (from the Sortable render props). */
type DragHandleProps = Pick<SortableChildProps, 'dragAttributes' | 'dragListeners'>;

/*
 * The theme manager: a pinned Presets section + a scrollable Customs section. Each theme is a ROW whose body
 * applies it on click (active = selected), with a hover-revealed "..." menu:
 * presets are immutable so they only Duplicate; customs also Rename (inline) + Delete (confirmed). Duplicate
 * copies any entry's resolved token sets into a fresh custom and selects it. No light/dark control here.
 */

/** A selectable theme entry: its active value, label, and the token sets a duplicate copies. */
interface ThemeEntry {
   value: ActiveTheme;
   label: string;
   isCustom: boolean;
   source: { light: TokenSet; dark: TokenSet; radius: string; paper: PaperSet };
}

/** A small uppercase section heading, matching the editor's group labels. */
function SectionHeading({ children }: { children: React.ReactNode }) {
   return <span className="px-1 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>;
}

/** `onEnterEditor` opens the hub's editor takeover after selecting a theme (the New button + per-row pencil). */
export function ThemeManager({ onEnterEditor }: { onEnterEditor?: () => void } = {}) {
   const { t } = useTranslation();
   const { resolvedMode } = useThemeMode();
   const activeTheme = useAppSettingsStore((state) => state.theme);
   const customThemes = useAppSettingsStore((state) => state.customThemes);
   const { setTheme, updateCustomTheme, deleteCustomTheme, reorderCustomThemes } = useAppSettingsActions();

   // A LOCAL drag context, scoped to this window's customs list - never the app-wide character/board DnD.
   // The small activation distance lets a click (select) or a grip tap fire without starting a drag.
   const sensors = useDesktopDragSensors();
   const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) reorderCustomThemes(String(active.id), String(over.id));
   };

   const [renamingId, setRenamingId] = useState<string | null>(null);
   const [renameDraft, setRenameDraft] = useState('');
   const [pendingDelete, setPendingDelete] = useState<CustomTheme | null>(null);

   const presetEntries: ThemeEntry[] = Object.keys(PRESET_LABELS).map((value) => ({
      value: value as ActiveTheme,
      label: PRESET_LABELS[value],
      isCustom: false,
      source: PRESET_THEMES[value],
   }));
   const customEntries: ThemeEntry[] = customThemes.map((theme) => ({
      value: customThemeClass(theme.id),
      label: theme.name,
      isCustom: true,
      source: { light: theme.light, dark: theme.dark, radius: theme.radius, paper: theme.paper },
   }));

   const createCustomFrom = useCreateCustomTheme();
   // Every action that abandons the current draft (select a row, Duplicate, New, Import) goes through this so
   // a dirty draft is confirmed first; with no unsaved edits it just runs.
   const guardedSwitch = useThemeSwitchGuard();

   // Duplicate ANY entry into a new, independent custom (deep-copied token sets), then select it.
   const duplicate = (entry: ThemeEntry) => guardedSwitch(() => createCustomFrom(entry.source, t('SettingsDialog.themes.copyName', { name: entry.label })));

   // Start a fresh theme from the Neutral preset (also the empty-state action), select it, then edit it.
   const createNew = () => guardedSwitch(() => { createCustomFrom(PRESET_THEMES['theme-neutral'], t('SettingsDialog.themes.newThemeName')); onEnterEditor?.(); });

   // Per-custom one-click edit: apply the row's theme, then drop into the editor takeover on it.
   const editCustom = (entry: ThemeEntry) => guardedSwitch(() => { if (entry.value !== activeTheme) setTheme(entry.value); onEnterEditor?.(); });

   const startRename = (id: string, current: string) => { setRenamingId(id); setRenameDraft(current); };
   const commitRename = (id: string) => {
      const trimmed = renameDraft.trim();
      if (trimmed) updateCustomTheme(id, { name: trimmed });
      setRenamingId(null);
   };

   const importInputRef = useRef<HTMLInputElement>(null);
   const importFormRef = useRef<HTMLFormElement>(null);

   // Export one custom theme to a .cotm file (the whole theme - light/dark token sets, radius, any seeds).
   const exportTheme = async (id: string) => {
      const theme = customThemes.find((entry) => entry.id === id);
      if (!theme) return;
      try {
         await exportCustomTheme(theme);
         toast.success(t('Notifications.theme.exported'));
      } catch (error) {
         console.error('Theme export failed:', error);
         toast.error(t('Notifications.general.exportError'));
      }
   };

   // Import a .cotm theme picked from the file dialog, through the shared import path (validate, fresh id,
   // add, select). No harmonize - themes are 2.0-native with no legacy migration.
   const importTheme = useThemeImport();
   const handleImportFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
         const imported = await importFromFile(file);
         guardedSwitch(() => importTheme(imported));
      } catch (error) {
         console.error('Theme import failed:', error);
         toast.error(t('Notifications.general.importFailed'));
      }
      importFormRef.current?.reset();
   };

   const renderRow = (entry: ThemeEntry, dragHandle?: DragHandleProps) => {
      const isActive = activeTheme === entry.value;
      const customId = entry.isCustom ? entry.value.replace('theme-custom-', '') : null;

      // A custom row mid-rename swaps its body for the inline input (commit on Enter/Check, cancel on Esc/X).
      if (customId && renamingId === customId) {
         return (
            <div key={entry.value} className="flex items-center gap-1.5">
               <Input
                  autoFocus
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') commitRename(customId); if (event.key === 'Escape') setRenamingId(null); }}
                  placeholder={t('SettingsDialog.themes.renamePlaceholder')}
                  className="h-9 flex-1"
               />
               <Button variant="default" size="icon" onClick={() => commitRename(customId)} title={t('SettingsDialog.themes.save')} className="shrink-0 cursor-pointer">
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
            key={entry.value}
            onClick={() => { if (entry.value !== activeTheme) guardedSwitch(() => setTheme(entry.value)); }}
            className={cn(
               'group/row relative flex cursor-pointer items-center rounded-md',
               isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
            )}
         >
            {/* Custom rows get a hover-revealed grip that carries the drag listeners; presets have none.
                Its click is swallowed so a grip tap never toggles selection. */}
            {dragHandle && (
               <button
                  type="button"
                  {...dragHandle.dragAttributes}
                  {...dragHandle.dragListeners}
                  onClick={(event) => event.stopPropagation()}
                  title={t('SettingsDialog.themes.reorder')}
                  aria-label={t('SettingsDialog.themes.reorder')}
                  className="ml-1 flex h-6 w-5 coarse:size-11 shrink-0 cursor-grab items-center justify-center text-muted-foreground"
               >
                  <GripVertical className="h-4 w-4" />
               </button>
            )}
            {/* Leading swatch, so a theme reads at a glance; resolved for the app's current light/dark mode. */}
            <ThemeSwatch tokens={resolveThemeTokens(entry.source, resolvedMode)} className={cn('h-6 w-6', dragHandle ? 'ml-1' : 'ml-3')} />
            {/* Runs to the row's right edge and truncates there; the hover `...` trigger sits over the end
                with its frosted backing. */}
            <span className="min-w-0 flex-1 truncate py-2 pl-2 pr-1 text-sm">{entry.label}</span>

            {/* Custom rows get a hover-revealed pencil (left of the `...`) for one-click edit; presets are
                immutable, so they never show it. */}
            {entry.isCustom && customId && (
               <Button
                  variant="ghost"
                  size="icon"
                  onClick={(event) => { event.stopPropagation(); editCustom(entry); }}
                  title={t('Common.edit')}
                  aria-label={t('Common.edit')}
                  className={`absolute right-8 coarse:right-13 top-1/2 h-6 w-6 -translate-y-1/2 shrink-0 cursor-pointer opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 ${DRAWER_MENU_TRIGGER_CLASS}`}
               >
                  <Pencil className="h-4 w-4" />
               </Button>
            )}

            <DropdownMenu>
               <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
                  <Button
                     variant="ghost"
                     size="icon"
                     title={t('SettingsDialog.themes.actionsMenu')}
                     className={`absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 shrink-0 cursor-pointer opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 ${DRAWER_MENU_TRIGGER_CLASS}`}
                  >
                     <MoreHorizontal className="h-4 w-4" />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent onClick={(event) => event.stopPropagation()}>
                  <DropdownMenuItem onClick={() => duplicate(entry)} className="cursor-pointer">
                     <Copy className="mr-2 h-4 w-4" /><span>{t('SettingsDialog.themes.duplicate')}</span>
                  </DropdownMenuItem>
                  {entry.isCustom && customId && (
                     <>
                        <DropdownMenuItem onClick={() => startRename(customId, entry.label)} className="cursor-pointer">
                           <Pencil className="mr-2 h-4 w-4" /><span>{t('SettingsDialog.themes.rename')}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportTheme(customId)} className="cursor-pointer">
                           <Upload className="mr-2 h-4 w-4" /><span>{t('SettingsDialog.themes.export')}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                           onClick={() => setPendingDelete(customThemes.find((theme) => theme.id === customId) ?? null)}
                           className="cursor-pointer text-destructive"
                        >
                           <Trash2 className="mr-2 h-4 w-4" /><span>{t('SettingsDialog.themes.delete')}</span>
                        </DropdownMenuItem>
                     </>
                  )}
               </DropdownMenuContent>
            </DropdownMenu>
         </div>
      );
   };

   return (
      <div data-tutorial="themes-list" className="flex flex-col gap-3">
         {/* Presets stay pinned at the top. */}
         <div className="flex flex-col gap-1">
            <SectionHeading>{t('SettingsDialog.themes.presetsHeading')}</SectionHeading>
            <div className="flex flex-col gap-1">{presetEntries.map((entry) => renderRow(entry))}</div>
         </div>

         {/* Customs sit below a divider; the hub pane owns the scroll (no inner scroller, else it double-scrolls).
             Only this section is sortable - a local DndContext + SortableContext over the custom ids; presets
             stay outside it. */}
         <div className="flex flex-col gap-1 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
               <SectionHeading>{t('SettingsDialog.themes.customsHeading')}</SectionHeading>
               {/* Icon-only to leave the heading room; the label lives in the tooltip + aria-label/title. */}
               <Tooltip>
                  <TooltipTrigger asChild>
                     <Button
                        data-tutorial="themes-import"
                        variant="ghost"
                        size="icon"
                        onClick={() => importInputRef.current?.click()}
                        aria-label={t('SettingsDialog.themes.importTheme')}
                        title={t('SettingsDialog.themes.importTheme')}
                        className="h-6 w-6 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                     >
                        <Download className="h-3.5 w-3.5" />
                     </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('SettingsDialog.themes.importTheme')}</TooltipContent>
               </Tooltip>
            </div>
            {customEntries.length > 0 ? (
               <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={handleDragEnd}>
                  <SortableContext items={customThemes.map((theme) => theme.id)} strategy={verticalListSortingStrategy}>
                     <div className="flex flex-col gap-1">
                        {customEntries.map((entry) => {
                           const id = entry.value.replace('theme-custom-', '');
                           return (
                              <Sortable key={id} id={id} data={{ type: DRAG_TYPES.THEME, item: entry }}>
                                 {({ dragAttributes, dragListeners, isBeingDragged }) => (
                                    <DragStaticWrapper isBeingDragged={isBeingDragged}>
                                       {renderRow(entry, { dragAttributes, dragListeners })}
                                    </DragStaticWrapper>
                                 )}
                              </Sortable>
                           );
                        })}
                     </div>
                  </SortableContext>
               </DndContext>
            ) : (
               <div className="flex flex-col gap-1">
                  <p className="px-1 py-2 text-xs text-muted-foreground">{t('SettingsDialog.themes.noCustoms')}</p>
               </div>
            )}

            {/* Below the scroller so it never scrolls away; the empty-state action too (works with zero customs). */}
            <Button variant="outline" size="sm" onClick={createNew} className="mt-1 w-full shrink-0 cursor-pointer">
               <Plus className="mr-1 h-4 w-4" />{t('SettingsDialog.themes.newTheme')}
            </Button>
         </div>

         <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>{t('SettingsDialog.themes.deleteConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                     {t('SettingsDialog.themes.deleteConfirmDescription', { name: pendingDelete?.name ?? '' })}
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">{t('SettingsDialog.dangerZone.resetDialog.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={() => { if (pendingDelete) deleteCustomTheme(pendingDelete.id); setPendingDelete(null); }}
                     className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
                  >
                     {t('SettingsDialog.themes.deleteConfirmButton')}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>

         <form ref={importFormRef} className="hidden">
            <input type="file" ref={importInputRef} onChange={handleImportFileSelected} accept={ACCEPT_THEME_IMPORT} />
         </form>
      </div>
   );
}
