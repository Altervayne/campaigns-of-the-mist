// -- React Imports --
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Utils Imports --
import { migrateDiceTrayContent } from '@/lib/dice/diceTray';

// -- Hook Imports --
import { useDiceTrayEdits } from '@/hooks/dice/useDiceTrayEdits';
import { useDiceTrayRoll } from '@/hooks/dice/useDiceTrayRoll';

// -- Component Imports --
import { DiceRow } from './tray/DiceRow';
import { DiceTrayTitleInput } from './tray/DiceTrayTitleInput';
import { DieContextMenu } from './tray/DieContextMenu';
import { ModifierSection } from './tray/ModifierSection';
import { RollFooter } from './tray/RollFooter';
import { RollHistory } from './tray/RollHistory';

// -- Type Imports --
import type { DiceTrayContent } from '@/lib/dice/diceTrayTypes';
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

   const {
      addDie,
      removeDie,
      toggleNegative,
      applyCommand,
      addModifier,
      removeModifier,
      setModifierValue,
      setModifierLabel,
      restoreEntry,
      clearHistory,
   } = useDiceTrayEdits(tray, onChange, onCacheRoll);

   // The die whose mobile context menu is open (mobile only); undefined once it is removed or dismissed.
   const menuDie = menuDieId ? dice.find((die) => die.id === menuDieId) : undefined;

   return (
      <div className="flex min-h-0 w-full flex-1 flex-col bg-card text-card-foreground">
         {showTitle && (
            <DiceTrayTitleInput
               title={tray.title}
               editable={editable}
               placeholder={t('BoardView.diceTitlePlaceholder')}
               stopDrag={stopDrag}
               onCommit={(next) => onChange({ ...tray, title: next })}
               onFocus={onTitleFocus}
            />
         )}

         <div className="flex flex-col">
            <DiceRow
               dice={dice}
               editable={editable}
               isMobile={isMobile}
               stopDrag={stopDrag}
               faceOf={faceOf}
               onAddDie={addDie}
               onToggleNegative={toggleNegative}
               onRemoveDie={removeDie}
               onLongPress={openDieMenu}
               onApplyCommand={applyCommand}
            />

            <ModifierSection
               modifiers={modifiers}
               modifierTotal={modifierTotal}
               isMobile={isMobile}
               stopDrag={stopDrag}
               onAddModifier={addModifier}
               onRemoveModifier={removeModifier}
               onChangeValue={setModifierValue}
               onChangeLabel={setModifierLabel}
            />
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

         <RollFooter
            displayTotal={displayTotal}
            displayModifiers={displayModifiers}
            isMobile={isMobile}
            stopDrag={stopDrag}
            onRoll={roll}
         />

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
