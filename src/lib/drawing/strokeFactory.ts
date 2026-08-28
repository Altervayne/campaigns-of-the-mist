/*
 * Stroke factories: minting a fresh stroke over a flat point list. Kept apart from the paint/geometry
 * helpers so a caller that only mints strokes need not pull the render code.
 */

// -- Utils Imports --
import { DEFAULT_STROKE_WIDTH } from './constants';

// -- Type Imports --
import type { BrushKind, Stroke } from './types';

/**
 * A fresh stroke over a flat point list, carrying its brush, ink, width, and (for a geometric stroke) shape.
 * `filled` is stamped only when true, so freehand/line/polygon strokes stay fill-less.
 */
export function makeStroke(id: string, points: number[], brush: BrushKind, color: string | null, width: number, shape?: Stroke['shape'], filled?: boolean): Stroke {
   const stroke: Stroke = { id, brush, color, width, points };
   if (shape) stroke.shape = shape;
   if (filled) stroke.filled = true;
   return stroke;
}

/** A fresh pen stroke with the default width and adaptive ink. */
export function makePenStroke(id: string, points: number[]): Stroke {
   return makeStroke(id, points, 'pen', null, DEFAULT_STROKE_WIDTH);
}
