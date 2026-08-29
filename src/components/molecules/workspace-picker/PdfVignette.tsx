// -- React Imports --
import type { CSSProperties } from 'react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

/*
 * The PDF card's vignette: a stack of rulebook pages that fans open on hover, inside a dashed drop-outline
 * that brightens on hover or while a file is dragged over the card. The fan is pure 2D rotation (no
 * perspective, no 3D), so the pages can't moire or depth-fight the way a rotating leaf did. On hover the side
 * pages spread from the base while a highlighter mark sweeps across the top page. The pages are a FIXED light
 * paper tone with fixed ink lines (theme-stable illustration art); heading bars + highlight ride `--accent`.
 * Per-page rest/hover angles ride CSS vars so one static group-hover class drives every page.
 */

// Fixed art tones for the pages (theme-stable, on purpose).
const PAPER = '#f6f4ef';
const INK = 'rgb(30 30 40 / 0.12)';
const PAGE_BORDER = '1px solid rgb(30 30 40 / 0.14)';

/** A ruled text line; a highlighted line carries an accent marker that sweeps across as the fan settles. */
function TextLine({ width, highlighted }: { width: string; highlighted?: boolean }) {
   return (
      <span className="relative flex items-center" style={{ width }}>
         {highlighted && (
            <span
               className="absolute left-0 h-1.5 w-0 rounded-[1px] transition-[width] delay-[400ms] duration-500 ease-out group-hover:w-full motion-reduce:transition-none"
               style={{ backgroundColor: 'rgb(var(--accent) / 0.3)' }}
            />
         )}
         <span className="relative h-px w-full" style={{ backgroundColor: INK }} />
      </span>
   );
}

/**
 * One page in the fanned stack: `translate` sets a small fixed offset so the resting stack looks hand-placed,
 * and `rotate` animates from `--fr` to `--fh` about the bottom centre on hover; `delay` riffles them.
 */
function PageSheet({ rest, hover, tx, ty, delay, heading, widths, highlights = [] }: {
   rest: number;
   hover: number;
   tx: number;
   ty: number;
   delay: number;
   heading?: boolean;
   widths: string[];
   highlights?: number[];
}) {
   return (
      <div
         className={cn(
            'absolute inset-0 origin-bottom overflow-hidden rounded-md shadow-sm transition-transform duration-500 ease-out',
            '[rotate:var(--fr)] group-hover:[rotate:var(--fh)]',
            'motion-reduce:transition-none motion-reduce:group-hover:[rotate:var(--fr)]',
         )}
         style={{ '--fr': `${rest}deg`, '--fh': `${hover}deg`, translate: `${tx}px ${ty}px`, background: PAPER, border: PAGE_BORDER, transitionDelay: `${delay}ms` } as CSSProperties}
      >
         <div className="flex flex-col gap-1.5 p-3">
            {heading && <span className="mb-0.5 h-1.5 w-3/5 rounded-full" style={{ backgroundColor: 'rgb(var(--accent))' }} />}
            {widths.map((width, index) => (
               <TextLine key={index} width={width} highlighted={highlights.includes(index)} />
            ))}
         </div>
      </div>
   );
}

// Back-to-front: an irregular riffle - varied angles and offsets, not a mirror - with the top page (heading +
// highlight) barely tilted so it stays readable.
const SHEETS: { rest: number; hover: number; tx: number; ty: number; delay: number; heading?: boolean; widths: string[]; highlights?: number[] }[] = [
   { rest: 5, hover: 19, tx: 10, ty: 5, delay: 100, widths: ['86%', '92%', '78%', '88%', '74%'] },
   { rest: -3, hover: -12, tx: -7, ty: 6, delay: 65, widths: ['84%', '90%', '76%', '86%', '80%'] },
   { rest: 3, hover: 10, tx: 5, ty: 2, delay: 35, widths: ['90%', '80%', '88%', '72%', '84%'] },
   { rest: -1, hover: -5, tx: 0, ty: 0, delay: 0, heading: true, widths: ['92%', '84%', '90%', '78%', '86%'], highlights: [1, 3] },
];

interface PdfVignetteProps {
   /** True while a file is dragged over the card, so the drop-outline stays bright. */
   isDragActive?: boolean;
}

export function PdfVignette({ isDragActive }: PdfVignetteProps) {
   return (
      <div className="relative h-full w-full">
         {/* The fanning stack: nudged down so the drop area shows above it, and bled well past the bottom so
             the pages read tall and the fan never exposes their loose bottom ends. */}
         <div className="absolute inset-x-8 top-7 -bottom-12">
            {SHEETS.map((sheet, index) => (
               <PageSheet key={index} {...sheet} />
            ))}
         </div>

         {/* Dashed drop-outline over the stack: dim at rest, bright on hover or active drag. */}
         <span
            className={cn(
               'pointer-events-none absolute inset-4 rounded-lg border border-dashed transition-opacity duration-300',
               isDragActive ? 'opacity-90' : 'opacity-35 group-hover:opacity-75',
            )}
            style={{ borderColor: 'rgb(var(--accent))' }}
         />
      </div>
   );
}
