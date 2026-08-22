// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// -- Icon Imports --
import { AlertTriangle } from 'lucide-react';

// -- Component Imports --
import { ColorPickerPopover } from '@/components/molecules/color/ColorPickerPopover';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { readRecentColors } from '@/lib/recentColors';
import { toHex } from '@/lib/theme/colorFormat';

/** One token's swatch for one mode: opens the shared picker, commits the chosen hex; flags low contrast. */
export function TokenSwatch({ value, label, onPick, warning, isMobile = false }: { value: string; label: string; onPick: (hex: string) => void; warning?: string; isMobile?: boolean }) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);
   return (
      <div className="relative">
         <ColorPickerPopover
            open={open}
            onOpenChange={setOpen}
            activeColor={toHex(value)}
            palette={[]}
            recent={readRecentColors()}
            recentLabel={t('BoardView.recentColors')}
            onApply={(color) => { if (color) onPick(color); }}
            trigger={
               <button
                  type="button"
                  aria-label={label}
                  title={label}
                  className={cn('shrink-0 rounded-md border border-border cursor-pointer', isMobile ? 'h-9 w-9' : 'h-7 w-7')}
                  style={{ backgroundColor: value }}
               />
            }
         />
         {warning && (
            <Tooltip>
               <TooltipTrigger asChild>
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-background">
                     <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  </span>
               </TooltipTrigger>
               <TooltipContent className="max-w-56">{warning}</TooltipContent>
            </Tooltip>
         )}
      </div>
   );
}
