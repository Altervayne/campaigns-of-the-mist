// -- Utils Imports --
import { cn } from '@/lib/utils';

/*
 * The app's bespoke loader: the main menu's rolling fog, distilled into a loading indicator. Three
 * translucent wave layers drift in parallax behind a circle (or a pill, or the logo C itself), so a wait
 * feels like the mist it's named for rather than a generic spinner. Colour is `currentColor`, so it inherits
 * the surrounding text token - cream on dark chrome, dark ink on the white PDF page - with no per-site wiring.
 *
 * Variants: `disc` (the everyday inline/per-page loader, optional `comet` rim sweep), `bar` (a wide strip for
 * an import / first-load, pairs with a `tip`), `logo` (the C filled with living mist, for big moments).
 */

/** Builds a seamless wave path across a 0-200 viewBox: `segW` divides 200 evenly so [0,100] tiles onto
 *  [100,200] and a -50% scroll loops with no seam. Alternating cubic bulges read as soft rolling fog. */
function wave(baseline: number, amplitude: number, segW: number): string {
   let d = `M0,${baseline}`;
   for (let x = 0; x < 200; x += segW) {
      const mid = x + segW / 2;
      d += ` C${mid},${baseline - amplitude} ${mid},${baseline + amplitude} ${x + segW},${baseline}`;
   }
   return `${d} L200,100 L0,100 Z`;
}

/** Broad humps for a small circle. */
const DISC_WAVES = { b: wave(42, 12, 50), m: wave(56, 11, 50), f: wave(70, 9, 50) };
/** Denser humps so a wide bar shows rolling fog, not two giant swells. */
const BAR_WAVES = { b: wave(40, 13, 25), m: wave(55, 12, 25), f: wave(70, 10, 25) };

/** Per-layer drift speed (s) and direction; the front layer is fastest for parallax depth. */
const LAYERS = [
   { key: 'b' as const, dur: 6, reverse: false },
   { key: 'm' as const, dur: 4.3, reverse: true },
   { key: 'f' as const, dur: 3, reverse: false },
];

const RADIAL_RING_MASK = 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))';

/** The logo path, used as a mask so the fog shows only inside the C. */
const LOGO_PATH =
   'M332.35,240.7c-29.66-2.96-55.37-5.5-81.81,10.47-17.41,10.51-23.09,29.68-42.34,36.9-7.89,2.96-17.66,5.05-25.15,0l-.47,1.9c10.8,6.92,21.04,11.05,34.03,8.44,23.39-4.69,27.22-26.07,47.09-36.02,30.9-15.47,49.94,2.53,78.83.56,23.07-1.58,47.63-17.44,46.85-42.99-.36-11.95-9.14-25.64-22.31-18.47-9.92,5.41-13.96,14.8-2.86,21.77-31.55,7.1-38.21-25.51-24.18-47.84,21.45-34.15,72.6-34.73,89.4,4.38,21.49,50.03-10.04,113.36-62.32,127.05-17.26,4.53-30.88,2.26-47.86,3.34-35.77,2.28-57.54,28.69-98.25,21.99-112.3-18.47-104.13-226.58-8.98-260.66,31.94-11.44,75.67-3.83,93.44,27.4,4.1,7.19,7.98,23.03,11.95,27.68,5.28,6.2,15.65,1.81,16.8-6.34,1.15-8.16,1.33-41.81.04-50.11-.65-4.13-3.84-5.5-7.02-7.47-22.33-13.83-59.95-22.71-86.13-24.04-115.79-5.84-188.42,96.67-170.33,206.08,15.09,91.23,92.72,137.27,181.76,127.23,19.67-2.23,39.45-10.83,59.05-9.52,6.18.41,13.08,2.57,19.29,2.93,18.59,1.04,35.91-5.32,42.07-24.2-16.87,15.59-36.88-.63-55.53,0-11.64.4-23.16,5.87-33.07,11.39-.84.47-2.43,2.14-3.18.68,9.09-10.01,20.25-19.19,33.79-22.26,21.79-4.94,43.26,5.25,64.77-2.39.92,13.28,4.72,26.95,5.78,40.12.81,10.11,1.38,17.71-10.37,20.52-104.22,13.06-207.66,31.17-311.93,43.76-5.87.57-12.54-5.77-13.89-11.23-14.37-101.29-27.09-202.81-40.8-304.19C6.23,100.8.73,79.28.01,63.16c-.29-6.49,5.08-14.62,11.26-16.51C101.32,34.76,190.82,19.29,280.79,6.93c15.79-2.17,34.64-5.91,50.12-6.88,9.54-.59,16.83,3.95,19.56,13.26,3.97,37.04,7.44,74.16,13.31,110.94-14.59,23.73-46.35,30.31-53.38,60.17-5.91,25.15,4.37,39.94,21.95,56.25l-.02.04Z';
const LOGO_SVG = `<svg viewBox="0 0 436.25 433.04" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="${LOGO_PATH}"/></svg>`;
const LOGO_MASK = `url("data:image/svg+xml,${encodeURIComponent(LOGO_SVG)}")`;

