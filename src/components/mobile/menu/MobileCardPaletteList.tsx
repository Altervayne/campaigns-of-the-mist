// -- React Imports --
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

// -- Component Imports --
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';

// -- Icon Imports --
import { Check, MoreHorizontal, Palette, Copy, Plus, Pencil, Trash2, Upload, Download } from 'lucide-react';

// -- Utils and Store Imports --
import { cn } from '@/lib/utils';
import { exportCardPalette, importFromFile } from '@/lib/utils/export-import';
import { ACCEPT_CARD_PALETTE_IMPORT } from '@/lib/utils/fileAccept';
import { CARD_TYPES_BY_GAME } from '@/lib/theme/cardPalettes';
import { defaultCardTypesForGame } from '@/lib/theme/cardPaletteProbe';
import { useCreateCardPalette } from '@/lib/theme/useCreateCardPalette';
import { useCardPaletteImport } from '@/lib/theme/useCardPaletteImport';
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { PaperSet } from '@/lib/theme/themeTokens';
import type { CardPalette, CardPaletteGame } from '@/lib/theme/cardPalettes';

/*
 * One game's card-palette list, built for touch: select a palette (select = apply), create (duplicate Default),
 * import a palette file, and manage customs (edit / rename / delete / export) through an always-visible row menu.
 * The Default is read-only and only Duplicates. Edit / New / Duplicate begin the live draft and open the editor
 * through `onOpenEditor`.
 */

/** A selectable row: 'default' for the built-in, or a custom's id, plus the card-type colors a duplicate copies. */
interface PaletteRow {
   id: string;
   label: string;
   isCustom: boolean;
   cardTypes: Record<string, PaperSet>;
}

/** The PaperSet a game's first card type resolves to, used for a row's preview swatch (null when none read). */
function representativeSet(game: CardPaletteGame, cardTypes: Record<string, PaperSet>): PaperSet | null {
   for (const def of CARD_TYPES_BY_GAME[game]) {
      if (cardTypes[def.slug]) return cardTypes[def.slug];
   }
   return null;
}

