// -- React Imports --
import { useState } from 'react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { parseColorToRgb, rgbToHex } from '@/lib/color';
import { toHex } from '@/lib/theme/colorFormat';

/** A compact hex field beside a swatch: type/paste a color without opening the picker. Reverts garbage. */
export function HexInput({ value, label, onCommit, className, isMobile = false }: { value: string; label: string; onCommit: (hex: string) => void; className?: string; isMobile?: boolean }) {
   const hex = toHex(value);
   const [draft, setDraft] = useState(hex);
   // Re-sync when the token value changes elsewhere (the picker, a generate) - adjust-during-render pattern.
   const [synced, setSynced] = useState(hex);
   if (hex !== synced) { setSynced(hex); setDraft(hex); }

   const commit = () => {
      const rgb = parseColorToRgb(draft);
      if (rgb) onCommit(rgbToHex(...rgb)); // normalize (#rgb -> #rrggbb)
      else setDraft(hex); // invalid -> revert, never write garbage
   };
   return (
      <input
         type="text"
         aria-label={label}
         value={draft}
         spellCheck={false}
         onChange={(event) => setDraft(event.target.value)}
         onBlur={commit}
         onKeyDown={(event) => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') setDraft(hex); }}
         className={cn('h-7 rounded-md border border-input bg-transparent px-1.5 font-mono text-xs tabular-nums outline-none focus:border-ring', isMobile && 'h-9 px-2 text-sm', className)}
      />
   );
}
