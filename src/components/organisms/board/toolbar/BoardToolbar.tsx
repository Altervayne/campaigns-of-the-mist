// -- React Imports --
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { AnimatePresence, motion } from 'framer-motion';

// -- Icon Imports --
import { ChevronLeft, ChevronRight, Crosshair, Layers, Maximize, MousePointer2, PenTool } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { BoardToolSettingsBar } from '../BoardToolSettingsBar';
import { BoardAddMenu } from '../BoardAddMenu';
import { BoardSurfaceMenu } from '../BoardSurfaceMenu';
import { BoardCoordinateField } from '../fields/BoardCoordinateField';
import { ToolbarButton } from './ToolbarButton';
import { ToolToggleButton } from './ToolToggleButton';

// -- Type Imports --
import type { BoardState } from '@/lib/stores/boardStore';
import type { ActiveTool, BoardBackground, BoardGrid, BrushKind, Viewport } from '@/lib/types/board';
import type { Point } from '@/lib/board/boardConnections';
import type { CreatableKind } from '@/lib/creation/creatableRegistry';
import type { TrackerType } from '@/lib/trackers/emptyTracker';
import type { GameSystem } from '@/lib/types/drawer';
import type { ChallengeGame } from '@/lib/types/common';

/**
 * The top-bar scroll arrow: a frosted square overlaid on a scroll edge so the bar's contents slide
 * underneath it. Centered vertically via `my-auto` (not a transform) so framer-motion owns `x` for
 * the slide-in/out; the side (`left-0.5`/`right-0.5`) is appended per arrow.
 */
const BAR_ARROW_CLASS =
   'absolute top-0 bottom-0 z-10 my-auto flex size-6 items-center justify-center rounded border border-border bg-popover/95 text-popover-foreground shadow-md backdrop-blur-sm hover:bg-muted cursor-pointer';

/** Screen-px the bottom-center tool bar keeps from the canvas floor. */
const BAR_EDGE_GAP = 12;

interface BoardToolbarProps {
   activeTool: ActiveTool;
   setActiveTool: Dispatch<SetStateAction<ActiveTool>>;
   chooseDrawTool: (tool: Exclude<ActiveTool, 'select'>) => void;
   lastDrawToolRef: RefObject<Exclude<ActiveTool, 'select'>>;
   handleAddItem: (kind: CreatableKind) => void;
   openPortalPickerAtViewCenter: () => void;
   createTrackerAt: (trackerType: TrackerType, worldCenter: Point) => void;
   currentViewCenter: () => Point;
   handlePickCardGame: (game: GameSystem) => void;
   createChallengeAt: (game: ChallengeGame, worldCenter: Point) => void;
   penSettings: { brush: BrushKind; color: string | null; width: number; shapeBase: 'circle' | 'square'; shapeFilled: boolean };
   setPenBrush: (brush: BrushKind) => void;
   setPenColor: (color: string | null) => void;
   setPenWidth: (width: number) => void;
   setActiveLayerId: Dispatch<SetStateAction<string | null>>;
   newLayerArmed: boolean;
   polygonSides: number;
   setPolygonSides: Dispatch<SetStateAction<number>>;
   setShapeBase: (base: 'circle' | 'square') => void;
   setShapeFilled: (filled: boolean) => void;
   grid: BoardGrid;
   background: BoardBackground | undefined;
   actions: BoardState['actions'];
   toggleLayersPanel: () => void;
   layersPanelOpen: boolean;
   layersPanelWidth: number;
   handleFitToContent: () => void;
   originViewport: () => Viewport;
   viewport: Viewport;
   viewCenter: Point;
   jumpToViewCenter: (world: Point) => void;
   jumpXRef: RefObject<HTMLInputElement | null>;
   barScrollRef: RefObject<HTMLDivElement | null>;
   barContentRef: RefObject<HTMLDivElement | null>;
   barCanScrollLeft: boolean;
   barCanScrollRight: boolean;
   scrollBarBy: (direction: -1 | 1) => void;
}

/*
 * The bottom-center tool bar: the sticky mode segment (Elements / Drawing), the contextual section that
 * swaps by mode (element creation vs drawing settings), and the view controls + positioning cluster. It
 * grows to fit its contents and scrolls horizontally inside when they exceed the canvas.
 */