type Waves = typeof DISC_WAVES;
type Opacities = { b: number; m: number; f: number };

/** The three drifting wave layers. `currentColor` fill, `data-mist-anim` so reduced motion can freeze them. */
function MistStack({ waves, opacity, blur }: { waves: Waves; opacity: Opacities; blur: number }) {
   return (
      <span className="absolute inset-0" style={{ filter: `blur(${blur}px)` }}>
         {LAYERS.map(({ key, dur, reverse }) => (
            <span
               key={key}
               data-mist-anim
               className="absolute bottom-0 left-0 h-full"
               style={{ width: '200%', opacity: opacity[key], animation: `cotm-mist-roll ${dur}s linear infinite ${reverse ? 'reverse' : ''}` }}
            >
               <svg viewBox="0 0 200 100" preserveAspectRatio="none" className="block h-full w-full" aria-hidden>
                  <path fill="currentColor" d={waves[key]} />
               </svg>
            </span>
         ))}
      </span>
   );
}

interface MistSpinnerProps {
   /** `disc` (default): inline/per-page circle. `bar`: wide strip. `logo`: the C filled with mist (big loads). */
   variant?: 'disc' | 'bar' | 'logo';
   /** Pixel size for `disc` / `logo` (the `bar` uses a fixed height). Default 24. */
   size?: number;
   /** `disc` only: a comet sweeping the rim, for a clearer "actively working" read. */
   comet?: boolean;
   /** Optional caption - below the disc / logo, beside the bar. */
   tip?: string;
   /** Accessible label announced to screen readers. */
   label?: string;
   className?: string;
}

export function MistSpinner({ variant = 'disc', size = 24, comet = false, tip, label = 'Loading', className }: MistSpinnerProps) {
   const isSmall = size <= 32;
   const blur = variant === 'logo' ? Math.min(1.4, size * 0.011) : isSmall ? 0.15 : Math.min(1.1, size * 0.012);
   const opacity: Opacities =
      variant === 'logo' ? { b: 0.28, m: 0.42, f: 0.6 } : isSmall ? { b: 0.22, m: 0.34, f: 0.5 } : { b: 0.15, m: 0.25, f: 0.37 };

   if (variant === 'bar') {
      return (
         <div role="status" aria-label={label} className={cn('inline-flex items-center gap-3', className)}>
            <div className="relative h-9 min-w-[220px] flex-1 overflow-hidden rounded-full">
               <span className="absolute inset-0" style={{ background: 'currentColor', opacity: 0.05 }} />
               <MistStack waves={BAR_WAVES} opacity={{ b: 0.15, m: 0.25, f: 0.37 }} blur={0.8} />
               <span className="absolute inset-0 rounded-full" style={{ boxShadow: 'inset 0 0 0 1.5px currentColor', opacity: 0.15 }} />
            </div>
            {tip ? <span className="text-sm text-muted-foreground">{tip}</span> : null}
         </div>
      );
   }

   if (variant === 'logo') {
      return (
         <div role="status" aria-label={label} className={cn('inline-flex flex-col items-center gap-3', className)}>
            <span className="relative block" style={{ width: size, height: size }}>
               <svg viewBox="0 0 436.25 433.04" className="absolute inset-0 h-full w-full" style={{ opacity: 0.16 }} aria-hidden>
                  <path fill="currentColor" d={LOGO_PATH} />
               </svg>
               <span
                  className="absolute inset-0"
                  style={{
                     WebkitMaskImage: LOGO_MASK,
                     maskImage: LOGO_MASK,
                     WebkitMaskSize: 'contain',
                     maskSize: 'contain',
                     WebkitMaskRepeat: 'no-repeat',
                     maskRepeat: 'no-repeat',
                     WebkitMaskPosition: 'center',
                     maskPosition: 'center',
                  }}
               >
                  <MistStack waves={DISC_WAVES} opacity={opacity} blur={blur} />
               </span>
            </span>
            {tip ? <span className="text-sm text-muted-foreground">{tip}</span> : null}
         </div>
      );
   }

   return (
      <div role="status" aria-label={label} className={cn('inline-flex flex-col items-center gap-2', className)}>
         <span className="relative block overflow-hidden rounded-full" style={{ width: size, height: size }}>
            <span className="absolute inset-0" style={{ background: 'currentColor', opacity: 0.05 }} />
            <MistStack waves={DISC_WAVES} opacity={opacity} blur={blur} />
            {comet ? (
               <span
                  data-mist-anim
                  className="absolute inset-0 rounded-full"
                  style={{
                     background: 'conic-gradient(from 0deg, transparent 30%, currentColor 100%)',
                     WebkitMaskImage: RADIAL_RING_MASK,
                     maskImage: RADIAL_RING_MASK,
                     opacity: 0.85,
                     animation: 'cotm-mist-spin 1.5s linear infinite',
                  }}
               />
            ) : null}
            <span className="absolute inset-0 rounded-full" style={{ boxShadow: 'inset 0 0 0 1.5px currentColor', opacity: 0.15 }} />
         </span>
         {tip ? <span className="text-sm text-muted-foreground">{tip}</span> : null}
      </div>
   );
}
