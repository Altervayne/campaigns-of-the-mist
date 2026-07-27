// -- React Imports --
import { useState, type PointerEvent as ReactPointerEvent } from 'react';

// -- Icon Imports --
import { Minus, Plus, X } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { signed } from '@/lib/dice/diceFormat';

// -- Hook Imports --
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';

// -- Component Imports --
import { StepButton } from './DiceStepButton';

// -- Type Imports --
import type { DiceTrayModifier } from '@/lib/dice/diceTrayTypes';

/** One modifier row: a label (commit on blur) + a signed value stepper + remove. */
export function ModifierRow({
   modifier,
   placeholder,
   removeLabel,
   stopDrag,
   onChangeValue,
   onChangeLabel,
   onRemove,
   isMobile = false,
}: {
   modifier: DiceTrayModifier;
   placeholder: string;
   removeLabel: string;
   stopDrag: (event: ReactPointerEvent) => void;
   onChangeValue: (value: number) => void;
   onChangeLabel: (label: string) => void;
   onRemove: () => void;
   isMobile?: boolean;
}) {
   const [label, setLabel] = useState(modifier.label ?? '');
   const [synced, setSynced] = useState(modifier.label ?? '');
   if ((modifier.label ?? '') !== synced) {
      setSynced(modifier.label ?? '');
      setLabel(modifier.label ?? '');
   }
   const commit = () => {
      const trimmed = label.trim();
      if (trimmed !== (modifier.label ?? '')) onChangeLabel(trimmed);
   };

   // The board host unmounts on a tab switch without a blur; flush the buffered label so it isn't lost.
   useCommitOnUnmount(commit);

   return (
      <div className="flex items-center gap-1">
         <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onBlur={commit}
            onPointerDown={stopDrag}
            placeholder={placeholder}
            className={cn(
               'min-w-0 flex-1 rounded border border-border bg-transparent px-1.5 py-0.5 text-xs outline-none placeholder:text-muted-foreground/60',
               isMobile && 'h-9 px-2 text-sm',
            )}
         />
         <div className={cn('flex shrink-0 items-center gap-0.5 rounded border border-border px-1 py-0.5', isMobile && 'h-9 gap-1 px-1.5 py-0')}>
            <StepButton onPointerDown={stopDrag} onClick={() => onChangeValue(modifier.value - 1)} isMobile={isMobile}><Minus className={isMobile ? 'h-4 w-4' : 'h-3 w-3'} /></StepButton>
            <span className={cn('w-6 text-center font-mono text-xs tabular-nums', isMobile && 'w-8 text-sm')}>{signed(modifier.value)}</span>
            <StepButton onPointerDown={stopDrag} onClick={() => onChangeValue(modifier.value + 1)} isMobile={isMobile}><Plus className={isMobile ? 'h-4 w-4' : 'h-3 w-3'} /></StepButton>
         </div>
         <button
            type="button"
            title={removeLabel}
            aria-label={removeLabel}
            onPointerDown={stopDrag}
            onClick={onRemove}
            className={cn(
               'flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive hover:text-destructive-foreground cursor-pointer',
               isMobile && 'h-9 w-9',
            )}
         >
            <X className={isMobile ? 'h-4 w-4' : 'h-3 w-3'} />
         </button>
      </div>
   );
}
