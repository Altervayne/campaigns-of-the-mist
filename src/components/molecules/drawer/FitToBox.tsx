// -- React Imports --
import { useEffect, useRef, useState, type ReactNode } from 'react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

/*
 * Fits arbitrary content into a fixed box by measuring its intrinsic size and `transform: scale`-ing it.
 * The drawer's per-type previews have wildly different natural sizes (a tall theme card vs a wide board
 * mini-map); this is what makes every item card the SAME footprint - the previews themselves are reused
 * unchanged, only their containment is uniform. Keeps the existing ResizeObserver so the scale tracks
 * both the cell width and the content.
 *
 * `contain` (default) scales to fit inside the box, centered - a landscape preview reads as its own
 * canvas with a small margin. `cover` scales to fill the box WIDTH, top-anchored, and masks the clipped
 * bottom out to transparent so a portrait/square preview bleeds off the bottom edge, revealing the stage
 * behind. The fade is to transparent (no color token), so it can't break in a dark or custom theme.
 *
 * `cover` scale is capped at 1 by default: content never magnifies, only down-scales or renders 1:1.
 * Document previews author large (PREVIEW_PAGE) and shrink into a dense thumbnail. `allowUpscale` lifts the
 * cap so a small fixed-size card fills the stage width, its tall body cropping off the bottom; a bottom
 * scrim melts that crop into the `bg-card` stage so it reads as a soft fade-out, not a hard cut.
 */

const COVER_FADE = 'linear-gradient(to bottom, #000 70%, transparent)';

export function FitToBox({ children, className, fit = 'contain', allowUpscale = false }: { children: ReactNode; className?: string; fit?: 'contain' | 'cover'; allowUpscale?: boolean }) {
   const boxRef = useRef<HTMLDivElement>(null);
   const contentRef = useRef<HTMLDivElement>(null);
   const [scale, setScale] = useState(1);
   const cover = fit === 'cover';

   useEffect(() => {
      const box = boxRef.current;
      const content = contentRef.current;
      if (!box || !content) return;
      // The observer fires on observe(), so the first measure runs without a synchronous setState in
      // the effect body. Both the box (its width tracks the cell) and the content are watched.
      const measure = () => {
         const boxWidth = box.clientWidth;
         const boxHeight = box.clientHeight;
         const contentWidth = content.offsetWidth;
         const contentHeight = content.offsetHeight;
         if (boxWidth && boxHeight && contentWidth && contentHeight) {
            const coverScale = allowUpscale ? boxWidth / contentWidth : Math.min(boxWidth / contentWidth, 1);
            setScale(cover ? coverScale : Math.min(boxWidth / contentWidth, boxHeight / contentHeight));
         }
      };
      const observer = new ResizeObserver(measure);
      observer.observe(box);
      observer.observe(content);
      return () => observer.disconnect();
   }, [cover, allowUpscale]);

   return (
      <div ref={boxRef} className={cn('relative flex overflow-hidden', cover ? 'items-start justify-start' : 'items-center justify-center', className)}>
         <div
            ref={contentRef}
            className="shrink-0"
            style={{
               transform: `scale(${scale})`,
               transformOrigin: cover ? 'top left' : 'center',
               ...(cover ? { maskImage: COVER_FADE, WebkitMaskImage: COVER_FADE } : null),
            }}
         >
            {children}
         </div>
         {/* Fade-out scrim for an upscaled card cropping past the stage: the bottom melts into `bg-card`. */}
         {cover && allowUpscale && (
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-card via-card/50 to-transparent" />
         )}
      </div>
   );
}
