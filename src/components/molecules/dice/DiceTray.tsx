// -- React Imports --
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Library Imports --
import cuid from 'cuid';

// -- Icon Imports --
import { Dices, Plus } from 'lucide-react';

// -- Basic UI Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { QUICK_PICK, migrateDiceTrayContent } from '@/lib/dice/diceTray';
import { parseDiceCommand } from '@/lib/dice/diceCommand';
import { signed } from '@/lib/dice/diceFormat';

// -- Hook Imports --
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';
import { useDiceTrayRoll } from '@/hooks/dice/useDiceTrayRoll';

// -- Component Imports --
import { DieShape } from './DieShape';
import { CommandPopover } from './tray/CommandPopover';
import { CustomSidesAdder } from './tray/CustomSidesAdder';
import { DieCell } from './tray/DieCell';
import { DieContextMenu } from './tray/DieContextMenu';
import { ModifierRow } from './tray/ModifierRow';
import { RollHistory } from './tray/RollHistory';

// -- Type Imports --
import type { DiceTrayContent, RollEntry } from '@/lib/dice/diceTrayTypes';
import type { Position } from '@/hooks/mobile/useLongPress';

/*
 * The board-agnostic dice tray: a list of individual dice + labeled modifiers (+ optional title), a roll
 * with a staggered reveal, and a total/breakdown. It is a PURE presentational core - it knows nothing
 * about boards, selection, or undo. The host decides what its two writes mean:
 *   - `onChange` commits a CONFIG edit (the host chooses undoable or not).
 *   - `onCacheRoll` writes the SETTLED roll, kept separate from `onChange` so a host can route it down a
 *     non-undoable path (the board does, so a roll never lands on the undo stack).
 * `editable` gates the inputs (read-only when false); `growToFill` renders the drag-resize slack spacer
 * (the board canvas needs it; a fixed-size host does not). Every control stops pointer propagation -
 * harmless off-canvas, needed on the board so editing never starts a drag.
 */

interface DiceTrayProps {
   content: DiceTrayContent;
   /** Whether the tray's inputs are editable (read-only when false). */
   editable: boolean;
   /** Commit a config edit (dice / modifiers / title). The host decides if it is undoable. */
   onChange: (content: DiceTrayContent) => void;
   /** Write the settled roll. Kept separate from `onChange` so the host can make it non-undoable. */
   onCacheRoll: (content: DiceTrayContent) => void;
   /** Render the `data-board-fill-spacer` slack so a footer pins to the bottom under canvas drag-resize. */
   growToFill?: boolean;
   /** Whether to render the title input. Off for the generic app-wide tray, which is unnamed. */
   showTitle?: boolean;
   /** Optional: fired when the title input is focused (the board uses it to select the item). */
   onTitleFocus?: () => void;
   /** Grow the interactive controls to comfortable touch targets (and un-hide the per-die buttons, which
       are hover-gated on desktop). Off by default, so desktop + board render exactly as before. */
   isMobile?: boolean;
   /** One-shot external roll request: when it flips true, the tray runs its own animated roll. The app-wide
       tray uses it (the palette's Roll command arms it); the board + mobile pass nothing, so it stays off. */
   pendingRoll?: boolean;
   /** Fired once the external roll request has been handled, so the host can clear the flag. */
   onPendingRollHandled?: () => void;
}

