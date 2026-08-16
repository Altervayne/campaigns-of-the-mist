// -- React Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { RollTableDisplay } from '@/lib/rolltable/types';

/*
 * A compact three-way segmented control picking how entry cells read: Ranges | Weights | %. Shown only
 * while the table is selected. Stops pointer propagation so a press never starts a canvas move; the
 * active segment carries the primary token, the rest sit muted.
 */

interface RollTableDisplayToggleProps {
   value: RollTableDisplay;
   onChange: (next: RollTableDisplay) => void;
   groupLabel: string;
   rangeLabel: string;
   weightLabel: string;
   percentLabel: string;
}

export function RollTableDisplayToggle({ value, onChange, groupLabel, rangeLabel, weightLabel, percentLabel }: RollTableDisplayToggleProps) {
   const stopDrag = (event: ReactPointerEvent) => event.stopPropagation();
   const options: { mode: RollTableDisplay; label: string; text: string }[] = [
      { mode: 'range', label: rangeLabel, text: rangeLabel },
      { mode: 'weight', label: weightLabel, text: weightLabel },
      { mode: 'percent', label: percentLabel, text: '%' },
   ];

   return (
      <div role="group" aria-label={groupLabel} onPointerDown={stopDrag} className="flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5">
         {options.map((option) => {
            const active = option.mode === value;
            return (
               <button
                  key={option.mode}
                  type="button"
                  aria-label={option.label}
                  aria-pressed={active}
                  onClick={() => onChange(option.mode)}
                  className={cn(
                     'rounded px-1.5 py-0.5 text-[0.65rem] font-semibold cursor-pointer',
                     active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
               >
                  {option.text}
               </button>
            );
         })}
      </div>
   );
}
