// -- Component Imports --
import { ImagePlaceholder } from './ImagePlaceholder';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { gridBackground } from '@/lib/board/gridStyle';

// -- Type Imports --
import type { BoardGrid, Viewport } from '@/lib/types/board';

/*
 * The board card's vignette: the real canvas dot-grid as the surface, with a pinned "image" card and a
 * post-it, wired pin-to-pin by an accent connection that draws in on hover. Reads as "pin a picture and a
 * note, then connect them" - what a board is for. The grid is the app's own `gridBackground`, so the little
 * window can't drift from a real surface; the dots stay a neutral theme token. The connection rides
 * `--accent`; the scene, post-it, and pins are fixed art tones (theme-stable).
 */

const DOTS: BoardGrid = { type: 'dots' };
const VIEWPORT: Viewport = { x: 4, y: 4, zoom: 1 };

// The board's pin: a glossy domed bead (its default red), the anchor a connection wires to. Fixed art tone.
function PinDot({ className }: { className?: string }) {
   return (
      <span
         className={cn('block rounded-full', className)}
         style={{
            background: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 45%), #ef4444',
            boxShadow: '0 1px 2px rgba(0,0,0,0.4), inset 0 -1px 2px rgba(0,0,0,0.25)',
         }}
         aria-hidden
      />
   );
}

export function BoardVignette() {
   return (
      <div className="relative h-full w-full">
         <div className="absolute inset-0 text-foreground/15" style={gridBackground(DOTS, 20, VIEWPORT)} />

         {/* Connection wired pin-to-pin, over the elements so it isn't occluded; drawn on hover. */}
         <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 z-[5] h-full w-full">
            <line
               x1="25"
               y1="38"
               x2="76"
               y2="39"
               strokeWidth="1.4"
               strokeLinecap="round"
               strokeDasharray={120}
               className="[stroke-dashoffset:120] transition-[stroke-dashoffset] delay-100 duration-[1000ms] ease-in-out group-hover:[stroke-dashoffset:0] motion-reduce:transition-none"
               style={{ stroke: 'rgb(var(--accent))', opacity: 0.9 }}
            />
         </svg>

         {/* Pinned image card: a framed scene. */}
         <div className="absolute left-[7%] top-[34%] w-[37%]">
            <div className="overflow-hidden rounded-md border border-white/70 shadow-md">
               <ImagePlaceholder className="aspect-[4/3] w-full" compact />
            </div>
         </div>

         {/* Post-it: a warm-yellow square, rotated, with faint text lines. Fixed art tone. */}
         <div className="absolute left-[62%] top-[35%] w-[28%] rotate-3">
            <div className="flex aspect-square flex-col justify-center gap-1.5 rounded-sm p-3 shadow-md" style={{ backgroundColor: '#f4e08a' }}>
               <span className="h-1 w-11/12 rounded-full" style={{ backgroundColor: 'rgb(60 50 20 / 0.35)' }} />
               <span className="h-1 w-3/4 rounded-full" style={{ backgroundColor: 'rgb(60 50 20 / 0.35)' }} />
               <span className="h-1 w-4/5 rounded-full" style={{ backgroundColor: 'rgb(60 50 20 / 0.35)' }} />
            </div>
         </div>

         {/* Pins set onto the elements near their top centre; the wire meets their centres. */}
         <PinDot className="absolute left-[25%] top-[38%] z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2" />
         <PinDot className="absolute left-[76%] top-[39%] z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2" />
      </div>
   );
}
