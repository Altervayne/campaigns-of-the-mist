// -- Library Imports --
import cuid from 'cuid';

// -- Utils Imports --
import { parseDiceCommand } from '@/lib/dice/diceCommand';

// -- Type Imports --
import type { DiceTrayContent, RollEntry } from '@/lib/dice/diceTrayTypes';

/*
 * The tray's config-edit closures. Each one commits a whole new content object down the host's `onChange`
 * path, so a host with an undo stack gets one step per edit. Clearing the history is the exception: it is
 * roll-cache management, so it rides `onCacheRoll` instead.
 */
export function useDiceTrayEdits(
   tray: DiceTrayContent,
   onChange: (content: DiceTrayContent) => void,
   onCacheRoll: (content: DiceTrayContent) => void,
) {
   const { dice, modifiers } = tray;

   const addDie = (sides: number) => onChange({ ...tray, dice: [...dice, { id: cuid(), sides }] });
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

   return {
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
   };
}
