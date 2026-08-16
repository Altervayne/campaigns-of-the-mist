// -- React Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { RollTableDisplayToggle } from './RollTableDisplayToggle';

// -- Type Imports --
import type { RollTableDisplay } from '@/lib/rolltable/types';

/*
 * The table's header row, shared by the edit and read bodies so the title sits in one ruled bar above the
 * entries. Editing swaps the title text for an input; the display toggle rides the right edge only while
 * the item is selected, so a resting table stays clean. The read title is pointer-transparent (a body
 * click falls through to select, a drag moves the item); the toggle re-enables pointers for itself.
 */

interface RollTableHeaderProps {
   isEditing: boolean;
   isSelected: boolean;
   title: string;
   titlePlaceholder: string;
   display: RollTableDisplay;
   onTitleChange: (title: string) => void;
   onTitleCommit: () => void;
   onTitleFocus: () => void;
   onDisplayChange: (next: RollTableDisplay) => void;
   displayModeLabel: string;
   rangeLabel: string;
   weightLabel: string;
   percentLabel: string;
}

export function RollTableHeader({
   isEditing,
   isSelected,
   title,
   titlePlaceholder,
   display,
   onTitleChange,
   onTitleCommit,
   onTitleFocus,
   onDisplayChange,
   displayModeLabel,
   rangeLabel,
   weightLabel,
   percentLabel,
}: RollTableHeaderProps) {
   const stopDrag = (event: ReactPointerEvent) => event.stopPropagation();

   return (
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
         {isEditing ? (
            <input
               type="text"
               value={title}
               onChange={(event) => onTitleChange(event.target.value)}
               onFocus={onTitleFocus}
               onBlur={onTitleCommit}
               onPointerDown={stopDrag}
               placeholder={titlePlaceholder}
               className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
            />
         ) : (
            <div className={cn('pointer-events-none min-w-0 flex-1 truncate text-sm font-semibold', !title && 'text-muted-foreground/60')}>
               {title || titlePlaceholder}
            </div>
         )}

         {isSelected && (
            <RollTableDisplayToggle
               value={display}
               onChange={onDisplayChange}
               groupLabel={displayModeLabel}
               rangeLabel={rangeLabel}
               weightLabel={weightLabel}
               percentLabel={percentLabel}
            />
         )}
      </div>
   );
}
