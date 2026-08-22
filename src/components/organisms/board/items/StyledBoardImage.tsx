// -- Utils Imports --
import { cn } from '@/lib/utils';
import { framePlateSpec, imageBoxShadowCss, imageDropShadowCss, imageFilterCss, IMAGE_TAPE_COLOR } from '@/lib/board/imageStyle';

// -- Type Imports --
import type { ImageBoardContent } from '@/lib/types/board';

/*
 * The styled image body: wraps the `<img>` in a container that carries the frame matte, border, and shadow,
 * with opacity + the color-filter chain on the picture itself. A masked (shaped) image drops the rectangular
 * dressing (frame/border, hidden upstream too) and takes its shadow as a shape-following `drop-shadow` on the
 * `<img>` instead of a container box-shadow. Pure presentation; every value derives from `content`.
 */
export function StyledBoardImage({ url, content, isMasked }: { url: string; content: ImageBoardContent; isMasked: boolean }) {
   const plate = isMasked ? null : framePlateSpec(content.frame);
   const isTape = !isMasked && content.frame === 'tape';

   // The color look + brightness ride the `<img>`; a masked shape adds its drop-shadow to the same chain so
   // the shadow tracks the alpha. An unmasked image takes its shadow as a container box-shadow instead.
   const colorFilter = imageFilterCss(content.filter, content.brightness);
   const imgFilter = isMasked
      ? [colorFilter, imageDropShadowCss(content.shadow)].filter(Boolean).join(' ') || undefined
      : colorFilter;
   const boxShadow = isMasked ? undefined : imageBoxShadowCss(content.shadow);

   const border = content.border;
   const objectFit = isMasked || content.fit === 'contain' ? 'object-contain' : 'object-cover';

   const img = (
      <img
         src={url}
         alt=""
         draggable={false}
         className={cn('h-full w-full', objectFit)}
         style={{ opacity: content.opacity, filter: imgFilter }}
      />
   );

   return (
      <div
         className="relative h-full w-full"
         style={{
            boxShadow,
            border: border ? `${border.width}px solid ${border.color}` : undefined,
            borderRadius: border?.radius,
         }}
      >
         {plate ? (
            <div className="h-full w-full" style={{ padding: plate.padding, background: plate.background, borderRadius: plate.radius }}>
               <div className="relative h-full w-full overflow-hidden">{img}</div>
            </div>
         ) : (
            img
         )}

         {isTape && (
            // Two masking-tape strips pinning the top corners to the corkboard, each straddling the top edge
            // (a good part overhangs onto the board) and angled toward the middle. Needs the box to be
            // overflow-visible, which the framed-image branch sets.
            <>
               <span
                  aria-hidden
                  className="pointer-events-none absolute -top-4 left-2 h-8 w-16 -rotate-12"
                  style={{ background: IMAGE_TAPE_COLOR }}
               />
               <span
                  aria-hidden
                  className="pointer-events-none absolute -top-4 right-2 h-8 w-16 rotate-12"
                  style={{ background: IMAGE_TAPE_COLOR }}
               />
            </>
         )}
      </div>
   );
}
