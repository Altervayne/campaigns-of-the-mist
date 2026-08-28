// -- React Imports --
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { ArrowDownToLine, ArrowUpToLine, Copy, FlipHorizontal, FlipVertical, Trash2 } from 'lucide-react';

// -- Utils Imports --
import { MIXED } from '@/lib/drawing/strokeStyle';

// -- Component Imports --
import { InkColorControl } from '@/components/molecules/board/draw/InkColorControl';
import { StrokeWidthSelector } from '@/components/molecules/board/draw/StrokeWidthSelector';
import { BrushToggleGroup } from '@/components/molecules/board/draw/BrushToggleGroup';
import { StrokeFillToggle } from '@/components/molecules/board/draw/StrokeFillToggle';

// -- Type Imports --
import type { StrokeStyleFold, StrokeStylePatch } from '@/lib/drawing/strokeStyle';
import type { StrokeStructureOp } from '@/lib/drawing/strokeStructure';

/*
 * The Transform tool's contextual STYLE toolbar: a frosted bar floating above the stroke selection's bounding
 * box (the group-toolbar pattern - 1/zoom counter-scale, edge-clamped), driving the selected strokes' style.
 * Recolor (with ink alpha), width, brush, and - when the selection holds a closed shape - fill, each shown as
 * an indeterminate state when the selection disagrees. Flip H / V mirror the selection (a geometry edit, so
 * they route to the transform commit). A structural cluster follows: reorder within the layer (to front / to
 * back), duplicate, and delete - reusing the item toolbar's glyphs. Color / width preview live and commit on
 * release (ONE undo step); a brush / fill / flip / structural click commits at once. Same frosted look +
 * counter-scale as `BoardGroupToolbar`, with the off-edge clamps the canvas measures.
 */

interface BoardStrokeStyleToolbarProps {
   zoom: number;
   /** The selection's folded style: one value per facet, or `MIXED` where its strokes disagree. */
   fold: StrokeStyleFold;
   /** Live style patch (no store write) while a color / width control is being dragged. */
   onPreviewStyle: (patch: StrokeStylePatch) => void;
   /** The one committed write for a style edit (color / width release, or a brush / fill click). */
   onCommitStyle: (patch: StrokeStylePatch) => void;
   /** Mirrors the selection about its box center (a geometry edit; one undo step). */
   onFlip: (axis: 'x' | 'y') => void;
   /** Runs a structural op on the selection: reorder within the layer, duplicate, or delete (one undo step). */
   onStructure: (op: StrokeStructureOp) => void;
   /** World-px to shift the bar vertically so it clears the clip's top edge; 0 = no clamp. */
   clampDown?: number;
   /** World-px to slide the bar sideways so it clears the clip's left/right edge; 0 = no clamp. */
   clampX?: number;
   /** Measurement mount point for the off-edge clamps; the canvas owns the arithmetic. */
   measureRef: (node: HTMLDivElement | null) => void;
}

export function BoardStrokeStyleToolbar({ zoom, fold, onPreviewStyle, onCommitStyle, onFlip, onStructure, clampDown = 0, clampX = 0, measureRef }: BoardStrokeStyleToolbarProps) {
   const { t } = useTranslation();

   // The width selector buffers its dragged value so the slider tracks live; null = untouched (the fold shows).
   const [widthDraft, setWidthDraft] = useState<number | null>(null);
   const widthValue = widthDraft ?? (fold.width === MIXED ? null : fold.width);

   // The bar anchors at the bbox's top edge (bottom:100%), lowered by the off-top clamp (world px).
   const bottom = clampDown ? `calc(100% - ${clampDown}px)` : '100%';
   const transform = clampX ? `translateX(${clampX}px) scale(${1 / zoom})` : `scale(${1 / zoom})`;

   return (
      <div ref={measureRef} className="pointer-events-auto absolute left-0" style={{ bottom, transformOrigin: '0 100%', transform }}>
         {/* The padding is the screen-constant gap above the selection (it scales with the bar). */}
         <div className="pb-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover/90 p-1 shadow-md backdrop-blur-sm">
               <InkColorControl
                  color={fold.color === MIXED ? null : fold.color}
                  mixed={fold.color === MIXED}
                  alpha
                  title={t('BoardView.strokeColor')}
                  removeLabel={t('BoardView.inkDefaultColor')}
                  onPreview={(color) => onPreviewStyle({ color })}
                  onApply={(color) => onCommitStyle({ color })}
               />

               <StrokeWidthSelector
                  width={widthValue}
                  onInput={(width) => { setWidthDraft(width); onPreviewStyle({ width }); }}
                  onCommit={(width) => { setWidthDraft(null); onCommitStyle({ width }); }}
               />

               <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />

               <BrushToggleGroup brush={fold.brush === MIXED ? null : fold.brush} onSelect={(brush) => onCommitStyle({ brush })} />

               {/* Fill applies to closed shapes only, so its toggle shows only when the selection holds one. */}
               {fold.hasClosedShape && (
                  <>
                     <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
                     <StrokeFillToggle
                        filled={fold.filled === true}
                        indeterminate={fold.filled === MIXED}
                        onToggle={() => onCommitStyle({ filled: fold.filled !== true })}
                     />
                  </>
               )}

               <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />

               <BarButton title={t('BoardView.flipHorizontal')} onClick={() => onFlip('x')}><FlipHorizontal className="h-4 w-4" /></BarButton>
               <BarButton title={t('BoardView.flipVertical')} onClick={() => onFlip('y')}><FlipVertical className="h-4 w-4" /></BarButton>

               <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />

               {/* Structure: reorder within the layer (paint order), duplicate, delete - the item toolbar's glyphs. */}
               <BarButton title={t('BoardView.bringToFront')} onClick={() => onStructure('front')}><ArrowUpToLine className="h-4 w-4" /></BarButton>
               <BarButton title={t('BoardView.sendToBack')} onClick={() => onStructure('back')}><ArrowDownToLine className="h-4 w-4" /></BarButton>
               <BarButton title={t('BoardView.duplicateSelection')} onClick={() => onStructure('duplicate')}><Copy className="h-4 w-4" /></BarButton>
               <BarButton title={t('BoardView.deleteItem')} destructive onClick={() => onStructure('delete')}><Trash2 className="h-4 w-4" /></BarButton>
            </div>
         </div>
      </div>
   );
}

/** A frosted icon button in the style bar; stops the pointer from starting a move/pan, click still fires. */
function BarButton({ title, destructive = false, onClick, children }: { title: string; destructive?: boolean; onClick: () => void; children: ReactNode }) {
   return (
      <button
         type="button"
         title={title}
         aria-label={title}
         onPointerDown={(event) => event.stopPropagation()}
         onClick={onClick}
         className={`flex size-6 shrink-0 cursor-pointer items-center justify-center rounded ${destructive ? 'text-destructive hover:bg-destructive/15' : 'text-popover-foreground hover:bg-muted'}`}
      >
         {children}
      </button>
   );
}
