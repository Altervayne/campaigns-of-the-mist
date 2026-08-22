// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Trash2 } from 'lucide-react';

// -- Component Imports --
import { ConnectionPathPopover } from './ConnectionPathPopover';
import { ConnectionStrokePopover } from './ConnectionStrokePopover';
import { ConnectionMarkersPopover } from './ConnectionMarkersPopover';
import { ConnectionColorControl } from './ConnectionColorControl';
import { ConnectionLabelPopover } from './ConnectionLabelPopover';

// -- Utils Imports --
import { CONNECTION_LABEL_SIZE_PX, DEFAULT_LABEL_SIZE } from '@/lib/board/boardConnections';

// -- Type Imports --
import type { ConnectionStyle } from '@/lib/types/board';

/** Screen-px lift above the midpoint when the connection has no label. */
const BASE_TOOLBAR_LIFT = 44;
/** The label chip's world-px lift off the line (mirrors ConnectionLabelChip). */
const LABEL_CHIP_LIFT = 22;
/** Toolbar half-height plus the screen-px gap kept above the label's top edge. */
const TOOLBAR_LABEL_GAP = 22;

/*
 * The style control for the selected connection: a compact row of popover triggers (Path / Stroke /
 * Markers / Color / Label) plus an inline Delete. Anchored at the on-path midpoint, counter-scaled so
 * it stays a fixed screen size, and floated a fixed distance above the line so it never covers the
 * center marker it edits. The container stops the pointer so a press inside it never reads as a
 * canvas click-away. Each change commits one undoable style update (the label commits on close).
 */
export function ConnectionToolbar({ connectionId, style, x, y, zoom, zIndex, effectiveColor, onPreview, onLabelColorPreview, onUpdateStyle, onDelete }: {
   connectionId: string;
   style: ConnectionStyle;
   x: number;
   y: number;
   zoom: number;
   zIndex: number;
   effectiveColor: string;
   onPreview: (color: string | null) => void;
   onLabelColorPreview: (color: string | null) => void;
   onUpdateStyle: (id: string, style: ConnectionStyle) => void;
   onDelete: (id: string) => void;
}) {
   const { t } = useTranslation();
   const commit = (next: ConnectionStyle) => onUpdateStyle(connectionId, next);
   const pathType = style.pathType ?? 'straight';

   // Lift the toolbar above the line, higher when a label is present so the two never overlap. The label
   // chip is world-scaled (it grows with zoom + its size preset) while the toolbar is screen-constant, so
   // the label's clearance scales with zoom; floored at the no-label lift.
   const labelReach = LABEL_CHIP_LIFT + (CONNECTION_LABEL_SIZE_PX[style.labelSize ?? DEFAULT_LABEL_SIZE] + 4) / 2;
   const lift = style.label ? Math.max(BASE_TOOLBAR_LIFT, labelReach * zoom + TOOLBAR_LABEL_GAP) : BASE_TOOLBAR_LIFT;

   return (
      <div
         className="absolute"
         style={{ left: x, top: y, zIndex, transform: `translate(-50%, -50%) scale(${1 / zoom}) translateY(-${lift}px)` }}
         onPointerDown={(event) => event.stopPropagation()}
      >
         <div className="flex items-center gap-1 rounded-lg border border-border bg-popover/90 p-1 shadow-md backdrop-blur-sm">
            <ConnectionPathPopover pathType={pathType} onChange={(next) => commit({ ...style, pathType: next })} />

            <div className="h-5 w-px bg-border" />

            <ConnectionStrokePopover style={style} onChange={commit} />

            <div className="h-5 w-px bg-border" />

            <ConnectionMarkersPopover markers={style.markers} onChange={(markers) => commit({ ...style, markers })} />

            <div className="h-5 w-px bg-border" />

            <ConnectionColorControl
               connectionId={connectionId}
               style={style}
               effectiveColor={effectiveColor}
               onPreview={onPreview}
               onUpdateStyle={onUpdateStyle}
            />

            <div className="h-5 w-px bg-border" />

            <ConnectionLabelPopover style={style} onChange={commit} onColorPreview={onLabelColorPreview} />

            <div className="h-5 w-px bg-border" />

            <button
               type="button"
               aria-label={t('BoardView.deleteConnection')}
               title={t('BoardView.deleteConnection')}
               onClick={() => onDelete(connectionId)}
               className="flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
               <Trash2 className="h-3.5 w-3.5" />
            </button>
         </div>
      </div>
   );
}