/** A three-chip preview of a palette's header / background / accent, so a palette reads at a glance. */
function PaletteSwatch({ set }: { set: PaperSet | null }) {
   return (
      <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border">
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

export function MobileCardPaletteList({ game, onOpenEditor }: { game: CardPaletteGame; onOpenEditor?: () => void }) {
   const { t } = useTranslation();
   const cardPalettes = useAppSettingsStore((state) => state.cardPalettes);
   const activeCardPalettes = useAppSettingsStore((state) => state.activeCardPalettes);
   const { setActiveCardPalette, updateCardPalette, deleteCardPalette, beginCardPaletteDraft } = useAppSettingsActions();
   const createFrom = useCreateCardPalette();
   const importPalette = useCardPaletteImport();

   // The built-in colors, read once per game from the live stylesheet; seed both the Default swatch and its duplicate.
   const defaultCardTypes = useMemo(() => defaultCardTypesForGame(game), [game]);
   const activeId = activeCardPalettes[game];
   const customs = cardPalettes.filter((entry) => entry.game === game);

   const [renamingId, setRenamingId] = useState<string | null>(null);
   const [renameDraft, setRenameDraft] = useState('');
   const [pendingDelete, setPendingDelete] = useState<CardPalette | null>(null);

   const importInputRef = useRef<HTMLInputElement>(null);
   const importFormRef = useRef<HTMLFormElement>(null);

   // Begin the live draft for a palette, then open the editor on it; the editor reads the draft to know which
   // palette it edits.
   const openEditorFor = (id: string) => {
      const saved = useAppSettingsStore.getState().cardPalettes.find((entry) => entry.id === id);
      if (!saved) return;
      beginCardPaletteDraft(saved);
      onOpenEditor?.();
   };

   // Edit a custom: select it if it is not active, then open the editor.
   const editPalette = (row: PaletteRow) => {
      if (row.id !== activeId) setActiveCardPalette(game, row.id);
      openEditorFor(row.id);
   };
   // Duplicate any row into a new custom (deep-copied card-type colors), select it, then edit it.
   const duplicatePalette = (row: PaletteRow) => {
      const id = createFrom(game, row.cardTypes, t('SettingsDialog.cardPalettes.copyName', { name: row.label }));
      openEditorFor(id);
   };
   // Start a fresh palette from the Default, select it, then edit it.
   const createNew = () => {
      const id = createFrom(game, defaultCardTypes, t('SettingsDialog.cardPalettes.newPaletteName'));
      openEditorFor(id);
   };

   const startRename = (id: string, current: string) => { setRenamingId(id); setRenameDraft(current); };
   const commitRename = () => {
      const trimmed = renameDraft.trim();
      if (renamingId && trimmed) updateCardPalette(renamingId, { name: trimmed });
      setRenamingId(null);
   };

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

   // Import a .cotm palette from the file dialog. It routes to its OWN game's list (game is intrinsic), which may
   // differ from this list's game.
   const handleImportFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
         const imported = await importFromFile(file);
         importPalette(imported);
      } catch (error) {
         console.error('Card palette import failed:', error);
         toast.error(t('Notifications.general.importFailed'));
      }
      importFormRef.current?.reset();
   };

   const defaultRow: PaletteRow = { id: 'default', label: t('SettingsDialog.cardPalettes.default'), isCustom: false, cardTypes: defaultCardTypes };
   const customRows: PaletteRow[] = customs.map((palette) => ({ id: palette.id, label: palette.name, isCustom: true, cardTypes: palette.cardTypes }));

   const renderRow = (row: PaletteRow) => {
      const isActive = activeId === row.id;
      return (
         <div
            key={row.id}
            onClick={() => { if (!isActive) setActiveCardPalette(game, row.id); }}
            className={cn(
               'flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-3',
               isActive ? 'border-primary bg-accent text-accent-foreground' : 'border-border hover:bg-muted',
            )}
         >
            <PaletteSwatch set={representativeSet(game, row.cardTypes)} />
            <span className="min-w-0 flex-1 truncate text-base font-medium">{row.label}</span>
            {isActive && <Check className="h-5 w-5 shrink-0 text-primary" />}
            <DropdownMenu>
               <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
                  <Button variant="ghost" size="icon" aria-label={t('SettingsDialog.cardPalettes.actionsMenu')} className="h-11 w-11 shrink-0 cursor-pointer">
                     <MoreHorizontal className="h-5 w-5" />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent onClick={(event) => event.stopPropagation()}>
                  {/* The Default is immutable, so it only Duplicates; customs also edit / rename / export / delete. */}
                  {row.isCustom && (
                     <DropdownMenuItem onClick={() => editPalette(row)} className="cursor-pointer">
                        <Palette className="mr-2 h-4 w-4" /><span>{t('SettingsDialog.themes.edit')}</span>
                     </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => duplicatePalette(row)} className="cursor-pointer">
                     <Copy className="mr-2 h-4 w-4" /><span>{t('SettingsDialog.cardPalettes.duplicate')}</span>
                  </DropdownMenuItem>
                  {row.isCustom && (
                     <>
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

   const newButton = (
      <Button className="w-full h-12 justify-start text-base" onClick={createNew}>
         <Plus className="mr-3 h-5 w-5 shrink-0" />
         <span>{t('SettingsDialog.cardPalettes.newPalette')}</span>
      </Button>
   );
   const importButton = (
      <Button variant="outline" className="w-full h-12 justify-start text-base" onClick={() => importInputRef.current?.click()}>
         <Download className="mr-3 h-5 w-5 shrink-0" />
         <span>{t('SettingsDialog.cardPalettes.importPalette')}</span>
      </Button>
   );

   return (
      <>
         {/* Default stays pinned at the top. */}
         <div className="space-y-2">
            <Label className="text-sm font-semibold">{t('SettingsDialog.cardPalettes.default')}</Label>
            <div className="space-y-2">{renderRow(defaultRow)}</div>
         </div>

         {/* Customs */}
         <div className="space-y-2">
            <Label className="text-sm font-semibold">{t('SettingsDialog.cardPalettes.customsHeading')}</Label>
            {customRows.length > 0 ? (
               <>
                  <div className="space-y-2">{customRows.map(renderRow)}</div>
                  {newButton}
                  {importButton}
               </>
            ) : (
               <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{t('SettingsDialog.cardPalettes.noCustoms')}</p>
                  {newButton}
                  {importButton}
               </div>
            )}
         </div>

         {/* Rename: a bottom-sheet prompt with an autofocused input. */}
         <MobileBottomSheet isOpen={renamingId !== null} onClose={() => setRenamingId(null)}>
            <div className="p-4 pb-3 border-b border-border">
               <h2 className="text-lg font-semibold">{t('SettingsDialog.cardPalettes.rename')}</h2>
            </div>
            <div className="p-4 space-y-4">
               <Input
                  autoFocus
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') commitRename(); }}
                  placeholder={t('SettingsDialog.cardPalettes.renamePlaceholder')}
                  className="text-base"
               />
               <div className="flex gap-2 pb-safe">
                  <Button variant="outline" onClick={() => setRenamingId(null)} className="flex-1 h-11 cursor-pointer">
                     {t('SettingsDialog.dangerZone.resetDialog.cancel')}
                  </Button>
                  <Button onClick={commitRename} disabled={!renameDraft.trim()} className="flex-1 h-11 cursor-pointer">
                     {t('SettingsDialog.themes.save')}
                  </Button>
               </div>
            </div>
         </MobileBottomSheet>

         {/* Delete: a bottom-sheet confirm; deleting the active palette falls the game back to Default. */}
         <MobileBottomSheet isOpen={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
            <div className="p-4 pb-3 border-b border-border">
               <h2 className="text-lg font-semibold">{t('SettingsDialog.cardPalettes.deleteConfirmTitle')}</h2>
               <p className="text-sm text-muted-foreground mt-2">{t('SettingsDialog.cardPalettes.deleteConfirmDescription', { name: pendingDelete?.name ?? '' })}</p>
            </div>
            <div className="p-4">
               <div className="flex gap-2 pb-safe">
                  <Button variant="outline" onClick={() => setPendingDelete(null)} className="flex-1 h-11 cursor-pointer">
                     {t('SettingsDialog.dangerZone.resetDialog.cancel')}
                  </Button>
                  <Button
                     variant="destructive"
                     onClick={() => { if (pendingDelete) deleteCardPalette(pendingDelete.id); setPendingDelete(null); }}
                     className="flex-1 h-11 cursor-pointer"
                  >
                     {t('SettingsDialog.cardPalettes.deleteConfirmButton')}
                  </Button>
               </div>
            </div>
         </MobileBottomSheet>

         <form ref={importFormRef} className="hidden">
            <input type="file" ref={importInputRef} onChange={handleImportFileSelected} accept={ACCEPT_CARD_PALETTE_IMPORT} />
         </form>
      </>
   );
}
