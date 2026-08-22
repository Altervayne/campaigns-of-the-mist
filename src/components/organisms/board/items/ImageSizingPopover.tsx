// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Proportions } from 'lucide-react';

// -- Component Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { IMAGE_TOOLBAR_BUTTON_CLASS } from './imageToolbarButton';

// -- Type Imports --
import type { ImageBoardContent } from '@/lib/types/board';

/** Aspect-ratio presets, in row order. The labels are the ratio itself (language-neutral). */
const ASPECT_PRESETS: { label: string; ratio: number }[] = [
   { label: '1:1', ratio: 1 },
   { label: '4:3', ratio: 4 / 3 },
   { label: '3:2', ratio: 3 / 2 },
   { label: '16:9', ratio: 16 / 9 },
];

/*
 * The "Image sizing" menu: how the picture fills its box (cover / contain) and one-shot aspect-ratio presets
 * that reshape the box (keep the width, set the height from the ratio). The presets fire a resize command, not
 * a stored lock - the box stays freely draggable afterward. Fit spreads `content` and sets one field.
 */
export function ImageSizingPopover({
   content,
   onChange,
   onAspect,
}: {
   content: ImageBoardContent;
   onChange: (content: ImageBoardContent) => void;
   onAspect: (ratio: number) => void;
}) {
   const { t } = useTranslation();

   const setFit = (fit: ImageBoardContent['fit']) => onChange({ ...content, fit });

   return (
      <Popover>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={t('BoardView.imageSizing')}
               aria-label={t('BoardView.imageSizing')}
               onPointerDown={(event) => event.stopPropagation()}
               className={IMAGE_TOOLBAR_BUTTON_CLASS}
            >
               <Proportions className="h-4 w-4" />
            </button>
         </PopoverTrigger>
         {/* Stop the pointer or the canvas background handler reads it as a click-away and drops the selection. */}
         <PopoverContent align="center" className="w-56 p-2" onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex flex-col gap-3">
               <section className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{t('BoardView.imageFit')}</span>
                  <div className="flex items-center gap-1">
                     <FitButton label={t('BoardView.imageFit_cover')} selected={content.fit === 'cover'} onClick={() => setFit('cover')} />
                     <FitButton label={t('BoardView.imageFit_contain')} selected={content.fit === 'contain'} onClick={() => setFit('contain')} />
                  </div>
               </section>

               <section className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{t('BoardView.imageAspect')}</span>
                  <div className="flex items-center gap-1">
                     {ASPECT_PRESETS.map(({ label, ratio }) => (
                        <button
                           key={label}
                           type="button"
                           aria-label={`${t('BoardView.imageAspect')} ${label}`}
                           onClick={() => onAspect(ratio)}
                           className="flex h-7 flex-1 cursor-pointer items-center justify-center rounded px-1.5 text-xs tabular-nums text-foreground hover:bg-muted"
                        >
                           {label}
                        </button>
                     ))}
                  </div>
               </section>
            </div>
         </PopoverContent>
      </Popover>
   );
}

/** A selectable fit pill (cover / contain). */
function FitButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
   return (
      <button
         type="button"
         aria-label={label}
         onClick={onClick}
         className={cn(
            'flex h-7 flex-1 cursor-pointer items-center justify-center rounded px-1.5 text-xs text-foreground hover:bg-muted',
            selected && 'bg-muted ring-1 ring-primary',
         )}
      >
         {label}
      </button>
   );
}
