// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { ChevronDown, Minus } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

/** Width quick-picks (world px). Dots preview the size; the size is shared across every brush. */
const PEN_WIDTH_PRESETS = [2, 3, 5, 8, 12, 16];

/** The size slider's continuous bounds (world px); the presets stay fast shortcuts within it. */
export const WIDTH_MIN = 1;
export const WIDTH_MAX = 32;
/** Cap the trigger dot so a large width still fits the 24px button. */
const TRIGGER_DOT_MAX = 14;
/** The slider's default position when the width is indeterminate (a mixed selection), until the user drags. */
const MIXED_DEFAULT_WIDTH = 5;

/**
 * The size selector: a tokened popover keeping the width-dot visual language. The trigger shows a dot scaled
 * to the current width (capped to the button), or a dash when the width is indeterminate (a mixed selection);
 * the popover pairs the preset dots (fast shortcuts) with a slider over the continuous range. `onInput` fires
 * live while the slider drags (a caller can preview without committing); `onCommit` (default `onInput`) fires
 * on release and on a preset click, so a caller can split preview from the one committed write.
 */
export function StrokeWidthSelector({ width, onInput, onCommit }: { width: number | null; onInput: (width: number) => void; onCommit?: (width: number) => void }) {
   const { t } = useTranslation();
   const commit = onCommit ?? onInput;
   const effective = width ?? MIXED_DEFAULT_WIDTH;
   const triggerDot = Math.min(effective + 2, TRIGGER_DOT_MAX);

   return (
      <Popover>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={t('BoardView.strokeWidth')}
               aria-label={t('BoardView.strokeWidth')}
               className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-foreground hover:bg-muted cursor-pointer"
            >
               <span className="flex size-4 items-center justify-center">
                  {width === null
                     ? <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                     : <span className="rounded-full bg-foreground" style={{ width: triggerDot, height: triggerDot }} />}
               </span>
               <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
         </PopoverTrigger>
         <PopoverContent side="bottom" align="start" className="w-56 p-3" onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
               <div className="flex items-center gap-1">
                  {PEN_WIDTH_PRESETS.map((preset) => (
                     <button
                        key={preset}
                        type="button"
                        aria-label={`${t('BoardView.strokeWidth')} ${preset}`}
                        onClick={() => commit(preset)}
                        className={cn(
                           'flex size-6 items-center justify-center rounded hover:bg-muted cursor-pointer',
                           width === preset && 'bg-muted ring-1 ring-primary',
                        )}
                     >
                        <span className="rounded-full bg-foreground" style={{ width: preset + 2, height: preset + 2 }} />
                     </button>
                  ))}
               </div>
               {/* A live preview dot that grows with the width - a truer read of the stroke than a bare number. */}
               <span className="flex size-9 shrink-0 items-center justify-center">
                  <span className="rounded-full bg-foreground" style={{ width: Math.min(effective, WIDTH_MAX) + 2, height: Math.min(effective, WIDTH_MAX) + 2 }} />
               </span>
            </div>
            <input
               type="range"
               min={WIDTH_MIN}
               max={WIDTH_MAX}
               step={1}
               value={Math.min(effective, WIDTH_MAX)}
               aria-label={t('BoardView.strokeWidth')}
               onChange={(event) => onInput(Number(event.target.value))}
               onPointerUp={(event) => commit(Number((event.target as HTMLInputElement).value))}
               className="mt-3 w-full cursor-pointer accent-primary"
            />
         </PopoverContent>
      </Popover>
   );
}
