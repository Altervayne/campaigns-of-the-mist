// -- React Imports --
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Shapes } from 'lucide-react';

// -- Component Imports --
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { ImageFrameSection } from './ImageFrameSection';
import { ImageEffectsSection } from './ImageEffectsSection';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { ImageBoardContent } from '@/lib/types/board';

/*
 * The "Image style" popover: the shape/mask entry, the frame + border controls, and the effects (shadow /
 * opacity / filter / brightness). It anchors to the image BOX (a real inset overlay) so it opens to the
 * image's SIDE - not the toolbar button centered above it - keeping the image visible while styling. It is
 * CONTROLLED by the toolbar toggle (in ImageItem): the toggle sits outside the popover, so an interact-
 * outside on it is ignored (else Radix would close and the toggle's click reopen). The Frame section drops
 * when the image is masked. The commit-on-close slider discipline lives in the sections (this popover
 * closing unmounts them, flushing any buffered slider edit).
 */
export function ImageStylePopover({
   open,
   onOpenChange,
   toggleRef,
   content,
   onChange,
   onPreview,
   isMasked,
   onOpenMask,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   /** The toolbar toggle button; an interact-outside on it is ignored so its own click cleanly toggles. */
   toggleRef: RefObject<HTMLButtonElement | null>;
   content: ImageBoardContent;
   onChange: (content: ImageBoardContent) => void;
   /** Live (non-committing) content while a slider drags, so the picture updates without an undo write. */
   onPreview: (content: ImageBoardContent) => void;
   isMasked: boolean;
   onOpenMask: () => void;
}) {
   const { t } = useTranslation();

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
            className="w-72 p-2"
         >
            <div className="flex flex-col gap-3">
               <section className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{t('BoardView.imageShape')}</span>
                  <button
                     type="button"
                     onClick={onOpenMask}
                     className={cn(
                        'flex h-8 items-center justify-center gap-2 rounded px-2 text-xs text-foreground hover:bg-muted',
                        isMasked && 'bg-muted ring-1 ring-primary',
                     )}
                  >
                     <Shapes className="h-4 w-4" />
                     {t('BoardView.imageMask')}
                  </button>
               </section>

               {!isMasked && <ImageFrameSection content={content} onChange={onChange} onPreview={onPreview} />}
               <ImageEffectsSection content={content} onChange={onChange} onPreview={onPreview} />
            </div>
         </PopoverContent>
      </Popover>
   );
}
