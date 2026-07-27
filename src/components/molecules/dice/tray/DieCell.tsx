// -- React Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';

// -- Icon Imports --
import { Minus, Plus, X } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Hook Imports --
import { useLongPress } from '@/hooks/mobile/useLongPress';

// -- Component Imports --
import { DieShape } from '../DieShape';

// -- Type Imports --
import type { DiceTrayDie } from '@/lib/dice/diceTrayTypes';
import type { Position } from '@/hooks/mobile/useLongPress';

/**
 * One die in the tray. Desktop keeps its hover-gated penalty/remove buttons; mobile shows a clean face
 * and opens a context menu on long-press (touch has no hover), with a subtle press-down cue. The
 * long-press hook is touch-only, so it is inert on desktop; it is still gated to mobile anyway.
 */
export function DieCell({ die, face, editable, isMobile, penaltyLabel, removeLabel, stopDrag, onToggleNegative, onRemoveDie, onLongPress }: {
   die: DiceTrayDie;
   face: number | null;
   editable: boolean;
   isMobile: boolean;
   penaltyLabel: string;
   removeLabel: string;
   stopDrag: (event: ReactPointerEvent) => void;
   onToggleNegative: (id: string) => void;
   onRemoveDie: (id: string) => void;
   onLongPress: (id: string, position: Position) => void;
}) {
   const { isPressing, handlers } = useLongPress({ onLongPress: (pos) => onLongPress(die.id, pos) });
   const touchHandlers = isMobile && editable ? handlers : undefined;

   return (
      <div
         className={cn('group/die relative h-11 w-11', isMobile && 'h-13 w-13 transition-transform', isMobile && isPressing && 'scale-95')}
         {...touchHandlers}
      >
         <DieShape sides={die.sides} value={face} negative={die.negative} />
         {editable && !isMobile && (
            <>
               {/* Penalty toggle (top-left): flips the die negative so its value subtracts. Reveals on hover. */}
               <button
                  type="button"
                  title={penaltyLabel}
                  aria-label={penaltyLabel}
                  onPointerDown={stopDrag}
                  onClick={() => onToggleNegative(die.id)}
                  className="absolute -left-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-secondary text-secondary-foreground group-hover/die:flex cursor-pointer"
               >
                  {die.negative ? <Plus className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
               </button>
               {/* Remove (top-right). */}
               <button
                  type="button"
                  title={removeLabel}
                  aria-label={removeLabel}
                  onPointerDown={stopDrag}
                  onClick={() => onRemoveDie(die.id)}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover/die:flex cursor-pointer"
               >
                  <X className="h-2.5 w-2.5" />
               </button>
            </>
         )}
      </div>
   );
}
