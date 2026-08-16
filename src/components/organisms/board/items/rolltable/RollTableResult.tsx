// -- React Imports --
import { useState, type PointerEvent as ReactPointerEvent } from 'react';

// -- Icon Imports --
import { ChevronDown, History } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { NoteMarkdown } from '@/components/molecules/NoteMarkdown';

// -- Type Imports --
import type { MentionSegment } from '@/lib/challenge/parseMentions';
import type { RollResultEntry } from '@/lib/rolltable/types';

/*
 * The output area of a roll table: the last result shown prominently with `{brace}` tokens rendered as
 * tap-to-mint pills, over a collapsed-by-default log of earlier results (newest first, pills inert). Before
 * any roll it shows a muted empty line; the history toggle appears only once a prior roll exists. Scroll
 * regions are marked for native wheel scroll, and the toggle stops pointer propagation so it never starts a
 * canvas move.
 */

interface RollTableResultProps {
   lastRoll: RollResultEntry | null | undefined;
   history: RollResultEntry[];
   /** The live highlighted-entry text mid-roll (plain, no mint); null at rest. */
   liveText: string | null;
   resultLabel: string;
   emptyLabel: string;
   historyLabel: string;
   onMentionClick: (segment: MentionSegment) => void;
}

export function RollTableResult({ lastRoll, history, liveText, resultLabel, emptyLabel, historyLabel, onMentionClick }: RollTableResultProps) {
   const [open, setOpen] = useState(false);
   const stopDrag = (event: ReactPointerEvent) => event.stopPropagation();
   // The newest result already shows above; the log lists the ones before it.
   const past = history.slice(1);

   return (
      <div className="flex shrink-0 flex-col border-t border-border">
         <div className="flex flex-col gap-0.5 px-2 py-1.5">
            <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{resultLabel}</span>
            {liveText !== null ? (
               <div className="max-h-24 overflow-hidden">
                  <span className="text-sm">{liveText}</span>
               </div>
            ) : lastRoll ? (
               <div data-board-wheel-scroll className="max-h-24 overflow-y-auto">
                  <NoteMarkdown content={lastRoll.text} onMentionClick={onMentionClick} />
               </div>
            ) : (
               <span className="text-sm text-muted-foreground/60">{emptyLabel}</span>
            )}
         </div>

         {past.length > 0 && (
            <div className="border-t border-border">
               <button
                  type="button"
                  onPointerDown={stopDrag}
                  onClick={() => setOpen((value) => !value)}
                  className="flex w-full items-center justify-between px-2 py-1.5 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground cursor-pointer"
               >
                  <span className="flex items-center gap-1"><History className="h-3 w-3" />{historyLabel} ({past.length})</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
               </button>
               {open && (
                  <div data-board-wheel-scroll className="max-h-32 overflow-y-auto px-2 pb-2">
                     <ul className="flex flex-col gap-1">
                        {past.map((entry) => (
                           <li key={entry.id} className="border-l-2 border-border pl-2 text-muted-foreground">
                              <NoteMarkdown content={entry.text} />
                           </li>
                        ))}
                     </ul>
                  </div>
               )}
            </div>
         )}
      </div>
   );
}
