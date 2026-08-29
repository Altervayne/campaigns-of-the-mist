// -- Component Imports --
import { ImagePlaceholder } from './ImagePlaceholder';

/*
 * The note card's vignette: a tall page running flush off the bottom edge, on the app's own `--paper-*`
 * tokens so it matches a real note surface. Layout flaunts note capabilities top to bottom - a heading over a
 * byline, a cover image floated LEFT with body text wrapping to its right (as a real note lays out an inline
 * image), then the body continues full-width where the current line writes itself on hover (a blinking caret
 * chasing the end). Paper stays on theme tokens; the cover slot is fixed illustration art (theme-stable).
 */

/** Short lines that sit beside the floated cover. */
const BESIDE_LINES = ['94%', '82%', '90%', '76%', '84%'];
/** Full-width lines continuing under the cover, trailing the writing line. */
const BELOW_LINES = ['88%', '70%'];

export function NoteVignette() {
   return (
      <div className="relative h-full w-full">
         <div className="absolute inset-x-5 bottom-0 top-4 overflow-hidden rounded-t-md border border-paper-border/30 bg-paper-background shadow-sm">
            <div className="flex flex-col gap-3 p-4">
               {/* Static heading over a fainter byline. */}
               <div className="flex flex-col gap-1.5">
                  <span className="h-2 w-[56%] rounded-full bg-paper-foreground/70" />
                  <span className="h-1 w-[34%] rounded-full bg-paper-foreground/30" />
               </div>

               {/* Cover floated left, text wrapping to its right. */}
               <div className="flex gap-2.5">
                  <div className="h-14 w-[42%] shrink-0 self-start overflow-hidden rounded-sm border border-paper-border/25">
                     <ImagePlaceholder className="h-full w-full" compact />
                  </div>
                  <div className="flex flex-1 flex-col justify-center gap-2.5 pt-0.5">
                     {BESIDE_LINES.map((width, index) => (
                        <span key={index} className="h-px bg-paper-foreground/15" style={{ width }} />
                     ))}
                  </div>
               </div>

               {/* Body continues full-width under the cover; the current line writes itself on hover. */}
               <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1">
                     <span className="h-px w-0 bg-paper-foreground/45 transition-[width] duration-700 ease-out group-hover:w-[94%] motion-reduce:transition-none" />
                     <span className="cotm-ws-caret h-3 w-px bg-paper-foreground/70 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  {BELOW_LINES.map((width, index) => (
                     <span key={index} className="h-px bg-paper-foreground/15" style={{ width }} />
                  ))}
               </div>
            </div>
         </div>
      </div>
   );
}
