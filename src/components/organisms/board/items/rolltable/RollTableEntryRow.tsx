// -- React Imports --
import { useState, type PointerEvent as ReactPointerEvent } from 'react';

// -- Icon Imports --
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { RollTableDisplay, RollTableEntry } from '@/lib/rolltable/types';

/*
 * One editable entry: its result text plus reorder / remove controls, and a leading cell that follows the
 * table's display mode. In 'weight' mode the cell is the raw weight field. In 'range' mode it is a
 * read-only START prefix (derived from the preceding rows) followed by an editable END field, where the
 * weight is `end - start + 1`; editing an end reflows the rows below it. In 'percent' mode the weight field
 * stays editable with the read-only percent shown beside it. Each numeric field keeps its own display
 * buffer so it tolerates a transient empty value while typing (blur reverts an invalid one), and every
 * control stops pointer propagation so editing never starts a canvas move.
 */

interface RollTableEntryRowProps {
   entry: RollTableEntry;
   index: number;
   count: number;
   /** The table's active display mode; picks the leading cell. */
   display: RollTableDisplay;
   /** This row's cumulative range start (1-based), for the range cell's prefix and end math. */
   start: number;
   textPlaceholder: string;
   weightLabel: string;
   removeLabel: string;
   moveUpLabel: string;
   moveDownLabel: string;
   /** The read-only percent label, shown beside the weight field in 'percent' mode. */
   hint?: string;
   /** Whether this row is the last-rolled result, kept lit while editing. */
   highlighted?: boolean;
   onTextChange: (id: string, text: string) => void;
   onWeightChange: (id: string, weight: number) => void;
   /** Sets the weight from an edited range end (weight = end - start + 1, floored to 1). */
   onEndChange: (id: string, end: number) => void;
   onRemove: (id: string) => void;
   onMove: (id: string, direction: -1 | 1) => void;
   /** Persists the buffered field edits (bound to the parent's commit). */
   onCommit: () => void;
   /** Selects the item when a field takes focus. */
   onFieldFocus: () => void;
}

export function RollTableEntryRow({
   entry,
   index,
   count,
   display,
   start,
   textPlaceholder,
   weightLabel,
   removeLabel,
   moveUpLabel,
   moveDownLabel,
   hint,
   highlighted,
   onTextChange,
   onWeightChange,
   onEndChange,
   onRemove,
   onMove,
   onCommit,
   onFieldFocus,
}: RollTableEntryRowProps) {
   const stopDrag = (event: ReactPointerEvent) => event.stopPropagation();

   // Display buffer for the weight field: mirrors the numeric weight but tolerates a transient empty /
   // partial value while typing. Re-syncs from the weight prop on an external change (undo/redo).
   const [weightText, setWeightText] = useState(String(entry.weight));
   const [syncedWeight, setSyncedWeight] = useState(entry.weight);
   if (entry.weight !== syncedWeight) {
      setSyncedWeight(entry.weight);
      setWeightText(String(entry.weight));
   }

   const handleWeightInput = (value: string) => {
      setWeightText(value);
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed) && parsed >= 1) onWeightChange(entry.id, parsed);
   };
   // An empty or below-range display on blur snaps back to the committed weight.
   const handleWeightBlur = () => {
      const parsed = Number.parseInt(weightText, 10);
      if (Number.isNaN(parsed) || parsed < 1) setWeightText(String(entry.weight));
      onCommit();
   };

   // Display buffer for the range END field. The end derives from start + weight; it re-syncs whenever
   // either shifts (undo/redo, or a preceding row's weight change reflowing this row's start).
   const end = start + entry.weight - 1;
   const [endText, setEndText] = useState(String(end));
   const [syncedEnd, setSyncedEnd] = useState(end);
   if (end !== syncedEnd) {
      setSyncedEnd(end);
      setEndText(String(end));
   }

   const handleEndInput = (value: string) => {
      setEndText(value);
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed) && parsed >= start) onEndChange(entry.id, parsed);
   };
   // An empty or below-start display on blur snaps back to the committed end (start .. weight-1 band).
   const handleEndBlur = () => {
      const parsed = Number.parseInt(endText, 10);
      if (Number.isNaN(parsed) || parsed < start) setEndText(String(end));
      onCommit();
   };

   return (
      <div className={cn('flex items-center gap-1.5 px-2 py-1.5', highlighted && 'bg-primary/15')}>
         {display === 'range' ? (
            <div className="flex shrink-0 items-center gap-0.5 text-xs tabular-nums text-muted-foreground">
               <span>{start}</span>
               <span>-</span>
               <input
                  type="text"
                  inputMode="numeric"
                  aria-label={weightLabel}
                  value={endText}
                  onChange={(event) => handleEndInput(event.target.value)}
                  onFocus={onFieldFocus}
                  onBlur={handleEndBlur}
                  onPointerDown={stopDrag}
                  className="w-9 rounded border border-border bg-transparent px-1 py-1 text-center text-foreground outline-none focus:border-primary"
               />
            </div>
         ) : (
            <>
               <input
                  type="text"
                  inputMode="numeric"
                  aria-label={weightLabel}
                  value={weightText}
                  onChange={(event) => handleWeightInput(event.target.value)}
                  onFocus={onFieldFocus}
                  onBlur={handleWeightBlur}
                  onPointerDown={stopDrag}
                  className="w-10 shrink-0 rounded border border-border bg-transparent px-1 py-1 text-center text-xs tabular-nums outline-none focus:border-primary"
               />
               {display === 'percent' && hint !== undefined && (
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{hint}</span>
               )}
            </>
         )}
         <input
            type="text"
            value={entry.text}
            onChange={(event) => onTextChange(entry.id, event.target.value)}
            onFocus={onFieldFocus}
            onBlur={onCommit}
            onPointerDown={stopDrag}
            placeholder={textPlaceholder}
            className="min-w-0 flex-1 rounded border border-border bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary"
         />
         <div className="flex shrink-0 flex-col">
            <button
               type="button"
               aria-label={moveUpLabel}
               title={moveUpLabel}
               disabled={index === 0}
               onPointerDown={stopDrag}
               onClick={() => onMove(entry.id, -1)}
               className="flex h-3.5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
               <ChevronUp className="h-3 w-3" />
            </button>
            <button
               type="button"
               aria-label={moveDownLabel}
               title={moveDownLabel}
               disabled={index === count - 1}
               onPointerDown={stopDrag}
               onClick={() => onMove(entry.id, 1)}
               className="flex h-3.5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
               <ChevronDown className="h-3 w-3" />
            </button>
         </div>
         <button
            type="button"
            aria-label={removeLabel}
            title={removeLabel}
            onPointerDown={stopDrag}
            onClick={() => onRemove(entry.id)}
            className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground')}
         >
            <Trash2 className="h-3.5 w-3.5" />
         </button>
      </div>
   );
}