export function DiceTray({ content, editable, onChange, onCacheRoll, growToFill = false, showTitle = true, onTitleFocus, isMobile = false, pendingRoll = false, onPendingRollHandled }: DiceTrayProps) {
   const { t } = useTranslation();

   // Normalize legacy trays (count-map dice, flat modifier); every commit spreads this, so
   // the migration persists on the first edit (or first roll, via the cache).
   const tray = useMemo(() => migrateDiceTrayContent(content), [content]);
   const dice = tray.dice;
   const modifiers = tray.modifiers;
   const modifierTotal = modifiers.reduce((sum, modifier) => sum + modifier.value, 0);

   // Title is held locally and committed on blur, like the other text bodies.
   const [title, setTitle] = useState(tray.title ?? '');
   const [syncedTitle, setSyncedTitle] = useState(tray.title ?? '');
   if ((tray.title ?? '') !== syncedTitle) {
      setSyncedTitle(tray.title ?? '');
      setTitle(tray.title ?? '');
   }

   const [pickerOpen, setPickerOpen] = useState(false);
   // Mobile only: the die whose context menu is open, plus the finger point it anchors to. Long-press a
   // die (touch has no hover) to open a positioned menu with its penalty/remove actions.
   const [menuDieId, setMenuDieId] = useState<string | null>(null);
   const [menuPos, setMenuPos] = useState<Position | null>(null);
   const openDieMenu = (id: string, position: Position) => { setMenuDieId(id); setMenuPos(position); };
   const closeDieMenu = () => { setMenuDieId(null); setMenuPos(null); };

   // The roll itself: the staggered reveal, the settled cache write, and the external roll handshake.
   // `onRollStart` dismisses an open per-die menu, so an externally requested roll dismisses it too.
   const { roll, faceOf, displayTotal, displayModifiers } = useDiceTrayRoll({
      tray,
      dice,
      modifiers,
      modifierTotal,
      onCacheRoll,
      onRollStart: closeDieMenu,
      pendingRoll,
      onPendingRollHandled,
   });

   const stopDrag = (event: ReactPointerEvent) => event.stopPropagation();

   const commitTitle = () => {
      const trimmed = title.trim();
      if (trimmed !== (tray.title ?? '')) onChange({ ...tray, title: trimmed });
   };

   // The board host unmounts on a tab switch without a blur; flush the buffered title so it isn't lost.
   useCommitOnUnmount(commitTitle);

   const addDie = (sides: number) => {
      onChange({ ...tray, dice: [...dice, { id: cuid(), sides }] });
      setPickerOpen(false);
   };
   const removeDie = (id: string) => onChange({ ...tray, dice: dice.filter((die) => die.id !== id) });
   // A penalty die: its rolled value subtracts. Toggled per die in editable mode.
   const toggleNegative = (id: string) =>
      onChange({ ...tray, dice: dice.map((die) => (die.id === id ? { ...die, negative: !die.negative } : die)) });

   // A typed/pasted formula REPLACES the tray's dice + modifiers (a command describes a full setup). One
   // onChange = one undoable edit on the board, persisted directly on the app tray. A bad parse is a no-op.
   const applyCommand = (raw: string): boolean => {
      const result = parseDiceCommand(raw);
      if ('error' in result) return false;
      onChange({ ...tray, dice: result.dice, modifiers: result.modifiers });
      return true;
   };

   const addModifier = () => onChange({ ...tray, modifiers: [...modifiers, { id: cuid(), label: '', value: 0 }] });
   const removeModifier = (id: string) => onChange({ ...tray, modifiers: modifiers.filter((m) => m.id !== id) });
   const setModifierValue = (id: string, value: number) =>
      onChange({ ...tray, modifiers: modifiers.map((m) => (m.id === id ? { ...m, value: Math.max(-999, Math.min(999, value)) } : m)) });
   const setModifierLabel = (id: string, label: string) =>
      onChange({ ...tray, modifiers: modifiers.map((m) => (m.id === id ? { ...m, label } : m)) });

   // Clicking a history entry RESTORES its setup (dice + modifiers, fresh ids) into the tray - a normal,
   // undoable-on-board edit. It loads the configuration, not the past random result.
   const restoreEntry = (entry: RollEntry) => onChange({
      ...tray,
      dice: entry.dice.map((die) => (die.negative ? { id: cuid(), sides: die.sides, negative: true } : { id: cuid(), sides: die.sides })),
      modifiers: entry.modifiers.map((modifier) => ({ id: cuid(), label: modifier.label, value: modifier.value })),
   });

   // Clearing history is roll-cache management, not a config edit - non-undoable, like the appends.
   const clearHistory = () => onCacheRoll({ ...tray, history: [] });

   // The die whose mobile context menu is open (mobile only); undefined once it is removed or dismissed.
   const menuDie = menuDieId ? dice.find((die) => die.id === menuDieId) : undefined;

   return (
      <div className="flex min-h-0 w-full flex-1 flex-col bg-card text-card-foreground">
         {showTitle && (
            <input
               type="text"
               value={title}
               onChange={(event) => setTitle(event.target.value)}
               onFocus={onTitleFocus}
               onBlur={commitTitle}
               onPointerDown={stopDrag}
               placeholder={t('BoardView.diceTitlePlaceholder')}
               className={cn(
                  'shrink-0 border-b border-border bg-transparent px-2 py-1.5 text-sm font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/60',
                  editable ? 'pointer-events-auto' : 'pointer-events-none',
               )}
            />
         )}

         <div className="flex flex-col">
            {/* The dice, each as its shape, plus the add-die picker. */}
            <div className="flex flex-wrap content-start gap-1.5 p-2">
               {dice.map((die) => (
                  <DieCell
                     key={die.id}
                     die={die}
                     face={faceOf(die.id)}
                     editable={editable}
                     isMobile={isMobile}
                     penaltyLabel={t('BoardView.diceToggleNegative')}
                     removeLabel={t('BoardView.diceRemoveDie')}
                     stopDrag={stopDrag}
                     onToggleNegative={toggleNegative}
                     onRemoveDie={removeDie}
                     onLongPress={openDieMenu}
                  />
               ))}

               <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                     <button
                        type="button"
                        title={t('BoardView.diceAddDie')}
                        aria-label={t('BoardView.diceAddDie')}
                        onPointerDown={stopDrag}
                        className={cn('flex h-11 w-11 items-center justify-center rounded-md border-2 border-dashed border-border text-muted-foreground hover:border-foreground hover:text-foreground cursor-pointer', isMobile && 'h-13 w-13')}
                     >
                        <Plus className={isMobile ? 'h-6 w-6' : 'h-5 w-5'} />
                     </button>
                  </PopoverTrigger>
                  {/* Above the app-modal overlay band (z-60) so the picker clears a host sheet (the mobile
                      dice tray sits in a bottom sheet); already top-most on desktop/board, so no change there. */}
                  <PopoverContent align="start" sideOffset={6} className="z-[70] w-auto p-2">
                     <div className="grid grid-cols-4 gap-1">
                        {QUICK_PICK.map((sides) => (
                           <button
                              key={sides}
                              type="button"
                              title={`d${sides}`}
                              aria-label={`d${sides}`}
                              onClick={() => addDie(sides)}
                              className="flex h-12 w-12 flex-col items-center justify-center rounded hover:bg-muted cursor-pointer"
                           >
                              <div className="h-7 w-7"><DieShape sides={sides} value={null} /></div>
                              <span className="font-mono text-[0.6rem] text-muted-foreground">d{sides}</span>
                           </button>
                        ))}
                     </div>
                     {/* Custom sides: add any dN by hand (any integer >= 2 -> a weird die). */}
                     <CustomSidesAdder
                        placeholder={t('BoardView.diceCustomSidesPlaceholder')}
                        addLabel={t('BoardView.diceAddCustomDie')}
                        onAdd={addDie}
                        isMobile={isMobile}
                     />
                  </PopoverContent>
               </Popover>

               {/* Build the whole tray from a typed formula like 1d6+2d12+4-2. Always rendered, like the
                   add-die picker, so the dice row's layout is identical whether or not the tray is selected
                   (a board item gates `editable` on selection - a conditional in-flow control would reflow). */}
               <CommandPopover
                  triggerLabel={t('BoardView.diceCommandLabel')}
                  placeholder={t('BoardView.diceCommandPlaceholder')}
                  applyLabel={t('BoardView.diceCommandApply')}
                  errorLabel={t('BoardView.diceCommandError')}
                  stopDrag={stopDrag}
                  onApply={applyCommand}
                  isMobile={isMobile}
               />
            </div>

            {/* Modifiers: a labeled list, each row one undoable change. */}
            <div className="border-t border-border p-2">
               <div className="mb-1 flex items-center justify-between px-0.5">
                  <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{t('BoardView.diceModifiers')}</span>
                  {modifiers.length > 0 && <span className="font-mono text-xs tabular-nums text-muted-foreground">{signed(modifierTotal)}</span>}
               </div>
               <div className="flex flex-col gap-1">
                  {modifiers.map((modifier) => (
                     <ModifierRow
                        key={modifier.id}
                        modifier={modifier}
                        placeholder={t('BoardView.diceModifierPlaceholder')}
                        removeLabel={t('BoardView.diceRemoveModifier')}
                        stopDrag={stopDrag}
                        onChangeValue={(value) => setModifierValue(modifier.id, value)}
                        onChangeLabel={(label) => setModifierLabel(modifier.id, label)}
                        onRemove={() => removeModifier(modifier.id)}
                        isMobile={isMobile}
                     />
                  ))}
                  <button
                     type="button"
                     onPointerDown={stopDrag}
                     onClick={addModifier}
                     className={cn(
                        'flex items-center justify-center gap-1 rounded border border-dashed border-border py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground cursor-pointer',
                        isMobile && 'py-2.5 text-sm',
                     )}
                  >
                     <Plus className={isMobile ? 'h-4 w-4' : 'h-3 w-3'} />
                     {t('BoardView.diceAddModifier')}
                  </button>
               </div>
            </div>
         </div>

         {/* Roll history: a tucked, collapsed-by-default log of recent rolls; click one to restore its setup. */}
         <RollHistory
            entries={tray.history ?? []}
            editable={editable}
            label={t('BoardView.diceHistory')}
            emptyLabel={t('BoardView.diceHistoryEmpty')}
            restoreLabel={t('BoardView.diceHistoryRestore')}
            clearLabel={t('BoardView.diceHistoryClear')}
            stopDrag={stopDrag}
            onRestore={restoreEntry}
            onClear={clearHistory}
            isMobile={isMobile}
         />

         {/* Flexible slack: when the tray is dragged taller than its content, the extra space
             lands here so the Roll footer stays pinned to the bottom (the box reads the floor as
             its height minus this spacer). Only the canvas-resizable host renders it. */}
         {growToFill && <div data-board-fill-spacer className="min-h-0 flex-1" />}

         {/* Roll + the breakdown + total. */}
         <div className="flex shrink-0 flex-col gap-1 border-t border-border p-2">
            {displayTotal !== null && displayModifiers.length > 0 && (
               <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[0.65rem] text-muted-foreground">
                  {displayModifiers.map((modifier, index) => (
                     <span key={index} className="font-mono">{modifier.label ? `${modifier.label} ${signed(modifier.value)}` : signed(modifier.value)}</span>
                  ))}
               </div>
            )}
            <div className="flex items-center gap-2">
               <button
                  type="button"
                  onPointerDown={stopDrag}
                  onClick={roll}
                  className={cn(
                     'flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 cursor-pointer',
                     isMobile && 'gap-2 py-2 text-base',
                  )}
               >
                  <Dices className={isMobile ? 'h-5 w-5' : 'h-4 w-4'} />
                  {t('BoardView.diceRoll')}
               </button>
               {displayTotal !== null && (
                  <div className="shrink-0 text-right">
                     <span className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{t('BoardView.diceTotal')}</span>
                     <div className="font-mono text-xl font-bold leading-none tabular-nums">{displayTotal}</div>
                  </div>
               )}
            </div>
         </div>

         {/* Mobile: a positioned per-die context menu, anchored where the finger long-pressed. A labeled
             penalty toggle and a separated destructive Remove, clamped on-screen. Mobile-only - never
             mounted on desktop, which keeps its hover-gated buttons. */}
         {isMobile && menuDie && menuPos && (
            <DieContextMenu
               die={menuDie}
               position={menuPos}
               makePenaltyLabel={t('BoardView.diceMakePenaltyDie')}
               makeNormalLabel={t('BoardView.diceMakeNormalDie')}
               removeLabel={t('BoardView.diceRemoveDie')}
               onToggle={() => { toggleNegative(menuDie.id); closeDieMenu(); }}
               onRemove={() => { removeDie(menuDie.id); closeDieMenu(); }}
               onClose={closeDieMenu}
            />
         )}
      </div>
   );
}
