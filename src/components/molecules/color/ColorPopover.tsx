// -- Component Imports --
import { ColorSwatchButton } from './ColorSwatchButton';
import { ColorPicker } from './ColorPicker';

/*
 * The contents of a color popover: a row of curated palette swatches, a recents row, the
 * full custom picker, and a remove action. Generic and reusable beyond post-its. Position,
 * portaling, and dismissal are the host's job (it renders this inside a Radix Popover), so
 * this is content only. The picker emits onChange continuously while dragging, so it applies
 * without closing, while the discrete swatch / remove actions close on use.
 */

interface ColorPopoverProps {
   /** Currently active color hex, or undefined when unset. */
   activeColor: string | undefined;
   /** Curated quick-pick palette (no new colors join recents). */
   palette: readonly string[];
   /** Recently-used custom colors (most-recent-first). */
   recent: readonly string[];
   /** Localised label for the recents row. */
   recentLabel: string;
   /** Localised label for the remove action. Omit to hide remove (e.g. a line always has a color). */
   removeLabel?: string;
   /** Apply a color (undefined removes it). Does not close. */
   onApply: (color: string | undefined) => void;
   /** Close the popover (used by the discrete swatch / remove actions). */
   onClose: () => void;
   /** Enable the custom picker's opacity channel, so it emits `#RRGGBBAA`. */
   alpha?: boolean;
}

export function ColorPopover({ activeColor, palette, recent, recentLabel, removeLabel, onApply, onClose, alpha }: ColorPopoverProps) {
   const pickAndClose = (color: string) => { onApply(color); onClose(); };

   return (
      <div className="w-full">
         {/* Curated quick-pick swatches */}
         <div className="flex flex-wrap gap-1 p-2">
            {palette.map((color) => (
               <ColorSwatchButton key={color} color={color} isActive={activeColor === color} onPick={pickAndClose} />
            ))}
         </div>

         {/* Recently-used custom colors */}
         {recent.length > 0 && (
            <div className="border-t border-border px-2 pb-2 pt-1.5">
               <div className="px-1 pb-1.5 font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground/70">
                  {recentLabel}
               </div>
               <div className="flex flex-wrap gap-1">
                  {recent.map((color) => (
                     <ColorSwatchButton key={color} color={color} isActive={activeColor === color} onPick={pickAndClose} />
                  ))}
               </div>
            </div>
         )}

         {/* Full custom picker */}
         <div className="border-t border-border p-2">
            <ColorPicker value={activeColor ?? palette[0]} onChange={(color) => onApply(color)} alpha={alpha} />
         </div>

         {/* Remove color (hidden when no label is supplied - e.g. a connection always has a color) */}
         {removeLabel && (
            <div className="border-t border-border px-2 py-1.5">
               <button
                  type="button"
                  onClick={() => { onApply(undefined); onClose(); }}
                  className="w-full cursor-pointer rounded px-1 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
               >
                  {removeLabel}
               </button>
            </div>
         )}
      </div>
   );
}
