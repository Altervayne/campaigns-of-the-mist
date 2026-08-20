// -- React Imports --
import { type PointerEvent as ReactPointerEvent } from 'react';

// -- Utils Imports --
import { bezierControlPoints } from '@/lib/board/connectionPath';

// -- Type Imports --
import type { Point } from '@/lib/board/boardConnections';
import type { ConnectionControls } from '@/lib/types/board';

/*
 * The two draggable control handles + their tethers for the selected bezier connection, drawn in the
 * world SVG above the line. Each handle sits on the visible curve's control point (from the same
 * placement the curve uses), a hairline tether links it to its endpoint. Sizes counter-scale by 1/zoom
 * so they stay constant on screen at any zoom. Theme-token chrome only.
 */

/** Handle radius + tether/handle stroke, in screen px (counter-scaled by 1/zoom to a constant on screen). */
const HANDLE_RADIUS_SCREEN = 6;
const HANDLE_STROKE_SCREEN = 1.5;
const TETHER_STROKE_SCREEN = 1;

type Which = 'c1' | 'c2';

interface ConnectionControlHandlesProps {
   from: Point;
   to: Point;
   /** The effective offsets (live preview when dragging, else stored, else the auto placement). */
   controls?: ConnectionControls;
   zoom: number;
   c1Label: string;
   c2Label: string;
   onPointerDown: (which: Which, event: ReactPointerEvent) => void;
   onPointerMove: (event: ReactPointerEvent) => void;
   onPointerUp: (event: ReactPointerEvent) => void;
}

export function ConnectionControlHandles({ from, to, controls, zoom, c1Label, c2Label, onPointerDown, onPointerMove, onPointerUp }: ConnectionControlHandlesProps) {
   const { c1, c2 } = bezierControlPoints(from, to, controls);
   const radius = HANDLE_RADIUS_SCREEN / zoom;
   const handleStroke = HANDLE_STROKE_SCREEN / zoom;
   const tetherStroke = TETHER_STROKE_SCREEN / zoom;
   const dash = `${4 / zoom} ${3 / zoom}`;

   const handle = (which: Which, at: Point, endpoint: Point, label: string) => (
      <g>
         <line
            x1={endpoint.x} y1={endpoint.y} x2={at.x} y2={at.y}
            stroke="var(--muted-foreground)" strokeOpacity={0.6}
            strokeWidth={tetherStroke} strokeDasharray={dash}
         />
         <circle
            cx={at.x} cy={at.y} r={radius}
            fill="var(--primary)" stroke="var(--background)" strokeWidth={handleStroke}
            aria-label={label}
            style={{ pointerEvents: 'all', cursor: 'grab' }}
            onPointerDown={(event) => onPointerDown(which, event)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
         />
      </g>
   );

   return (
      <>
         {handle('c1', c1, from, c1Label)}
         {handle('c2', c2, to, c2Label)}
      </>
   );
}
