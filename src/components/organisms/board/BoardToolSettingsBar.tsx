// -- React Imports --
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { BoxSelect, Brush, Check, ChevronDown, Circle, Eraser, Highlighter, LayersPlus, Minus, PaintBucket, Pen, Pencil, Pentagon, Plus, Shapes, Slash, Square, Waypoints, type LucideIcon } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { strokeColorToCss } from '@/lib/board/drawingStyle';
import { CONNECTION_PALETTE } from '@/lib/board/boardConnections';
import { pushRecentColor, readRecentColors } from '@/lib/recentColors';

// -- Component Imports --
import { ColorPickerPopover } from '@/components/molecules/color/ColorPickerPopover';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

// -- Type Imports --
import type { ActiveTool, BrushKind } from '@/lib/types/board';

/*
 * The contextual settings row for the active Draw gesture, sitting beside the mode segment in the board's
 * top-left bar (only in Draw mode). The tool selector leads (naming the active gesture, the eraser among
 * them); the brush set, size selector, ink swatch, and "new layer" reset follow for the drawing brushes,
 * and grey out uniformly for the eraser. All chrome is app theme tokens; the ink swatch is the one
 * sanctioned adaptive user-hex (null = the theme foreground).
 */

/** The drawing gestures, in toolbar order, each with its glyph. Shape gestures join as their tools ship. */
const GESTURE_OPTIONS: { tool: Exclude<ActiveTool, 'select'>; icon: LucideIcon; labelKey: string }[] = [
   { tool: 'freehand', icon: Pencil, labelKey: 'gestureFreehand' },
   { tool: 'line', icon: Slash, labelKey: 'gestureLine' },
   { tool: 'freeformPolygon', icon: Waypoints, labelKey: 'gestureFreeformPolygon' },
   { tool: 'regularPolygon', icon: Pentagon, labelKey: 'gestureRegularPolygon' },
   { tool: 'shape', icon: Shapes, labelKey: 'gestureShape' },
   { tool: 'transform', icon: BoxSelect, labelKey: 'gestureTransform' },
   { tool: 'eraser', icon: Eraser, labelKey: 'gestureEraser' },
];

/** The Shape tool's base shapes, each with its glyph; the drag constrains to these unless Shift frees it. */
const SHAPE_BASE_OPTIONS: { base: 'circle' | 'square'; icon: LucideIcon; labelKey: string }[] = [
   { base: 'circle', icon: Circle, labelKey: 'shapeBaseCircle' },
   { base: 'square', icon: Square, labelKey: 'shapeBaseSquare' },
];

/** The regular polygon's side-count bounds (inclusive). */
const MIN_POLYGON_SIDES = 3;
const MAX_POLYGON_SIDES = 12;

/** The brushes, in toolbar order, each with its glyph. */
const BRUSH_OPTIONS: { brush: BrushKind; icon: LucideIcon; labelKey: string }[] = [
   { brush: 'pen', icon: Pen, labelKey: 'brushPen' },
   { brush: 'brush', icon: Brush, labelKey: 'brushBrush' },
   { brush: 'highlighter', icon: Highlighter, labelKey: 'brushHighlighter' },
];

/** Width quick-picks (world px). Dots preview the size; the size is shared across every brush. */
const PEN_WIDTH_PRESETS = [2, 3, 5, 8, 12, 16];

/** The size slider's continuous bounds (world px); the presets stay fast shortcuts within it. */
const WIDTH_MIN = 1;
const WIDTH_MAX = 32;
/** Cap the trigger dot so a large width still fits the 24px button. */
const TRIGGER_DOT_MAX = 14;

interface BoardToolSettingsBarProps {
   tool: ActiveTool;
   onSetTool: (tool: Exclude<ActiveTool, 'select'>) => void;
   penSettings: { brush: BrushKind; color: string | null; width: number };
   onSetBrush: (brush: BrushKind) => void;
   onSetColor: (color: string | null) => void;
   onSetWidth: (width: number) => void;
   onNewLayer: () => void;
   /** Pressed state for the "new layer" button: a fresh layer is pending (the next stroke mints one). */
   newLayerArmed: boolean;
   /** The regular polygon's side count (3..12); shown as a stepper for that tool only. */
   sides: number;
   onSetSides: (sides: number) => void;
   /** The Shape tool's base shape; shown as toggles for that tool only. */
   shapeBase: 'circle' | 'square';
   onSetShapeBase: (base: 'circle' | 'square') => void;
   /** The shared interior-fill flag; its toggle shows for both polygon tools and the Shape tool. */
   shapeFilled: boolean;
   onSetShapeFilled: (filled: boolean) => void;
}

