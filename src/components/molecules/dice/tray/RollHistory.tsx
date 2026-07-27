// -- React Imports --
import { useState, type PointerEvent as ReactPointerEvent } from 'react';

// -- Icon Imports --
import { ChevronDown, History, Trash2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { summarizeRoll } from '@/lib/dice/diceFormat';
import { formatRelativeItemDate } from '@/lib/drawer/itemDateDisplay';

// -- Type Imports --
import type { RollEntry } from '@/lib/dice/diceTrayTypes';

/**
 * The tucked roll history: a collapsed-by-default toggle that expands to a scrollable list of recent rolls
 * (newest first - result + relative time). Clicking an entry restores its setup (editable only); a clear
 * affordance empties the log. Reading the log is always allowed; restoring / clearing gate on `editable`.
 */
export function RollHistory({ entries, editable, label, emptyLabel, restoreLabel, clearLabel, stopDrag, onRestore, onClear, isMobile = false }: {
   entries: RollEntry[];
   editable: boolean;
   label: string;
   emptyLabel: string;
   restoreLabel: string;
   clearLabel: string;
   stopDrag: (event: ReactPointerEvent) => void;
   onRestore: (entry: RollEntry) => void;
   onClear: () => void;
   isMobile?: boolean;
}) {
   const [open, setOpen] = useState(false);
   return (
      <div className="shrink-0 border-t border-border">
         <button
            type="button"
            onPointerDown={stopDrag}
            onClick={() => setOpen((value) => !value)}
            className={cn(
               'flex w-full items-center justify-between px-2 py-1.5 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground cursor-pointer',
               isMobile && 'px-3 py-3 text-xs',
            )}
         >
            <span className="flex items-center gap-1"><History className={isMobile ? 'h-4 w-4' : 'h-3 w-3'} />{label}{entries.length > 0 && ` (${entries.length})`}</span>
            <ChevronDown className={cn('transition-transform', isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5', open && 'rotate-180')} />
         </button>
         {open && (
            <div className="max-h-40 overflow-y-auto px-2 pb-2">
               {entries.length === 0 ? (
                  <p className={cn('px-0.5 py-1 text-xs text-muted-foreground', isMobile && 'py-2 text-sm')}>{emptyLabel}</p>
               ) : (
                  <div className="flex flex-col gap-0.5">
                     {entries.map((entry) => (
                        <button
                           key={entry.id}
                           type="button"
                           disabled={!editable}
                           title={editable ? restoreLabel : undefined}
                           onPointerDown={stopDrag}
                           onClick={() => onRestore(entry)}
                           className={cn('flex items-start justify-between gap-2 rounded px-1.5 py-1 text-left', isMobile && 'px-2 py-2.5', editable ? 'hover:bg-muted cursor-pointer' : 'cursor-default')}
                        >
                           {/* The summary wraps (a big roll stays fully readable); the timestamp aligns to its first line. */}
                           <span className={cn('min-w-0 flex-1 break-words font-mono text-xs', isMobile && 'text-sm')}>
                              <span className="text-muted-foreground">{summarizeRoll(entry)} = </span>
                              <span className="font-bold tabular-nums">{entry.total}</span>
                           </span>
                           <span className={cn('shrink-0 text-[0.6rem] text-muted-foreground', isMobile && 'text-xs')}>{formatRelativeItemDate(entry.at)}</span>
                        </button>
                     ))}
                  </div>
               )}
               {editable && entries.length > 0 && (
                  <button
                     type="button"
                     onPointerDown={stopDrag}
                     onClick={onClear}
                     className={cn(
                        'mt-1 flex w-full items-center justify-center gap-1 rounded py-1 text-[0.65rem] text-muted-foreground hover:text-destructive cursor-pointer',
                        isMobile && 'py-2.5 text-xs',
                     )}
                  >
                     <Trash2 className={isMobile ? 'h-4 w-4' : 'h-3 w-3'} />{clearLabel}
                  </button>
               )}
            </div>
         )}
      </div>
   );
}
