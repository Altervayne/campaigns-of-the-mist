// -- React Imports --
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

// -- Utils Imports --
import { cn } from '@/lib/utils';

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
 * The "Image sizing" popover: how the picture fills its box (cover / contain) and one-shot aspect-ratio
 * presets that reshape the box (keep the width, set the height from the ratio - a resize command, not a
 * stored lock). Anchored to the image BOX (a real inset overlay) so it opens to the image's SIDE, and
 * CONTROLLED by the toolbar toggle (an interact-outside on that toggle is ignored so its click toggles).
 */
export function ImageSizingPopover({
   open,
   onOpenChange,
   toggleRef,
   content,
   onChange,
   onAspect,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   /** The toolbar toggle button; an interact-outside on it is ignored so its own click cleanly toggles. */
   toggleRef: RefObject<HTMLButtonElement | null>;
   content: ImageBoardContent;
   onChange: (content: ImageBoardContent) => void;
   onAspect: (ratio: number) => void;
}) {
   const { t } = useTranslation();

   const setFit = (fit: ImageBoardContent['fit']) => onChange({ ...content, fit });

   return (
      <Popover open={open} onOpenChange={onOpenChange}>
         {/* The real anchor: an inert overlay of the image box, so the content opens beside the IMAGE. */}
         <PopoverAnchor asChild>
            <div aria-hidden className="pointer-events-none absolute inset-0" />
         </PopoverAnchor>
         <PopoverContent
            side="right"
            align="center"
            sideOffset={8}
            collisionPadding={8}
            // The anchor (the image box) moves by CSS transform on pan/zoom/drag, which the default
            // scroll/resize tracking misses (it lags, then sticks); re-measure every frame instead.
            updatePositionStrategy="always"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
            onInteractOutside={(event) => {
               const target = event.target;
               if (toggleRef.current && target instanceof Node && toggleRef.current.contains(target)) event.preventDefault();
            }}
            className="w-56 p-2"
         >
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