export function BoardToolSettingsBar({ tool, onSetTool, penSettings, onSetBrush, onSetColor, onSetWidth, onNewLayer, newLayerArmed, sides, onSetSides, shapeBase, onSetShapeBase, shapeFilled, onSetShapeFilled }: BoardToolSettingsBarProps) {
   const { t } = useTranslation();
   const activeWidth = penSettings.width;
   // The eraser and the transform tool append no ink, so the brush/size/ink cluster greys out - but it stays
   // IN PLACE (inert, not hidden) so switching tools never reflows the bar. The controls relight the instant a
   // drawing gesture is set. (The transform tool's own edit controls are a later phase.)
   const inkless = tool === 'eraser' || tool === 'transform';
   const inertCls = inkless ? 'pointer-events-none opacity-40' : undefined;

   return (
      <>
         <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />

         {/* Tool axis: the active drawing gesture, named on the bar. The eraser lives here too, a peer tool
             in the menu rather than a separate inline button. */}
         <ToolSelector tool={tool} onSetTool={onSetTool} />

         {/* Tool-specific options sit right beside the tool selector, each shown for its tool alone off a
             leading divider: the freeform polygon's fill, the regular polygon's side count + fill, the shape's
             base + fill. Fill is the shared `shapeFilled` setting, so the choice carries across the closed-shape
             tools. */}
         {tool === 'freeformPolygon' && (
            <>
               <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
               <FillToggle filled={shapeFilled} onToggle={() => onSetShapeFilled(!shapeFilled)} />
            </>
         )}
         {tool === 'regularPolygon' && (
            <>
               <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
               <div className="flex shrink-0 items-center gap-0.5" title={t('BoardView.polygonSides')}>
                  <button
                     type="button"
                     aria-label={`${t('BoardView.polygonSides')} -`}
                     disabled={sides <= MIN_POLYGON_SIDES}
                     onClick={() => onSetSides(Math.max(MIN_POLYGON_SIDES, sides - 1))}
                     className="flex size-6 shrink-0 items-center justify-center rounded text-foreground hover:bg-muted cursor-pointer disabled:pointer-events-none disabled:opacity-40"
                  >
                     <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-5 text-center text-sm tabular-nums text-foreground">{sides}</span>
                  <button
                     type="button"
                     aria-label={`${t('BoardView.polygonSides')} +`}
                     disabled={sides >= MAX_POLYGON_SIDES}
                     onClick={() => onSetSides(Math.min(MAX_POLYGON_SIDES, sides + 1))}
                     className="flex size-6 shrink-0 items-center justify-center rounded text-foreground hover:bg-muted cursor-pointer disabled:pointer-events-none disabled:opacity-40"
                  >
                     <Plus className="h-4 w-4" />
                  </button>
               </div>
               <FillToggle filled={shapeFilled} onToggle={() => onSetShapeFilled(!shapeFilled)} />
            </>
         )}
         {tool === 'shape' && (
            <>
               <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
               <div className="flex shrink-0 items-center gap-0.5">
                  {SHAPE_BASE_OPTIONS.map(({ base, icon: Icon, labelKey }) => (
                     <button
                        key={base}
                        type="button"
                        title={t(`BoardView.${labelKey}`)}
                        aria-label={t(`BoardView.${labelKey}`)}
                        aria-pressed={shapeBase === base}
                        onClick={() => onSetShapeBase(base)}
                        className={cn(
                           'flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted cursor-pointer',
                           shapeBase === base ? 'bg-muted text-foreground ring-1 ring-primary/40' : 'text-foreground',
                        )}
                     >
                        <Icon className="h-4 w-4" />
                     </button>
                  ))}
               </div>
               <FillToggle filled={shapeFilled} onToggle={() => onSetShapeFilled(!shapeFilled)} />
            </>
         )}

         <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />

         {/* Brush set - inert while erasing, kept in place so the bar holds its shape. */}
         <div className={cn('flex shrink-0 items-center gap-0.5', inertCls)} aria-disabled={inkless || undefined}>
            {BRUSH_OPTIONS.map(({ brush, icon: Icon, labelKey }) => (
               <button
                  key={brush}
                  type="button"
                  title={t(`BoardView.${labelKey}`)}
                  aria-label={t(`BoardView.${labelKey}`)}
                  aria-pressed={penSettings.brush === brush}
                  onClick={() => onSetBrush(brush)}
                  className={cn(
                     'flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted cursor-pointer',
                     penSettings.brush === brush ? 'bg-muted text-foreground ring-1 ring-primary/40' : 'text-foreground',
                  )}
               >
                  <Icon className="h-4 w-4" />
               </button>
            ))}
         </div>
         {/* Size slot: the width selector - inert while erasing (the eraser radius is a fixed constant, so
             nothing swaps in; the control just greys out like the rest). */}
         <div className={cn('flex shrink-0 items-center', inertCls)} aria-disabled={inkless || undefined}>
            <SizeSelector width={activeWidth} onSetWidth={onSetWidth} />
         </div>
         {/* Ink swatch - inert while erasing. Matches the sibling control groups' flex row so the trigger
            centers vertically instead of picking up an inline-block baseline gap. */}
         <div className={cn('flex shrink-0 items-center', inertCls)} aria-disabled={inkless || undefined}>
            <InkColorControl color={penSettings.color} onApply={onSetColor} />
         </div>
         {/* Starts the next stroke on a fresh layer - inert while erasing (the eraser doesn't append). Reads
             armed (pressed) while a fresh layer is pending, so "the next stroke mints one" is legible. */}
         <button
            type="button"
            title={t('BoardView.newDrawingLayer')}
            aria-label={t('BoardView.newDrawingLayer')}
            aria-pressed={newLayerArmed || undefined}
            aria-disabled={inkless || undefined}
            onClick={onNewLayer}
            className={cn(
               'flex size-6 shrink-0 items-center justify-center rounded text-foreground hover:bg-muted cursor-pointer',
               newLayerArmed && 'bg-muted ring-1 ring-primary/40',
               inertCls,
            )}
         >
            <LayersPlus className="h-4 w-4" />
         </button>
      </>
   );
}

