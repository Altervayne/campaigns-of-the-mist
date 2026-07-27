// -- React Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Dices } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { signed } from '@/lib/dice/diceFormat';

/** Roll + the breakdown + total. */
export function RollFooter({ displayTotal, displayModifiers, isMobile, stopDrag, onRoll }: {
   displayTotal: number | null;
   displayModifiers: { label?: string; value: number }[];
   isMobile: boolean;
   stopDrag: (event: ReactPointerEvent) => void;
   onRoll: () => void;
}) {
   const { t } = useTranslation();

   return (
      <div className="flex shrink-0 flex-col gap-1 border-t border-border p-2">
         {displayTotal !== null && displayModifiers.length > 0 && (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[0.65rem] text-muted-foreground">
               {displayModifiers.map((modifier, index) => (
                  <span key={index} className="font-mono">{modifier.label ? `${modifier.label} ${signed(modifier.value)}` : signed(modifier.value)}</span>
               ))}
            </div>
         )}
         <div className="flex items-center gap-2">
            <button
               type="button"
               onPointerDown={stopDrag}
               onClick={onRoll}
               className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 cursor-pointer',
                  isMobile && 'gap-2 py-2 text-base',
               )}
            >
               <Dices className={isMobile ? 'h-5 w-5' : 'h-4 w-4'} />
               {t('BoardView.diceRoll')}
            </button>
            {displayTotal !== null && (
               <div className="shrink-0 text-right">
                  <span className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{t('BoardView.diceTotal')}</span>
                  <div className="font-mono text-xl font-bold leading-none tabular-nums">{displayTotal}</div>
               </div>
            )}
         </div>
      </div>
   );
}
