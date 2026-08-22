// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Circle } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';



interface PipTrackerProps {
      label?: string;
      value: number;
      onUpdate: (newValue: number) => void;
      maxPips?: number;
      flexDir?: "flex-row" | "flew-row-reverse" | "flex-col" | "flex-col-reverse"
}



export function PipTracker({ label, value, onUpdate, maxPips = 3, flexDir = "flex-col" }: PipTrackerProps) {
   const { t: t } = useTranslation();

   const handleClick = (pipValue: number) => {
      if (value === pipValue) {
         onUpdate(0);
      } else {
         onUpdate(pipValue);
      }
   };

   const pips = Array.from({ length: maxPips }, (_, i) => i + 1);



   return (
      <div className={cn('flex flex-1 items-center gap-1', flexDir)}>
         <div className="flex gap-1">
            {pips.map((pip) => (
               <span key={pip} className="relative flex items-center justify-center">
                  <Circle
                     className={cn('h-3 w-3 cursor-pointer transition-colors', value >= pip ? 'fill-current' : 'fill-transparent')}
                     onClick={() => handleClick(pip)}
                  />
                  {/* Touch hit-slop: pips are 12px on a 16px pitch, so the widest overlay that can't steal a
                      neighbor's tap is the pitch itself (w-4). Taller than wide since only the label (inert)
                      sits below. Absolute + centered, so the visual pip and every sibling position hold. */}
                  <span
                     aria-hidden
                     onClick={() => handleClick(pip)}
                     className="absolute left-1/2 top-1/2 hidden h-6 w-4 -translate-x-1/2 -translate-y-1/2 cursor-pointer coarse:block"
                  />
               </span>
            ))}
         </div>
         {label && <span className="text-xs font-semibold uppercase">{t(`PipTracker.${label}`)}</span>}
      </div>
   );
}