/** The interior-fill toggle, shared by the closed-shape tools (both polygons + the bounding-box shapes). */
function FillToggle({ filled, onToggle }: { filled: boolean; onToggle: () => void }) {
   const { t } = useTranslation();
   return (
      <button
         type="button"
         title={t('BoardView.shapeFill')}
         aria-label={t('BoardView.shapeFill')}
         aria-pressed={filled}
         onClick={onToggle}
         className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted cursor-pointer',
            filled ? 'bg-muted text-foreground ring-1 ring-primary/40' : 'text-foreground',
         )}
      >
         <PaintBucket className="h-4 w-4" />
      </button>
   );
}

/**
 * The tool selector: a tokened dropdown that names the active drawing gesture on the bar. The trigger
 * carries the active gesture's glyph + label; the menu lists every gesture (the eraser included, as a peer
 * tool), the active row ringed + checked. Mirrors the grid selector's trigger+menu shape.
 */
function ToolSelector({ tool, onSetTool }: { tool: ActiveTool; onSetTool: (tool: Exclude<ActiveTool, 'select'>) => void }) {
   const { t } = useTranslation();
   const active = GESTURE_OPTIONS.find((option) => option.tool === tool) ?? GESTURE_OPTIONS[0];
   const ActiveIcon = active.icon;

   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <button
               type="button"
               data-tutorial="board-draw-tools"
               title={t('BoardView.drawTool')}
               className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-foreground hover:bg-muted cursor-pointer"
            >
               <ActiveIcon className="h-4 w-4 shrink-0" />
               <span className="text-sm leading-none">{t(`BoardView.${active.labelKey}`)}</span>
               <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
         </DropdownMenuTrigger>
         <DropdownMenuContent side="bottom" align="start">
            {GESTURE_OPTIONS.map(({ tool: gesture, icon: Icon, labelKey }) => (
               <DropdownMenuItem
                  key={gesture}
                  aria-current={tool === gesture || undefined}
                  onSelect={() => onSetTool(gesture)}
                  className={cn('gap-2', tool === gesture && 'ring-1 ring-primary')}
               >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1">{t(`BoardView.${labelKey}`)}</span>
                  {tool === gesture && <Check className="size-4 text-primary" />}
               </DropdownMenuItem>
            ))}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}

