/*
 * The surface-agnostic drawing types. A stroke is one inked mark; the drawing engine (path building, hit
 * testing, transform math) operates on these, so they live here rather than in any one surface's namespace.
 * The board's drawing LAYER (`DrawingBoardContent`, the item that wraps a stroke list) stays with the board.
 */

/** A stroke's brush family: pen (thin, constant), brush (variable-width nib), highlighter (broad, translucent). */
export type BrushKind = 'pen' | 'brush' | 'highlighter';

/**
 * The active pointer tool on the board. `select` is the default (a click-through overlay); every other
 * value is a Draw gesture that owns the pointer. Ephemeral UI state, never persisted. `shape` draws a
 * bounding-box ellipse/rect (circle/square when constrained). `transform` selects and moves the strokes of
 * one drawing layer (it appends nothing, so it stays out of {@link isAppendTool}).
 */
export type ActiveTool = 'select' | 'freehand' | 'line' | 'freeformPolygon' | 'regularPolygon' | 'shape' | 'eraser' | 'transform';

/**
 * One freehand stroke on a drawing layer. `points` is a flat `[x0,y0,x1,y1,...]` list in LAYER-LOCAL
 * coords (relative to the layer item's `x`/`y` origin), so a layer move stays a pure translate and a
 * stroke append never touches the box. `color` is required-but-nullable: null is the adaptive default
 * (the theme foreground, legible on any board), frozen to a user hex only once picked. `width` is world
 * px, so ink scales with the board. `brush` is the stroke family (its width/opacity are baked in at
 * creation). `pressure` is a reserved per-point channel, dormant while width is constant. `shape` marks a
 * geometric stroke rendered crisp (no smoothing): absent = freehand, `line` = a straight segment,
 * `polygon` = a closed N-gon (the closing edge is implied), `ellipse`/`rect` = a bounding-box shape from
 * two drag corners (`points = [ax,ay,bx,by]`, normalized at paint). `filled` fills a closed shape's
 * interior with the ink; absent = outline only. Shapes still inherit the brush.
 */
export interface Stroke {
   id: string;
   brush: BrushKind;
   color: string | null;
   width: number;
   points: number[];
   pressure?: number[];
   shape?: 'line' | 'polygon' | 'ellipse' | 'rect';
   filled?: boolean;
}
