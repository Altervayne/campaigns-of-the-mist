// -- React Imports --
import { useState, type PointerEvent as ReactPointerEvent } from 'react';

// -- Icon Imports --
import { CornerDownLeft, Terminal } from 'lucide-react';

// -- Basic UI Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// -- Utils Imports --
import { cn } from '@/lib/utils';

/**
 * The tucked dice-command entry: a small icon that opens a field where a formula (e.g. `1d6+2d12+4`)
 * REPLACES the tray. `onApply` returns false on a bad parse, which surfaces a subtle inline error and
 * leaves the tray untouched (the popover stays open so the typo can be fixed).
 */
export function CommandPopover({ triggerLabel, placeholder, applyLabel, errorLabel, stopDrag, onApply, isMobile = false }: {
   triggerLabel: string;
   placeholder: string;
   applyLabel: string;
   errorLabel: string;
   stopDrag: (event: ReactPointerEvent) => void;
   onApply: (raw: string) => boolean;
   isMobile?: boolean;
}) {
   const [open, setOpen] = useState(false);
   const [value, setValue] = useState('');
   const [error, setError] = useState(false);
   const submit = () => {
      if (onApply(value.trim())) {
         setValue('');
         setError(false);
         setOpen(false);
      } else {
         setError(true);
      }
   };
   return (
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(false); }}>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={triggerLabel}
               aria-label={triggerLabel}
               onPointerDown={stopDrag}
               className={cn('flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer', isMobile && 'h-13 w-13')}
            >
               <Terminal className={isMobile ? 'h-6 w-6' : 'h-5 w-5'} />
            </button>
         </PopoverTrigger>
         <PopoverContent align="start" sideOffset={6} className="z-[70] w-64 p-2">
            <div className="flex items-center gap-1">
               <input
                  type="text"
                  autoFocus
                  value={value}
                  onChange={(event) => { setValue(event.target.value); setError(false); }}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }}
                  onPointerDown={stopDrag}
                  placeholder={placeholder}
                  className={cn(
                     'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground/60',
                     isMobile && 'py-2 text-sm',
                     error ? 'border-destructive' : 'border-border',
                  )}
               />
               <button
                  type="button"
                  title={applyLabel}
                  aria-label={applyLabel}
                  onPointerDown={stopDrag}
                  onClick={submit}
                  className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer', isMobile && 'h-9 w-9')}
               >
                  <CornerDownLeft className={isMobile ? 'h-5 w-5' : 'h-4 w-4'} />
               </button>
            </div>
            {error && <p className="mt-1 px-0.5 text-[0.65rem] text-destructive">{errorLabel}</p>}
         </PopoverContent>
      </Popover>
   );
}