/**
 * The size selector: a tokened popover keeping the width-dot visual language. The trigger shows a dot
 * scaled to the current width (capped to the button); the popover pairs the preset dots (fast shortcuts)
 * with a slider over the continuous range, both feeding onSetWidth, and shows the current value.
 */
function SizeSelector({ width, onSetWidth }: { width: number; onSetWidth: (width: number) => void }) {
   const { t } = useTranslation();
   const triggerDot = Math.min(width + 2, TRIGGER_DOT_MAX);

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
                  <span className="rounded-full bg-foreground" style={{ width: triggerDot, height: triggerDot }} />
               </span>
               <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
         </PopoverTrigger>
         <PopoverContent side="bottom" align="start" className="w-56 p-3">
            <div className="flex items-center justify-between gap-2">
               <div className="flex items-center gap-1">
                  {PEN_WIDTH_PRESETS.map((preset) => (
                     <button
                        key={preset}
                        type="button"
                        aria-label={`${t('BoardView.strokeWidth')} ${preset}`}
                        onClick={() => onSetWidth(preset)}
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
                  <span className="rounded-full bg-foreground" style={{ width: Math.min(width, WIDTH_MAX) + 2, height: Math.min(width, WIDTH_MAX) + 2 }} />
               </span>
            </div>
            <input
               type="range"
               min={WIDTH_MIN}
               max={WIDTH_MAX}
               step={1}
               value={Math.min(width, WIDTH_MAX)}
               aria-label={t('BoardView.strokeWidth')}
               onChange={(event) => onSetWidth(Number(event.target.value))}
               className="mt-3 w-full cursor-pointer accent-primary"
            />
         </PopoverContent>
      </Popover>
   );
}

/**
 * The ink swatch + shared color popover for the pen's color. Mirrors the connection color control (shared
 * palette + recents, commit-on-close read from refs so any close path is correct), differing only in that
 * ink allows a null/adaptive reset via the popover's remove action - the swatch then paints the theme
 * foreground. A custom hex joins the shared recents; a curated swatch does not.
 */
function InkColorControl({ color, onApply }: { color: string | null; onApply: (color: string | null) => void }) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);
   // A local preview so the swatch reflects the pick before it commits on close (`undefined` = untouched).
   const [preview, setPreview] = useState<string | null | undefined>(undefined);

   // Read the commit from refs so it is correct from any close path (swatch / outside / Escape / unmount)
   // and unaffected by stale closures. `hasPending` distinguishes "no pick" from a null (adaptive) pick.
   const pendingRef = useRef<string | null>(null);
   const hasPendingRef = useRef(false);
   const colorRef = useRef(color);
   useEffect(() => { colorRef.current = color; });

   const commit = useCallback(() => {
      if (!hasPendingRef.current) return;
      const next = pendingRef.current;
      if (next !== colorRef.current) {
         onApply(next);
         // Only a custom hex (not a curated swatch) joins the shared recents.
         if (next && !(CONNECTION_PALETTE as readonly string[]).includes(next)) pushRecentColor(next);
      }
      hasPendingRef.current = false;
      pendingRef.current = null;
      setPreview(undefined);
   }, [onApply]);

   // Commit any pending pick if the control unmounts (the tool changes) before the popover's dismiss fires.
   const commitRef = useRef(commit);
   useEffect(() => { commitRef.current = commit; });
   useEffect(() => () => { commitRef.current(); }, []);

   const shown = preview !== undefined ? preview : color;
   return (
      <ColorPickerPopover
         open={open}
         onOpenChange={(next) => { if (!next) commit(); setOpen(next); }}
         activeColor={shown ?? undefined}
         palette={CONNECTION_PALETTE}
         recent={readRecentColors()}
         recentLabel={t('BoardView.recentColors')}
         removeLabel={t('BoardView.inkDefaultColor')}
         onApply={(picked) => { pendingRef.current = picked ?? null; hasPendingRef.current = true; setPreview(picked ?? null); }}
         trigger={
            <button
               type="button"
               title={t('BoardView.penColor')}
               aria-label={t('BoardView.penColor')}
               onPointerDown={(event) => event.stopPropagation()}
               className="size-6 cursor-pointer rounded border border-border"
               style={{ backgroundColor: strokeColorToCss(shown) }}
            />
         }
      />
   );
}
