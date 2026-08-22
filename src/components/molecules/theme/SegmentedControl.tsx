// -- Basic UI Imports --
import { Button } from '@/components/ui/button';

// -- Utils Imports --
import { cn } from '@/lib/utils';

/** An evenly-split segmented control (tier / saturation / contrast), with a one-line note on the active option. */
export function SegmentedControl<T extends string | number>({ label, options, value, onChange, isMobile = false }: {
   label?: string;
   options: { value: T; label: string; desc?: string }[];
   value: T;
   onChange: (value: T) => void;
   isMobile?: boolean;
}) {
   const active = options.find((option) => option.value === value);
   return (
      <div className="flex flex-col gap-1.5">
         {label && <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>}
         <div className="grid grid-cols-3 gap-1.5">
            {options.map((option) => (
               <Button key={option.value} variant={value === option.value ? 'default' : 'outline'} size="sm" onClick={() => onChange(option.value)} className={cn('w-full cursor-pointer', isMobile && 'h-11 text-sm')}>
                  {option.label}
               </Button>
            ))}
         </div>
         {active?.desc && <p className="text-xs text-muted-foreground">{active.desc}</p>}
      </div>
   );
}
