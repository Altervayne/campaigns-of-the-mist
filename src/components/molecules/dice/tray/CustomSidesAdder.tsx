// -- React Imports --
import { useState } from 'react';

// -- Icon Imports --
import { Plus } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

/** A number field for adding a die with any side count (>= 2): the by-hand path to a weird die. */
export function CustomSidesAdder({ placeholder, addLabel, onAdd, isMobile = false }: { placeholder: string; addLabel: string; onAdd: (sides: number) => void; isMobile?: boolean }) {
   const [raw, setRaw] = useState('');
   const submit = () => {
      const sides = parseInt(raw, 10);
      if (Number.isFinite(sides) && sides >= 2) {
         onAdd(sides);
         setRaw('');
      }
   };
   return (
      <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
         <span className={cn('font-mono text-xs text-muted-foreground', isMobile && 'text-sm')}>d</span>
         <input
            type="number"
            min={2}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }}
            placeholder={placeholder}
            className={cn('w-16 rounded border border-border bg-transparent px-1.5 py-0.5 text-xs outline-none placeholder:text-muted-foreground/60', isMobile && 'w-20 px-2 py-1.5 text-sm')}
         />
         <button
            type="button"
            title={addLabel}
            aria-label={addLabel}
            onClick={submit}
            className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer', isMobile && 'h-9 w-9')}
         >
            <Plus className={isMobile ? 'h-5 w-5' : 'h-4 w-4'} />
         </button>
      </div>
   );
}
