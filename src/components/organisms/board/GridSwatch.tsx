// -- React Imports --
import { useId } from 'react';

// -- Utils Imports --
import { gridBackground } from '@/lib/board/gridStyle';
import { hexTile } from '@/lib/board/hexGrid';

// -- Type Imports --
import type { BoardGridType } from '@/lib/types/board';

/*
 * The grid-style preview swatch, shared by every grid picker. It reuses the same background builder the
 * canvas grid does (and the same honeycomb geometry), so a menu can't drift from what the board paints.
 */

/** Fixed spacing for the preview swatches: small enough to read the pattern in a ~28px tile. */
const SWATCH_SPACING = 8;
const SWATCH_HEX_SIZE = 6;
const SWATCH_VIEWPORT = { x: 0, y: 0, zoom: 1 };

/** A ~28px preview of one grid style, mirroring the canvas render (CSS background, or the SVG hive). */
export function GridSwatch({ type }: { type: BoardGridType }) {
   const patternId = useId();
   const base = 'size-7 shrink-0 overflow-hidden rounded border border-border bg-background text-foreground/60';
   if (type === 'hex') {
      const tile = hexTile(SWATCH_HEX_SIZE);
      return (
         <span className={base} aria-hidden>
            <svg className="size-full">
               <defs>
                  <pattern id={patternId} patternUnits="userSpaceOnUse" width={tile.width} height={tile.height}>
                     <path d={tile.path} fill="none" stroke="currentColor" strokeWidth={1} />
                  </pattern>
               </defs>
               <rect width="100%" height="100%" fill={`url(#${patternId})`} />
            </svg>
         </span>
      );
   }
   return <span className={base} style={gridBackground({ type }, SWATCH_SPACING, SWATCH_VIEWPORT)} aria-hidden />;
}
