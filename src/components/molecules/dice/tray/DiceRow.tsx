// -- React Imports --
import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Plus } from 'lucide-react';

// -- Basic UI Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { QUICK_PICK } from '@/lib/dice/diceTray';

// -- Component Imports --
import { DieShape } from '../DieShape';
import { CommandPopover } from './CommandPopover';
import { CustomSidesAdder } from './CustomSidesAdder';
import { DieCell } from './DieCell';

// -- Type Imports --
import type { DiceTrayDie } from '@/lib/dice/diceTrayTypes';
import type { Position } from '@/hooks/mobile/useLongPress';

/** The dice, each as its shape, plus the add-die picker. */
export function DiceRow({ dice, editable, isMobile, stopDrag, faceOf, onAddDie, onToggleNegative, onRemoveDie, onLongPress, onApplyCommand }: {
   dice: DiceTrayDie[];
   editable: boolean;
   isMobile: boolean;
   stopDrag: (event: ReactPointerEvent) => void;
   faceOf: (id: string) => number | null;
   onAddDie: (sides: number) => void;
   onToggleNegative: (id: string) => void;
   onRemoveDie: (id: string) => void;
   onLongPress: (id: string, position: Position) => void;
   onApplyCommand: (raw: string) => boolean;
}) {
   const { t } = useTranslation();
   const [pickerOpen, setPickerOpen] = useState(false);
   const addDieFromPicker = (sides: number) => { onAddDie(sides); setPickerOpen(false); };

   return (
      <div className="flex flex-wrap content-start gap-1.5 p-2">
         {dice.map((die) => (
            <DieCell
               key={die.id}
               die={die}
               face={faceOf(die.id)}
               editable={editable}
               isMobile={isMobile}
               penaltyLabel={t('BoardView.diceToggleNegative')}
               removeLabel={t('BoardView.diceRemoveDie')}
               stopDrag={stopDrag}
               onToggleNegative={onToggleNegative}
               onRemoveDie={onRemoveDie}
               onLongPress={onLongPress}
            />
         ))}

         <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
               <button
                  type="button"
                  title={t('BoardView.diceAddDie')}
                  aria-label={t('BoardView.diceAddDie')}
                  onPointerDown={stopDrag}
                  className={cn('flex h-11 w-11 items-center justify-center rounded-md border-2 border-dashed border-border text-muted-foreground hover:border-foreground hover:text-foreground cursor-pointer', isMobile && 'h-13 w-13')}
               >
                  <Plus className={isMobile ? 'h-6 w-6' : 'h-5 w-5'} />
               </button>
            </PopoverTrigger>
            {/* Above the app-modal overlay band (z-60) so the picker clears a host sheet (the mobile
                dice tray sits in a bottom sheet); already top-most on desktop/board, so no change there. */}
            <PopoverContent align="start" sideOffset={6} className="z-[70] w-auto p-2">
               <div className="grid grid-cols-4 gap-1">
                  {QUICK_PICK.map((sides) => (
                     <button
                        key={sides}
                        type="button"
                        title={`d${sides}`}
                        aria-label={`d${sides}`}
                        onClick={() => addDieFromPicker(sides)}
                        className="flex h-12 w-12 flex-col items-center justify-center rounded hover:bg-muted cursor-pointer"
                     >
                        <div className="h-7 w-7"><DieShape sides={sides} value={null} /></div>
                        <span className="font-mono text-[0.6rem] text-muted-foreground">d{sides}</span>
                     </button>
                  ))}
               </div>
               {/* Custom sides: add any dN by hand (any integer >= 2 -> a weird die). */}
               <CustomSidesAdder
                  placeholder={t('BoardView.diceCustomSidesPlaceholder')}
                  addLabel={t('BoardView.diceAddCustomDie')}
                  onAdd={addDieFromPicker}
                  isMobile={isMobile}
               />
            </PopoverContent>
         </Popover>

         {/* Build the whole tray from a typed formula like 1d6+2d12+4-2. Always rendered, like the
             add-die picker, so the dice row's layout is identical whether or not the tray is selected
             (a board item gates `editable` on selection - a conditional in-flow control would reflow). */}
         <CommandPopover
            triggerLabel={t('BoardView.diceCommandLabel')}
            placeholder={t('BoardView.diceCommandPlaceholder')}
            applyLabel={t('BoardView.diceCommandApply')}
            errorLabel={t('BoardView.diceCommandError')}
            stopDrag={stopDrag}
            onApply={onApplyCommand}
            isMobile={isMobile}
         />
      </div>
   );
}
