// -- React Imports --
import { useEffect, useRef, useState } from 'react';

// -- Library Imports --
import cuid from 'cuid';

// -- Utils Imports --
import { appendRollEntry, rollDiceTray } from '@/lib/dice/diceTray';

// -- Type Imports --
import type { DiceTrayContent, DiceTrayDie, DiceTrayModifier, RollEntry } from '@/lib/dice/diceTrayTypes';

/** How long (ms) the first die shuffles before settling; each later die settles a touch after. */
const ROLL_BASE_MS = 450;
const ROLL_STAGGER_MS = 90;

interface UseDiceTrayRollArgs {
   tray: DiceTrayContent;
   dice: DiceTrayDie[];
   modifiers: DiceTrayModifier[];
   modifierTotal: number;
   /** Write the settled roll (and the history append) down the host's non-undoable path. */
   onCacheRoll: (content: DiceTrayContent) => void;
   /** Fired as a roll begins, before any animation. Runs for an external roll too, not just a button press. */
   onRollStart?: () => void;
   pendingRoll: boolean;
   onPendingRollHandled?: () => void;
}

/*
 * The tray's roll engine: rolls the current dice, reveals them with a staggered per-die shuffle, caches the
 * settled result, and honors an external one-shot roll request. Nothing here is memoized on purpose - `roll`
 * and its `settle` are rebuilt every render so the animation frame and the external handshake always run
 * against the render they were built from.
 */
export function useDiceTrayRoll({ tray, dice, modifiers, modifierTotal, onCacheRoll, onRollStart, pendingRoll, onPendingRollHandled }: UseDiceTrayRollArgs) {
   // The cycling faces during a roll reveal; null when resting (then faces come from lastRoll).
   const [liveFaces, setLiveFaces] = useState<Record<string, number> | null>(null);
   const rafRef = useRef<number | null>(null);
   useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

   const settle = (faces: Record<string, number>, breakdown: { label?: string; value: number }[], total: number) => {
      setLiveFaces(null); // rest from the cached lastRoll, not stale animation state
      // Record the roll in history alongside the live lastRoll - both via the non-undoable cache path, so a
      // roll never becomes undo steps. The entry is self-contained (config + faces in dice order + total).
      const entry: RollEntry = {
         id: cuid(),
         at: Date.now(),
         dice: dice.map((die) => (die.negative ? { sides: die.sides, negative: true } : { sides: die.sides })),
         modifiers: breakdown,
         faces: dice.map((die) => faces[die.id] ?? 0),
         total,
      };
      onCacheRoll({ ...tray, lastRoll: { faces, modifiers: breakdown, total }, history: appendRollEntry(tray.history ?? [], entry) });
   };

   const roll = () => {
      onRollStart?.(); // rolling dismisses an open per-die menu (no-op on desktop)
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const result = rollDiceTray(dice, modifiers);
      const finalFaces: Record<string, number> = {};
      for (const face of result.faces) finalFaces[face.id] = face.value;

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (dice.length === 0 || reduceMotion) {
         settle(finalFaces, result.modifiers, result.total);
         return;
      }

      const start = performance.now();
      const settleAt = new Map(dice.map((die, index) => [die.id, ROLL_BASE_MS + index * ROLL_STAGGER_MS]));
      const tick = (now: number) => {
         const elapsed = now - start;
         const faces: Record<string, number> = {};
         let allDone = true;
         for (const die of dice) {
            if (elapsed >= (settleAt.get(die.id) ?? 0)) {
               faces[die.id] = finalFaces[die.id];
            } else {
               faces[die.id] = 1 + Math.floor(Math.random() * die.sides);
               allDone = false;
            }
         }
         setLiveFaces(faces);
         if (allDone) {
            rafRef.current = null;
            settle(finalFaces, result.modifiers, result.total);
         } else {
            rafRef.current = requestAnimationFrame(tick);
         }
      };
      rafRef.current = requestAnimationFrame(tick);
   };

   // Honor an external roll request (the app-wide tray's palette command). A ref keeps the latest `roll`
   // closure without pulling it into the roll effect's deps, so the one-shot fires only when `pendingRoll`
   // flips - freshly mounted with a request, or flipped while already open - and rolls the current setup
   // once. The sync effect is declared first, so the ref is fresh before the roll effect reads it.
   const rollRef = useRef(roll);
   useEffect(() => { rollRef.current = roll; });
   useEffect(() => {
      if (!pendingRoll) return;
      rollRef.current();
      onPendingRollHandled?.();
   }, [pendingRoll, onPendingRollHandled]);

   // Resting faces/breakdown come from the cached lastRoll; during a roll, from the live state.
   const faceOf = (id: string): number | null => (liveFaces ? liveFaces[id] ?? null : tray.lastRoll?.faces[id] ?? null);
   const displayTotal = liveFaces
      ? dice.reduce((sum, die) => { const v = liveFaces[die.id] ?? 0; return sum + (die.negative ? -v : v); }, 0) + modifierTotal
      : tray.lastRoll?.total ?? null;
   const displayModifiers = liveFaces ? modifiers.map((m) => ({ label: m.label, value: m.value })) : tray.lastRoll?.modifiers ?? [];

   return { roll, faceOf, displayTotal, displayModifiers };
}
