// -- i18n Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { LayoutGrid } from 'lucide-react';

// -- Lib Imports --
import { gridSpacing } from '@/lib/board/boardCoordinates';
import { gridBackground } from '@/lib/board/gridStyle';
import { hexTile } from '@/lib/board/hexGrid';

// -- Type Imports --
import type { BoardGrid, Viewport } from '@/lib/types/board';

/**
 * Screen-space background behind the world layer: the CSS grid, the hex hive's SVG pattern, and the
 * empty-board cue. All three are inert and never track the world transform - they follow pan/zoom via
 * the adaptive spacing and the pattern/background offsets, not by living in the transformed layer.
 * `hexPatternId` is minted once per canvas by the parent so the SVG `fill="url(#...)"` reference and the
 * pattern def can never desync across boards.
 */
export function BoardGridLayer({ grid, viewport, hexPatternId, itemCount }: { grid: BoardGrid; viewport: Viewport; hexPatternId: string; itemCount: number }) {
   const { t } = useTranslation();

   return (
      <>
         {/* Grid layer: a screen-space CSS background behind everything. Never interactive,
             so it can't eat a pan or a click. The subtle text color feeds `currentColor`. */}
         <div className="pointer-events-none absolute inset-0 text-foreground/15" style={gridBackground(grid, gridSpacing(viewport.zoom), viewport)} />

         {/* Hex hive: the honeycomb has no CSS form, so it rides a screen-space SVG pattern instead. The
             tile size tracks zoom (via the adaptive spacing) and the pattern transform tracks pan, so it
             moves exactly like the CSS grids; the 1px stroke stays constant on screen. */}
         {grid.type === 'hex' && (() => {
            const tile = hexTile(gridSpacing(viewport.zoom));
            // Full-strength ink + element opacity (not a translucent stroke): the tile double-draws shared
            // edges, and element opacity flattens the overlaps to one uniform weight.
            return (
               <svg className="pointer-events-none absolute inset-0 h-full w-full text-foreground opacity-[0.15]">
                  <defs>
                     <pattern
                        id={hexPatternId}
                        patternUnits="userSpaceOnUse"
                        width={tile.width}
                        height={tile.height}
                        patternTransform={`translate(${viewport.x} ${viewport.y})`}
                     >
                        <path d={tile.path} fill="none" stroke="currentColor" strokeWidth={1} />
                     </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill={`url(#${hexPatternId})`} />
               </svg>
            );
         })()}

         {/* Empty-board cue: a quiet, screen-centered hint so a blank canvas reads as "ready",
             not "broken". Screen-space (not the world layer), so it stays put under pan/zoom, and
             inert so it never eats a pan, a background click, or a drawer drop. Gone at one item. */}
         {itemCount === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
               <LayoutGrid className="h-10 w-10 opacity-50" />
               <p className="text-sm font-medium">{t('BoardView.emptyTitle')}</p>
               <p className="max-w-xs text-xs opacity-80">{t('BoardView.emptyHint')}</p>
            </div>
         )}
      </>
   );
}
