// -- React Imports --
import { useState } from 'react';

// -- Basic UI Imports --
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// -- Icon Imports --
import { Info } from 'lucide-react';

/**
 * A muted info icon explaining a token's purpose (copy from the theme audit). Hover tooltip on desktop;
 * touch has no hover, so isMobile reveals the same text on tap via a small popover.
 */
export function InfoTip({ text, isMobile = false }: { text: string; isMobile?: boolean }) {
   const [open, setOpen] = useState(false);

   if (isMobile) {
      return (
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <button type="button" aria-label={text} className="shrink-0 cursor-pointer text-muted-foreground/60 hover:text-foreground">
                  <Info className="h-4 w-4" />
               </button>
            </PopoverTrigger>
            <PopoverContent className="max-w-64 text-sm">{text}</PopoverContent>
         </Popover>
      );
   }

   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <button type="button" tabIndex={-1} aria-label={text} className="shrink-0 cursor-help text-muted-foreground/60 hover:text-foreground coarse:flex coarse:size-9 coarse:items-center coarse:justify-center">
               <Info className="h-3.5 w-3.5" />
            </button>
         </TooltipTrigger>
         <TooltipContent className="max-w-56">{text}</TooltipContent>
      </Tooltip>
   );
}
