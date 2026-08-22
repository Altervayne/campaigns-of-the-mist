// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Palette, Shapes } from 'lucide-react';

// -- Component Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ImageFrameSection } from './ImageFrameSection';
import { ImageEffectsSection } from './ImageEffectsSection';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { IMAGE_TOOLBAR_BUTTON_CLASS } from './imageToolbarButton';

// -- Type Imports --
import type { ImageBoardContent } from '@/lib/types/board';

/*
 * The "Image style" menu: one popover folding the shape/mask entry, the frame + border controls, and the
 * effects (shadow / opacity / filter / brightness) into clear sections. The Frame section is dropped when the
 * image is masked (a matte or straight outline around a shape reads wrong); the Mask entry and Effects always
 * show. The commit-on-close slider discipline lives in the section components, so closing this popover (which
 * unmounts them) flushes any buffered slider edit.
 */
export function ImageStylePopover({
   content,
   onChange,
   isMasked,
   onOpenMask,
}: {
   content: ImageBoardContent;
   onChange: (content: ImageBoardContent) => void;
   isMasked: boolean;
   onOpenMask: () => void;
}) {
   const { t } = useTranslation();

   const active = isMasked
      || !!content.frame
      || !!content.border
      || !!content.shadow
      || !!content.filter
      || (content.opacity !== undefined && content.opacity !== 1)
      || (content.brightness !== undefined && content.brightness !== 1);

   return (
      <Popover>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={t('BoardView.imageStyle')}
               aria-label={t('BoardView.imageStyle')}
               onPointerDown={(event) => event.stopPropagation()}
               className={cn(IMAGE_TOOLBAR_BUTTON_CLASS, active && 'ring-1 ring-primary')}
            >
               <Palette className="h-4 w-4" />
            </button>
         </PopoverTrigger>
         {/* Stop the pointer or the canvas background handler reads it as a click-away and drops the selection. */}
         <PopoverContent align="center" className="w-72 p-2" onPointerDown={(event) => event.stopPropagation()}>
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

               {!isMasked && <ImageFrameSection content={content} onChange={onChange} />}
               <ImageEffectsSection content={content} onChange={onChange} />
            </div>
         </PopoverContent>
      </Popover>
   );
}
