// -- React Imports --
import { useEffect, useRef, useState } from 'react';

// -- Library Imports --
import cuid from 'cuid';

// -- Utils Imports --
import { appendRollResult, rollOnTable } from '@/lib/rolltable/rollOnTable';

// -- Type Imports --
import type { BoardItem, BoardItemContent, RollTableBoardContent } from '@/lib/types/board';
import type { RollResultEntry } from '@/lib/rolltable/types';

/** How long (ms) the highlight races the rows before landing, and the pause it holds on the pick. */
const ROLL_MS = 450;
const HOLD_MS = 220;

interface UseRollTableRollArgs {
   item: BoardItem;
   content: RollTableBoardContent;
   /** Write the settled roll (and the history append) down the host's non-undoable path. */
   onCacheLastKnown: (id: string, content: BoardItemContent) => void;
}

/*
 * The roll table's roll engine: picks the real weighted entry up front, then runs a highlight DOWN the
 * rows that decelerates (steps lengthen) and lands on the pick, holds briefly, and caches the settled
 * result. `liveIndex` drives the read view's row tint, `liveText` the live result text; both rest to
 * null. `prefers-reduced-motion` (and an empty table's no-op) settles instantly. Nothing is memoized -
 * `roll` is rebuilt every render so the animation frame runs against the render it was built from, and
 * the settled write never touches the undo stack (it rides the cache, like the dice tray).
 */
export function useRollTableRoll({ item, content, onCacheLastKnown }: UseRollTableRollArgs) {
   // The currently highlighted row during a roll; null when resting.
   const [liveIndex, setLiveIndex] = useState<number | null>(null);
   const [isRolling, setIsRolling] = useState(false);

   const rafRef = useRef<number | null>(null);
   const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const clearTimers = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (holdRef.current) clearTimeout(holdRef.current);
      rafRef.current = null;
      holdRef.current = null;
   };
   useEffect(() => clearTimers, []);

   const roll = () => {
      const entries = content.entries;
      if (entries.length === 0) return;
      const picked = rollOnTable(entries);
      if (!picked) return;
      const pickedIndex = entries.findIndex((entry) => entry.id === picked.id);
      clearTimers();

      const settle = () => {
         clearTimers();
         setLiveIndex(null);
         setIsRolling(false);
         const result: RollResultEntry = { id: cuid(), entryId: picked.id, text: picked.text };
         onCacheLastKnown(item.id, { ...content, lastRoll: result, history: appendRollResult(content.history ?? [], result) });
      };

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) {
         settle();
         return;
      }

      // A schedule of row indices stepping cyclically down the list, ending exactly on the pick. The
      // cumulative time per step grows quadratically (ease-in), so the gaps widen and the highlight
      // decelerates into its landing.
      const n = entries.length;
      let steps = Math.max(10, n + pickedIndex + 1);
      steps += (((pickedIndex - (steps - 1)) % n) + n) % n; // land the final step on pickedIndex
      const times = Array.from({ length: steps }, (_, k) => ROLL_MS * ((k + 1) / steps) ** 2);

      setIsRolling(true);
      const start = performance.now();
      const tick = (now: number) => {
         const elapsed = now - start;
         if (elapsed >= ROLL_MS) {
            setLiveIndex(pickedIndex);
            rafRef.current = null;
            holdRef.current = setTimeout(settle, HOLD_MS);
            return;
         }
         let step = 0;
         while (step < steps - 1 && times[step + 1] <= elapsed) step++;
         setLiveIndex(step % n);
         rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
   };

   const liveText = liveIndex !== null ? content.entries[liveIndex]?.text ?? null : null;
   return { roll, liveIndex, liveText, isRolling };
}
