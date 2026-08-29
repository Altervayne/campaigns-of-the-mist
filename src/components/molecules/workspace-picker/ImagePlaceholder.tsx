// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { ImagePlus } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

/*
 * The empty image slot shown inside the board and note vignettes so both flaunt that a workspace can hold
 * pictures: a soft neutral card with a dashed inner frame and a centred "add image" glyph over its label.
 * Fixed art tones on purpose (theme-stable): illustrated content the card displays, not app chrome.
 */

interface ImagePlaceholderProps {
   /** Sizing/positioning for the slot. */
   className?: string;
   /** Glyph only, for slots too small for the label. */
   compact?: boolean;
}

export function ImagePlaceholder({ className, compact }: ImagePlaceholderProps) {
   const { t } = useTranslation();
   return (
      <div className={cn('relative flex items-center justify-center bg-[#e9eef2]', className)}>
         <span className="absolute inset-[9%] rounded-[3px] border border-dashed border-[#a2b1bd]" />
         <span className="relative flex flex-col items-center gap-0.5 text-[#7f909d]">
            <ImagePlus className="h-5 w-5" />
            {!compact && (
               <span className="text-[7px] font-medium leading-none">{t('Tabs.newTabDialog.imagePlaceholder')}</span>
            )}
         </span>
      </div>
   );
}