export function BoardToolbar({
   activeTool,
   setActiveTool,
   chooseDrawTool,
   lastDrawToolRef,
   handleAddItem,
   openPortalPickerAtViewCenter,
   createTrackerAt,
   currentViewCenter,
   handlePickCardGame,
   createChallengeAt,
   penSettings,
   setPenBrush,
   setPenColor,
   setPenWidth,
   setActiveLayerId,
   newLayerArmed,
   polygonSides,
   setPolygonSides,
   setShapeBase,
   setShapeFilled,
   grid,
   background,
   actions,
   toggleLayersPanel,
   layersPanelOpen,
   layersPanelWidth,
   handleFitToContent,
   originViewport,
   viewport,
   viewCenter,
   jumpToViewCenter,
   jumpXRef,
   barScrollRef,
   barContentRef,
   barCanScrollLeft,
   barCanScrollRight,
   scrollBarBy,
}: BoardToolbarProps) {
   const { t } = useTranslation();

   return (
      // Bottom-center tool bar: the mode segment, the contextual creation/drawing section, then the view
      // controls + positioning cluster. It grows to fit its contents and, when they exceed the canvas,
      // scrolls horizontally inside (capped at the canvas width minus its margins) - the wheel scrolls it,
      // the scrollbar is hidden, and edge arrows appear per side (like the tab strip). Stops the pointer so
      // editing a field or scrolling the bar never pans. Holds its floor spot (z-40, above the board content
      // but below the floating windows / radial); the app-wide dice tray (z-50) simply overlays it when open
      // rather than shoving it up. `overflow-x-clip` clips a slide-out arrow at the card edge.
      <div
         data-tutorial="board-toolbar"
         onPointerDown={(event) => event.stopPropagation()}
         style={{ bottom: BAR_EDGE_GAP, marginLeft: layersPanelOpen ? -(layersPanelWidth / 2) : 0 }}
         className={cn(
            'absolute left-1/2 z-40 flex w-fit -translate-x-1/2 items-center overflow-x-clip rounded-md border border-border bg-card/90 shadow-sm backdrop-blur-sm transition-[margin-left] duration-300 ease-out',
            // Slide the bar out from under the panel and cap its width to the free region so it never underlaps.
            layersPanelOpen ? 'max-w-[calc(100%-1.5rem-16rem)]' : 'max-w-[calc(100%-1.5rem)]',
         )}
      >
         <AnimatePresence>
            {barCanScrollLeft && (
               <motion.button
                  key="bar-scroll-left"
                  type="button"
                  onClick={() => scrollBarBy(-1)}
                  aria-label={t('BoardView.scrollLeft')}
                  title={t('BoardView.scrollLeft')}
                  className={cn(BAR_ARROW_CLASS, 'left-1.5')}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
               >
                  <ChevronLeft className="h-4 w-4" />
               </motion.button>
            )}
         </AnimatePresence>

         {/* The only scrollable element: capped to the card width (min-w-0) and scrolls; the wheel
             handler maps a vertical wheel to horizontal scroll, so the hidden scrollbar shows nothing. */}
         <div ref={barScrollRef} className="min-w-0 overflow-x-auto overscroll-x-contain scrollbar-hide">
            <div ref={barContentRef} className="flex w-max items-center gap-1.5 p-1.5">
               {/* Sticky mode segment (Elements / Drawing): labeled toggles with a stable icon per mode, so
                   the modes read as distinct from the icon-only clusters below. The Drawing glyph never
                   tracks the active gesture; the specific gesture lives in the settings bar. Drawing is
                   pressed for any drawing gesture and re-enters the last one - exit via Elements, Esc, or V. */}
               <div data-tutorial="board-mode-segment" className="flex shrink-0 items-center gap-0.5">
                  <ToolToggleButton active={activeTool === 'select'} title={t('BoardView.toolSelect')} label={t('BoardView.toolSelect')} onClick={() => setActiveTool('select')}>
                     <MousePointer2 className="h-4 w-4" />
                  </ToolToggleButton>
                  <ToolToggleButton active={activeTool !== 'select'} title={t('BoardView.toolDraw')} label={t('BoardView.toolDraw')} onClick={() => chooseDrawTool(lastDrawToolRef.current)}>
                     <PenTool className="h-4 w-4" />
                  </ToolToggleButton>
               </div>
               {/* The contextual second section swaps by mode: Select shows the element-creation cluster;
                   Draw shows the drawing-tool settings (gesture axis / brush / size / ink / new layer). The
                   mode segment above and the view controls below stay visible in both modes. */}
               {activeTool === 'select' ? (
                  <>
                     <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
                     <BoardAddMenu
                        onAddItem={handleAddItem}
                        onOpenPortalPicker={openPortalPickerAtViewCenter}
                        onAddTracker={(trackerType) => createTrackerAt(trackerType, currentViewCenter())}
                        onPickCardGame={handlePickCardGame}
                        onAddChallenge={(game) => createChallengeAt(game, currentViewCenter())}
                     />
                  </>
               ) : (
                  <BoardToolSettingsBar
                     tool={activeTool}
                     onSetTool={chooseDrawTool}
                     penSettings={penSettings}
                     onSetBrush={setPenBrush}
                     onSetColor={setPenColor}
                     onSetWidth={setPenWidth}
                     onNewLayer={() => setActiveLayerId(null)}
                     newLayerArmed={newLayerArmed}
                     sides={polygonSides}
                     onSetSides={setPolygonSides}
                     shapeBase={penSettings.shapeBase}
                     onSetShapeBase={setShapeBase}
                     shapeFilled={penSettings.shapeFilled}
                     onSetShapeFilled={setShapeFilled}
                  />
               )}
               <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
               <BoardSurfaceMenu
                  grid={grid}
                  background={background}
                  onSetGrid={(next) => void actions.setGrid(next)}
                  onSetBackground={(next) => void actions.setBackground(next)}
                  onPreviewGrid={(next) => actions.previewGrid(next)}
                  onPreviewBackground={(next) => actions.previewBackground(next)}
               />
               <ToolbarButton title={t('LayersPanel.toggle')} active={layersPanelOpen} onClick={toggleLayersPanel} dataTutorial="board-layers-toggle">
                  <Layers className="h-4 w-4" />
               </ToolbarButton>
               <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
               {/* Positioning cluster: the recenter button, the center on contents button, the live zoom %, then the world point
               the view is CENTERED on as two editable fields - typing + Enter recenters on that point (keeping zoom). */}
               <ToolbarButton title={t('BoardView.fitToContent')} onClick={handleFitToContent}>
                  <Maximize className="h-4 w-4" />
               </ToolbarButton>
               <ToolbarButton title={t('BoardView.returnToOrigin')} onClick={() => actions.setViewport(originViewport())}>
                  <Crosshair className="h-4 w-4" />
               </ToolbarButton>
               <div className="flex shrink-0 items-center gap-1.5 px-0.5">
                  <span className="text-xs tabular-nums text-muted-foreground mr-2 ml-1">{Math.round(viewport.zoom * 100)}%</span>
                  {/* Separates the read-only zoom from the editable view-center fields, so the % never reads as an input. */}
                  <BoardCoordinateField ref={jumpXRef} prefix="x:" label={t('BoardView.coordinateX')} value={Math.round(viewCenter.x)} onCommit={(x) => jumpToViewCenter({ x, y: Math.round(viewCenter.y) })} />
                  <BoardCoordinateField prefix="y:" label={t('BoardView.coordinateY')} value={Math.round(viewCenter.y)} onCommit={(y) => jumpToViewCenter({ x: Math.round(viewCenter.x), y })} />
               </div>
            </div>
         </div>

         <AnimatePresence>
            {barCanScrollRight && (
               <motion.button
                  key="bar-scroll-right"
                  type="button"
                  onClick={() => scrollBarBy(1)}
                  aria-label={t('BoardView.scrollRight')}
                  title={t('BoardView.scrollRight')}
                  className={cn(BAR_ARROW_CLASS, 'right-1.5')}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
               >
                  <ChevronRight className="h-4 w-4" />
               </motion.button>
            )}
         </AnimatePresence>
      </div>
   );
}
