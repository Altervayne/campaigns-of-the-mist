// -- React Imports --
import { useState, type PointerEvent as ReactPointerEvent } from 'react';

// -- Icon Imports --
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { RollTableEntry } from '@/lib/rolltable/types';

/*
 * One editable entry: a weight number field and the result text field, plus reorder and remove controls.
 * The weight input keeps its own display buffer so it can show a transient empty value while typing;
 * only a valid integer (>= 1) flows back to the draft, and blur reverts an invalid display. Text and
 * weight edits are buffered by the parent (committed on blur); the controls stop pointer propagation so
 * editing never starts a canvas move.
 */

interface RollTableEntryRowProps {
   entry: RollTableEntry;
   index: number;
   count: number;
   textPlaceholder: string;
   weightLabel: string;
   removeLabel: string;
   moveUpLabel: string;
   moveDownLabel: string;
   onTextChange: (id: string, text: string) => void;
   onWeightChange: (id: string, weight: number) => void;
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
   textPlaceholder,
   weightLabel,
   removeLabel,
   moveUpLabel,
   moveDownLabel,
   onTextChange,
   onWeightChange,
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

   return (
      <div className="flex items-center gap-1.5">
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
