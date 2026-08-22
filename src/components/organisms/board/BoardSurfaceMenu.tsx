// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Check, Palette } from 'lucide-react';

// -- Component Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BoardSurfaceColorControl } from './BoardSurfaceColorControl';
import { GridSwatch } from './GridSwatch';
import { GRID_ROWS } from './gridRows';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { boardBackgroundStyle, withBackgroundColor, withBackgroundTexture } from '@/lib/board/boardBackgroundStyle';

// -- Type Imports --
import type { BoardBackground, BoardGrid, BoardTexture } from '@/lib/types/board';

/*
 * The "Board surface" popover, launched from the toolbar: the per-board backdrop (fill color + a texture)
 * and the grid (style rows + line color). The color swatches commit one change on close (see
 * BoardSurfaceColorControl); the texture tiles and grid rows are discrete picks. Both the texture tiles and
 * the grid swatches reuse the same CSS the canvas paints, so the menu can't drift from the board.
 */

/** The surface textures as tiles, in menu order (None is rendered first, separately). */
const TEXTURE_OPTIONS: BoardTexture[] = ['paper', 'linen'];

export function BoardSurfaceMenu({
   grid,
   background,
   onSetGrid,
   onSetBackground,
   onPreviewGrid,
   onPreviewBackground,
}: {
   grid: BoardGrid;
   background: BoardBackground | undefined;
   onSetGrid: (grid: BoardGrid) => void;
   onSetBackground: (background: BoardBackground | undefined) => void;
   /** Live preview of the grid (a color drag), not persisted. */
   onPreviewGrid: (grid: BoardGrid) => void;
   /** Live preview of the backdrop (a color drag), not persisted. */
   onPreviewBackground: (background: BoardBackground | undefined) => void;
}) {
   const { t } = useTranslation();
   const fill = background?.color;
   const texture = background?.texture;

   return (
      <Popover>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={t('BoardView.boardSurface')}
               aria-label={t('BoardView.boardSurface')}
               className="flex size-6 shrink-0 items-center justify-center rounded text-foreground hover:bg-muted cursor-pointer"
            >
               <Palette className="h-4 w-4" />
            </button>
         </PopoverTrigger>
         <PopoverContent side="top" align="start" sideOffset={8} className="w-64 p-2">
            <div className="flex flex-col gap-3">
               <section className="flex flex-col gap-1.5">
                  <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                     {t('BoardView.surfaceBackground')}
                     <BoardSurfaceColorControl
                        activeColor={fill}
                        swatchFill={fill}
                        title={t('BoardView.surfaceFillColor')}
                        removeLabel={t('BoardView.surfaceFillClear')}
                        onPreview={(color) => onPreviewBackground(withBackgroundColor(background, color))}
                        onCommit={(color) => onSetBackground(withBackgroundColor(background, color))}
                     />
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                     <TextureTile
                        label={t('Common.none')}
                        fill={fill}
                        selected={!texture}
                        onClick={() => onSetBackground(withBackgroundTexture(background, undefined))}
                     />
                     {TEXTURE_OPTIONS.map((option) => (
                        <TextureTile
                           key={option}
                           texture={option}
                           label={t(`BoardView.surfaceTexture_${option}`)}
                           fill={fill}
                           selected={texture === option}
                           onClick={() => onSetBackground(withBackgroundTexture(background, option))}
                        />
                     ))}
                  </div>
               </section>

               <div className="h-px w-full bg-border" />

               <section className="flex flex-col gap-1.5">
                  <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                     {t('BoardView.surfaceGrid')}
                     <BoardSurfaceColorControl
                        activeColor={grid.color}
                        swatchFill={grid.color}
                        title={t('BoardView.gridColor')}
                        removeLabel={t('BoardView.gridColorClear')}
                        onPreview={(color) => onPreviewGrid({ ...grid, color })}
                        onCommit={(color) => onSetGrid({ ...grid, color })}
                     />
                  </span>
                  <div className="flex flex-col gap-0.5">
                     {GRID_ROWS.map(({ type, labelKey }) => (
                        <button
                           key={type}
                           type="button"
                           onClick={() => onSetGrid({ ...grid, type })}
                           className={cn(
                              'flex items-center gap-2 rounded p-1 text-xs text-foreground hover:bg-muted cursor-pointer',
                              type === grid.type && 'bg-muted ring-1 ring-primary',
                           )}
                        >
                           <GridSwatch type={type} />
                           <span className="flex-1 text-left">{t(`BoardView.${labelKey}`)}</span>
                           {type === grid.type && <Check className="size-4 text-primary" />}
                        </button>
                     ))}
                  </div>
               </section>
            </div>
         </PopoverContent>
      </Popover>
   );
}

/**
 * A ~preview tile for a texture (or a bare fill for None), mirroring the canvas render: the current fill
 * color (or the theme surface when none) with the texture overlay, so Paper over a warm fill reads warm.
 */
function TextureTile({ texture, label, fill, selected, onClick }: {
   texture?: BoardTexture;
   label: string;
   fill: string | undefined;
   selected: boolean;
   onClick: () => void;
}) {
   const style = texture ? boardBackgroundStyle({ color: fill, texture }) : fill ? { backgroundColor: fill } : undefined;
   return (
      <button
         type="button"
         title={label}
         aria-label={label}
         onClick={onClick}
         className={cn('flex h-12 w-full cursor-pointer items-center justify-center rounded hover:bg-muted', selected && 'bg-muted ring-1 ring-primary')}
      >
         <span className="block h-9 w-full overflow-hidden rounded border border-border bg-background" style={style} />
      </button>
   );
}
