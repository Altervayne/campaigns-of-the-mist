// -- Type Imports --
import type { BrushKind } from '@/lib/types/board';

/*
 * PDF markup annotations. A cousin of the board `Stroke`, not a reuse: coordinates are
 * normalized 0..1 in page space (surviving every zoom/render-width change), and `color` is a
 * REAL hex - never the board's adaptive-null - because a PDF page is always white paper. The
 * three kinds compose the board's stroke renderer but carry none of its board-local baggage.
 */

/** A rectangle in page space, all four fields normalized 0..1 (x/w as width-fractions, y/h as height-fractions). */
export interface PdfRect {
   x: number;
   y: number;
   w: number;
   h: number;
}

/** Fields every annotation shares. `page` is 1-based; `color` is a concrete hex; `createdAt` is epoch ms. */
interface PdfAnnotationBase {
   id: string;
   page: number;
   color: string;
   createdAt: number;
}

/**
 * Freehand pen ink. `points` is a flat `[x0,y0,x1,y1,...]` list, each coord normalized 0..1 in page space;
 * `width` is the stroke width as a fraction of page width, so ink scales with the page. `brush` is the
 * board stroke family; `pressure` is a reserved per-point channel, mirroring the board `Stroke`.
 */
export interface PdfInk extends PdfAnnotationBase {
   kind: 'ink';
   points: number[];
   width: number;
   brush?: BrushKind;
   pressure?: number[];
}

/** A translucent drawn rectangle. `alpha` is the fill opacity 0..1. */
export interface PdfHighlight extends PdfAnnotationBase {
   kind: 'highlight';
   rect: PdfRect;
   alpha: number;
}

/** A marqueed region carrying a plain-text comment, feeding the comments list. */
export interface PdfComment extends PdfAnnotationBase {
   kind: 'comment';
   rect: PdfRect;
   body: string;
}

/**
 * A translucent highlight bound to selected TEXT: `quads` are the per-line glyph rects (each normalized
 * 0..1 in page space), frozen at creation so the fill sits on the letters at any zoom; `alpha` is the fill
 * opacity 0..1; `text` is the selected quote, stored for copy/list/export self-description only. Select /
 * recolor / delete only - a text highlight dragged off its text is nonsense, so it neither moves nor resizes.
 */
export interface PdfTextHighlight extends PdfAnnotationBase {
   kind: 'textHighlight';
   quads: PdfRect[];
   alpha: number;
   text: string;
}

/** Any PDF markup annotation, discriminated by `kind`. */
export type PdfAnnotation = PdfInk | PdfHighlight | PdfComment | PdfTextHighlight;

/** The discriminant of a {@link PdfAnnotation}. */
export type PdfAnnotationKind = PdfAnnotation['kind'];

/** Per-kind reader visibility; ephemeral view state, never persisted. A hidden kind is neither painted nor hit-tested. */
export type PdfAnnotationVisibility = Record<PdfAnnotationKind, boolean>;
