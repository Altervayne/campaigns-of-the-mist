// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { dashArrayFor } from '@/lib/board/boardConnections';
import { CONNECTION_TRIGGER_CLASS } from './connectionToolbarButton';

// -- Type Imports --
import type { ConnectionDash, ConnectionStyle } from '@/lib/types/board';

/** Line-width presets (world units), thin -> thick. */
const WIDTH_PRESETS = [1, 2, 3, 5, 8];
/** Line dash-style presets, in row order. */
const DASH_PRESETS: ConnectionDash[] = ['solid', 'dashed', 'dotted'];

/*
 * The Stroke group in the connection toolbar: a trigger previewing the current width + dash, opening a
 * popover with a width row and a dash row. A pick commits `width` or `dash` as one style update.
 */
export function ConnectionStrokePopover({ style, onChange }: { style: ConnectionStyle; onChange: (style: ConnectionStyle) => void }) {
   const { t } = useTranslation();
   const dash = style.dash ?? 'solid';
   return (
      <Popover>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={t('BoardView.lineStyle')}
               aria-label={t('BoardView.lineStyle')}
               onPointerDown={(event) => event.stopPropagation()}
               className={CONNECTION_TRIGGER_CLASS}
            >
               <StrokePreview width={style.width} dash={dash} />
            </button>
         </PopoverTrigger>
         {/* Stop the pointer or the canvas background handler reads it as a click-away and drops the selection. */}
         <PopoverContent align="center" className="w-auto p-1" onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex flex-col gap-1">
               <div className="flex items-center gap-1" title={t('BoardView.lineWidth')}>
                  {WIDTH_PRESETS.map((width) => (
                     <button
                        key={width}
                        type="button"
                        aria-label={`${t('BoardView.lineWidth')} ${width}`}
                        onClick={() => onChange({ ...style, width })}
                        className={cn(
                           'flex h-6 w-6 cursor-pointer items-center justify-center rounded hover:bg-muted',
                           style.width === width && 'bg-muted ring-1 ring-primary',
                        )}
                     >
                        <span className="rounded-full bg-foreground" style={{ width: width + 2, height: width + 2 }} />
                     </button>
                  ))}
               </div>
               <div className="flex items-center gap-1" title={t('BoardView.lineStyle')}>
                  {DASH_PRESETS.map((preset) => (
                     <button
                        key={preset}
                        type="button"
                        aria-label={t(`BoardView.lineStyle${preset[0].toUpperCase()}${preset.slice(1)}`)}
                        onClick={() => onChange({ ...style, dash: preset })}
                        className={cn(
                           'flex h-6 w-6 cursor-pointer items-center justify-center rounded text-foreground hover:bg-muted',
                           dash === preset && 'bg-muted ring-1 ring-primary',
                        )}
                     >
                        <DashPreview dash={preset} />
                     </button>
                  ))}
               </div>
            </div>
         </PopoverContent>
      </Popover>
   );
}

/**
 * The trigger summary: a short line at the current width and dash. The dash pattern scales with the shown
 * width (the shared `dashArrayFor`), so a thick dashed/dotted line keeps visible gaps instead of its round
 * caps fusing it into a solid line.
 */
function StrokePreview({ width, dash }: { width: number; dash: ConnectionDash }) {
   const w = Math.min(width, 6);
   // A wide box so a thick dashed/dotted pattern shows several full segments; the line is inset so its
   // round caps stay inside the box instead of clipping at the edges.
   return (
      <svg width="48" height="12" viewBox="0 0 48 12" aria-hidden>
         <line x1="4" y1="6" x2="44" y2="6" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeDasharray={dashArrayFor(dash, w)} />
      </svg>
   );
}

/** A tiny horizontal line preview of a dash style, for the dash-row buttons (uses the button's color). */
function DashPreview({ dash }: { dash: ConnectionDash }) {
   const stroke = dash === 'dashed' ? { strokeDasharray: '4 3' } : dash === 'dotted' ? { strokeDasharray: '0.5 3', strokeLinecap: 'round' as const } : {};
   return (
      <svg width="16" height="6" viewBox="0 0 16 6" aria-hidden>
         <line x1="1" y1="3" x2="15" y2="3" stroke="currentColor" strokeWidth="2" {...stroke} />
      </svg>
   );
}
