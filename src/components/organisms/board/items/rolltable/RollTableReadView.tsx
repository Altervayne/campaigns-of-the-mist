// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { RollTableEntry } from '@/lib/rolltable/types';

/*
 * The resting list of a roll table: zebra-striped ruled rows, each split into a distinct centered leading
 * column (the display label: range / weight / percent) divided from the result text. Pointer-transparent so
 * a body click falls through to select (then edit) and a drag moves the item. While a roll animates the live
 * row lights via `liveIndex`; at rest the last result's row stays lit, matched by `highlightId` so it
 * follows the entry through reorders and edits (the lit row overrides the stripe). An empty entry text shows
 * a muted placeholder.
 */

interface RollTableReadViewProps {
   entries: RollTableEntry[];
   /** Per-entry leading-cell text under the active display mode (index-aligned with `entries`). */
   labels: string[];
   /** The row the roll is currently landing on, or null at rest. */
   liveIndex: number | null;
   /** The last-rolled entry's id, kept lit at rest; null before any roll or once that row is gone. */
   highlightId: string | null;
   entryPlaceholder: string;
}

export function RollTableReadView({ entries, labels, liveIndex, highlightId, entryPlaceholder }: RollTableReadViewProps) {
   return (
      <ul className="pointer-events-none flex flex-col divide-y divide-border border-b border-border">
         {entries.map((entry, index) => {
            const lit = liveIndex !== null ? liveIndex === index : entry.id === highlightId;
            return (
               <li
                  key={entry.id}
                  className={cn('flex items-stretch text-sm', lit ? 'bg-primary/15' : index % 2 === 1 && 'bg-muted/40')}
               >
                  <span className="w-12 shrink-0 border-r border-border px-1 py-1.5 text-center text-xs font-medium tabular-nums text-muted-foreground">
                     {labels[index]}
                  </span>
                  <span className={cn('min-w-0 flex-1 break-words px-2 py-1.5', !entry.text && 'text-muted-foreground/60')}>
                     {entry.text || entryPlaceholder}
                  </span>
               </li>
            );
         })}
      </ul>
   );
}
