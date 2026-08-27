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
 */

const COVER_FADE = 'linear-gradient(to bottom, #000 70%, transparent)';

export function FitToBox({ children, className, fit = 'contain' }: { children: ReactNode; className?: string; fit?: 'contain' | 'cover' }) {
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
            setScale(cover ? boxWidth / contentWidth : Math.min(boxWidth / contentWidth, boxHeight / contentHeight));
         }
      };
      const observer = new ResizeObserver(measure);
      observer.observe(box);
      observer.observe(content);
      return () => observer.disconnect();
   }, [cover]);

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
      </div>
   );
}
