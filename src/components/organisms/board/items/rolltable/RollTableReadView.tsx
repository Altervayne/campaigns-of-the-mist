// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { RollTableEntry } from '@/lib/rolltable/types';

/*
 * The resting view of a roll table: its title and weighted entries as plain text. Pointer-transparent so a
 * body click falls through to select (then edit) and a drag moves the item. Empty title / entries show a
 * muted placeholder.
 */

interface RollTableReadViewProps {
   title: string;
   entries: RollTableEntry[];
   titlePlaceholder: string;
   entryPlaceholder: string;
}

export function RollTableReadView({ title, entries, titlePlaceholder, entryPlaceholder }: RollTableReadViewProps) {
   return (
      <div className="pointer-events-none flex w-full flex-col gap-1.5 p-2">
         <div className={cn('truncate px-1 text-sm font-semibold', !title && 'text-muted-foreground/60')}>
            {title || titlePlaceholder}
         </div>
         <ul className="flex flex-col gap-1">
            {entries.map((entry) => (
               <li key={entry.id} className="flex items-start gap-2 px-1 text-sm">
                  <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
                     {entry.weight}
                  </span>
                  <span className={cn('min-w-0 break-words', !entry.text && 'text-muted-foreground/60')}>
                     {entry.text || entryPlaceholder}
                  </span>
               </li>
            ))}
         </ul>
      </div>
   );
}
