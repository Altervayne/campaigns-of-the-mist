// -- React Imports --
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

// -- Icon Imports --
import { ChevronLeft, Palette } from 'lucide-react';

// -- Component Imports --
import { CardPaletteManager } from './CardPaletteManager';
import { CardPaletteEditor } from './CardPaletteEditor';
import { useSettingsFocus } from './settingsFocus';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Theme Imports --
import { cardPaletteFieldsEqual } from '@/lib/theme/cardPalettes';
import { defaultCardTypesForGame } from '@/lib/theme/cardPaletteProbe';
import { useCreateCardPalette } from '@/lib/theme/useCreateCardPalette';

// -- Store Imports --
import { useAppSettingsActions, useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { ReactNode } from 'react';
import type { CardPaletteGame } from '@/lib/theme/cardPalettes';

/** The games that own card palettes, in selector order. */
const GAME_OPTIONS: CardPaletteGame[] = ['LEGENDS', 'CITY_OF_MIST', 'OTHERSCAPE'];

/**
 * The Card Palettes section: a game selector, the game's palette manager (list + select + CRUD), and an editor
 * takeover for the active custom palette (per-card-type paper editing). The editor edits the ACTIVE palette when
 * it's a custom one; a game still on Default shows a duplicate-to-edit placeholder. The whole pane owns the draft
 * guard so abandoning unsaved edits (Back, closing the hub, switching game, selecting another palette) confirms
 * first. Switching game abandons its draft, so it routes through the guard too.
 */
export function CardPalettesSettingsPane() {
   const { t } = useTranslation();
   const [game, setGame] = useState<CardPaletteGame>('LEGENDS');

   const cardPalettes = useAppSettingsStore((state) => state.cardPalettes);
   const activeCardPalettes = useAppSettingsStore((state) => state.activeCardPalettes);
   const cardPaletteDraft = useAppSettingsStore((state) => state.cardPaletteDraft);
   const { discardCardPaletteDraft, updateCardPalette, patchCardPaletteDraft } = useAppSettingsActions();

   const { editorOpen, setEditorOpen, registerCloseGuard } = useSettingsFocus();

   const createFrom = useCreateCardPalette();

   // The editor edits the ACTIVE palette when it's a custom one; a game on Default shows the duplicate-to-edit
   // placeholder ('default' matches no custom id).
   const editingPalette = cardPalettes.find((palette) => palette.id === activeCardPalettes[game]);

   // The draft has unsaved changes when its editor fields differ from the saved palette it belongs to.
   const draftSaved = cardPaletteDraft ? cardPalettes.find((entry) => entry.id === cardPaletteDraft.id) : undefined;
   const isDirty = !!(cardPaletteDraft && draftSaved && !cardPaletteFieldsEqual(cardPaletteDraft, draftSaved));

   // One guard for every way of leaving the current draft (Back, closing the hub, switching game, selecting or
   // duplicating another palette). When dirty it parks the intended action behind a confirm; otherwise it drops
   // the (clean) draft and runs straight away.
   const [pendingProceed, setPendingProceed] = useState<(() => void) | null>(null);
   const guardedSwitch = (proceed: () => void) => {
      if (isDirty) { setPendingProceed(() => proceed); return; }
      discardCardPaletteDraft();
      proceed();
   };
   const confirmDiscard = () => {
      discardCardPaletteDraft();
      const proceed = pendingProceed;
      setPendingProceed(null);
      proceed?.();
   };

   // Hand the shell a guarded close, so shutting the hub with an unsaved draft confirms first. A latest-ref
   // wrapper keeps the registered guard pointed at fresh dirtiness without re-registering every render; it's
   // cleared on unmount (leaving the section) so no stale guard survives, and the takeover collapses with it.
   const guardedSwitchRef = useRef(guardedSwitch);
   useEffect(() => { guardedSwitchRef.current = guardedSwitch; });
   useEffect(() => {
      registerCloseGuard((proceed) => guardedSwitchRef.current(proceed));
      return () => registerCloseGuard(null);
   }, [registerCloseGuard]);
   useEffect(() => () => setEditorOpen(false), [setEditorOpen]);

   // The Back + palette-name cluster the editor takeover shows in its header (folded into the editor's own header
   // bar, so no second toolbar stacks up). Back routes through the guard, so an unsaved draft confirms first.
   const editorHeaderLeft = (nameNode: ReactNode) => (
      <div className="flex min-w-0 flex-1 items-center gap-2">
         <Button variant="ghost" size="sm" onClick={() => guardedSwitch(() => setEditorOpen(false))} className="shrink-0 cursor-pointer">
            <ChevronLeft className="h-4 w-4" />{t('SettingsShell.sections.cardPalettes')}
         </Button>
         {nameNode}
      </div>
   );

   // A rename persists to the saved palette immediately AND syncs the live draft, so name-inclusive dirty/save
   // stay consistent (the draft never goes stale on name).
   const renamePalette = (id: string, name: string) => { updateCardPalette(id, { name }); patchCardPaletteDraft({ name }); };

   if (editorOpen) {
      return (
         <div className="flex h-full min-h-0 flex-col bg-background">
            {editingPalette ? (
               <CardPaletteEditor
                  key={editingPalette.id}
                  palette={editingPalette}
                  headerLeft={editorHeaderLeft(
                     <EditablePaletteName
                        id={editingPalette.id}
                        name={editingPalette.name}
                        onRename={renamePalette}
                        label={t('SettingsDialog.cardPalettes.rename')}
                     />,
                  )}
               />
            ) : (
               <>
                  <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-4 py-2">
                     {editorHeaderLeft(<span className="truncate text-sm font-medium">{t('SettingsDialog.cardPalettes.default')}</span>)}
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden p-4">
                     <button
                        type="button"
                        onClick={() => guardedSwitch(() => createFrom(game, defaultCardTypesForGame(game), t('SettingsDialog.cardPalettes.newPaletteName')))}
                        className={cn(
                           'flex h-full w-full cursor-pointer items-center justify-center rounded-md border border-dashed border-border p-6',
                           'text-center text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted/40 hover:text-foreground',
                        )}
                     >
                        {t('SettingsDialog.cardPalettes.duplicateToEdit')}
                     </button>
                  </div>
               </>
            )}
            <DiscardDraftDialog open={pendingProceed !== null} onCancel={() => setPendingProceed(null)} onConfirm={confirmDiscard} />
         </div>
      );
   }

   return (
      <div className="grid gap-6">
         {/* Game: keyed on the chosen game, so its palettes show below. The label sits ABOVE a full-width track
             (not beside it) because the game names are long; a beside-label track cramps them into overflow.
             Switching game routes through the guard, since leaving a game abandons its draft. */}
         <div data-tutorial="card-palettes-game" className="flex flex-col gap-2">
            <Label className="text-left">{t('SettingsDialog.cardPalettes.game')}</Label>
            <div className="inline-flex w-full rounded-md border border-border bg-muted p-0.5">
               {GAME_OPTIONS.map((option) => {
                  const isActive = game === option;
                  return (
                     <button
                        key={option}
                        type="button"
                        onClick={() => guardedSwitch(() => setGame(option))}
                        // `min-w-0` lets the equal-width segments shrink so a long name truncates instead of
                        // overflowing the track.
                        className={cn(
                           'flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-sm px-3 py-1.5 text-sm transition-colors',
                           isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                     >
                        <span className="truncate">{t(`SettingsDialog.cardPalettes.games.${option}`)}</span>
                     </button>
                  );
               })}
            </div>
         </div>

         {/* Palettes: the live list (select = apply), plus a button into the editor takeover on the active palette. */}
         <div className="grid gap-3">
            <div className="flex items-center justify-between gap-2">
               <Label className="text-left">{t('SettingsShell.sections.cardPalettes')}</Label>
               <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)} className="shrink-0 cursor-pointer">
                  <Palette className="h-4 w-4 shrink-0" />{t('SettingsDialog.cardPalettes.editPalettes')}
               </Button>
            </div>
            <CardPaletteManager game={game} guardedSwitch={guardedSwitch} onEnterEditor={() => setEditorOpen(true)} />
         </div>

         <DiscardDraftDialog open={pendingProceed !== null} onCancel={() => setPendingProceed(null)} onConfirm={confirmDiscard} />
      </div>
   );
}

/**
 * The editing palette's name, editable inline in the editor header. Local while typing; commits a trimmed,
 * changed name on blur or Enter (Esc reverts). An empty name reverts to the current one rather than saving blank.
 */
function EditablePaletteName({ id, name, onRename, label }: { id: string; name: string; onRename: (id: string, name: string) => void; label: string }) {
   const [value, setValue] = useState(name);
   // Re-sync to the saved name if it changes underneath us (a rename elsewhere, a palette switch) by adjusting
   // during render rather than in an effect - no extra commit, and it never fights what the user is typing.
   const [seenName, setSeenName] = useState(name);
   if (name !== seenName) { setSeenName(name); setValue(name); }
   const commit = () => {
      const trimmed = value.trim();
      if (trimmed && trimmed !== name) onRename(id, trimmed);
      else setValue(name);
   };
   return (
      <input
         value={value}
         aria-label={label}
         onChange={(event) => setValue(event.target.value)}
         onBlur={commit}
         onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            else if (event.key === 'Escape') { setValue(name); event.currentTarget.blur(); }
         }}
         className="min-w-0 flex-1 rounded-sm bg-transparent px-1.5 py-0.5 text-sm font-medium text-foreground outline-none hover:bg-muted focus:bg-muted focus:ring-1 focus:ring-ring"
      />
   );
}

/** Leaving a dirty draft (Back, close, switching game, or selecting another palette) asks before discarding. */
function DiscardDraftDialog({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
   const { t } = useTranslation();
   return (
      <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>{t('SettingsDialog.themes.discardTitle')}</AlertDialogTitle>
               <AlertDialogDescription>{t('SettingsDialog.cardPalettes.discardBody')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
               <AlertDialogCancel className="cursor-pointer">{t('SettingsDialog.dangerZone.resetDialog.cancel')}</AlertDialogCancel>
               <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer">
                  {t('SettingsDialog.themes.discardConfirm')}
               </AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   );
}
