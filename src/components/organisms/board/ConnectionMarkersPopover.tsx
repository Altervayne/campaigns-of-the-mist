// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { ArrowLeftRight } from 'lucide-react';

// -- Component Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { CONNECTION_TRIGGER_CLASS } from './connectionToolbarButton';
import { DEFAULT_MARKER_DIRECTION, setConnectionMarker } from '@/lib/board/boardConnections';

// -- Type Imports --
import type { ConnectionMarker, ConnectionMarkerPosition, ConnectionMarkers } from '@/lib/types/board';

/** Marker type presets per row, in order (`null` = no marker). */
const TYPE_PRESETS: (ConnectionMarker['type'] | null)[] = [null, 'full', 'chevron'];
/** The columns, left to right = the connection read start -> middle -> end, so the layout is spatial. */
const COLUMNS: { pos: ConnectionMarkerPosition; labelKey: string }[] = [
   { pos: 'start', labelKey: 'BoardView.connectionMarkerStart' },
   { pos: 'middle', labelKey: 'BoardView.connectionMarkerMiddle' },
   { pos: 'end', labelKey: 'BoardView.connectionMarkerEnd' },
];

/*
 * The Markers group in the connection toolbar: a trigger summarising which positions carry a marker,
 * opening a popover with a Start / Middle / End row. Each row toggles none / full / chevron and flips
 * direction; editing one position preserves the others. Each change commits one style update.
 */
export function ConnectionMarkersPopover({ markers, onChange }: { markers: ConnectionMarkers | undefined; onChange: (markers: ConnectionMarkers | undefined) => void }) {
   const { t } = useTranslation();
   const hasAny = Boolean(markers?.start || markers?.middle || markers?.end);

   const setMarker = (pos: ConnectionMarkerPosition, marker: ConnectionMarker | undefined) => onChange(setConnectionMarker(markers, pos, marker));

   return (
      <Popover>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={t('BoardView.connectionMarkers')}
               aria-label={t('BoardView.connectionMarkers')}
               onPointerDown={(event) => event.stopPropagation()}
               className={cn(CONNECTION_TRIGGER_CLASS, hasAny && 'ring-1 ring-primary')}
            >
               <MarkersPreview markers={markers} />
            </button>
         </PopoverTrigger>
         {/* Stop the pointer or the canvas background handler reads it as a click-away and drops the selection.
             Columns left -> right mirror the connection's start / middle / end, so a marker's spot on the line
             maps straight to its spot in the picker. */}
         <PopoverContent align="center" className="w-auto p-1.5" onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-2">
               {COLUMNS.map(({ pos, labelKey }) => {
                  const marker = markers?.[pos];
                  return (
                     <div key={pos} className="flex flex-col items-center gap-1">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t(labelKey)}</span>
                        {TYPE_PRESETS.map((type) => {
                           const active = (marker?.type ?? null) === type;
                           return (
                              <button
                                 key={type ?? 'none'}
                                 type="button"
                                 aria-label={t(`BoardView.arrow${type === null ? 'None' : type === 'full' ? 'Full' : 'Chevron'}`)}
                                 onClick={() => setMarker(pos, type === null ? undefined : { type, direction: marker?.direction ?? DEFAULT_MARKER_DIRECTION[pos] })}
                                 className={cn(
                                    'flex h-7 w-9 cursor-pointer items-center justify-center rounded text-foreground hover:bg-muted',
                                    active && 'bg-muted ring-1 ring-primary',
                                 )}
                              >
                                 <ArrowPreview type={type} />
                              </button>
                           );
                        })}
                        <button
                           type="button"
                           aria-label={t('BoardView.arrowFlip')}
                           title={t('BoardView.arrowFlip')}
                           disabled={!marker}
                           onClick={() => marker && setMarker(pos, { ...marker, direction: marker.direction === 'forward' ? 'backward' : 'forward' })}
                           className={cn(
                              'flex h-7 w-9 cursor-pointer items-center justify-center rounded text-foreground hover:bg-muted',
                              'disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent',
                           )}
                        >
                           <ArrowLeftRight className="h-3.5 w-3.5" />
                        </button>
                     </div>
                  );
               })}
            </div>
         </PopoverContent>
      </Popover>
   );
}

/** A tiny preview of a marker choice, for the row buttons (uses the button's color). */
function ArrowPreview({ type }: { type: ConnectionMarker['type'] | null }) {
   return (
      <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden>
         <line x1="1" y1="5" x2="17" y2="5" stroke="currentColor" strokeWidth="1.5" />
         {type === 'full' && <polygon points="6,1 13,5 6,9" fill="currentColor" />}
         {type === 'chevron' && <polyline points="6,1 13,5 6,9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
   );
}

/**
 * The trigger summary: a line carrying each position's marker in its real style (full triangle / open
 * chevron) and direction (tip along forward -> toward the end, backward -> toward the start).
 */
function MarkersPreview({ markers }: { markers: ConnectionMarkers | undefined }) {
   const spots: { x: number; pos: ConnectionMarkerPosition }[] = [
      { x: 7, pos: 'start' },
      { x: 22, pos: 'middle' },
      { x: 37, pos: 'end' },
   ];
   return (
      <svg width="44" height="12" viewBox="0 0 44 12" aria-hidden>
         <line x1="2" y1="6" x2="42" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
         {spots.map(({ x, pos }) => {
            const marker = markers?.[pos];
            if (!marker) return null;
            const dir = marker.direction === 'backward' ? -1 : 1;
            const s = 3.5;
            const points = `${x - s * dir},${6 - s} ${x + s * dir},6 ${x - s * dir},${6 + s}`;
            return marker.type === 'full'
               ? <polygon key={pos} points={points} fill="currentColor" />
               : <polyline key={pos} points={points} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
         })}
      </svg>
   );
}
