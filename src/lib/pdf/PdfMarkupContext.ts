// -- React Imports --
import { createContext, useContext } from 'react';

// -- Type Imports --
import type { PdfMarkupMode, PdfTool } from '@/lib/stores/pdfStore';
import type { PdfRect } from '@/lib/types/pdfAnnotation';

/*
 * React Context carrying the markup mode, the armed tool, the pen params, and the commit / erase sinks to
 * the per-page interaction layers. It lets each layer read the current tool state and write marks WITHOUT
 * prop-drilling through the memoized PdfPageCanvas (whose props must stay stable so a wheel-zoom skips
 * re-rendering every page). The reader builds the value from its store; the handlers stay referentially
 * stable so an in-progress gesture never sees them swapped mid-stroke.
 *
 * The context + hook live in this `.ts` file (no component export) so the provider can wrap its subtree
 * from a `.tsx` without tripping `react-refresh/only-export-components`.
 */

export interface PdfMarkupContextValue {
   mode: PdfMarkupMode;
   tool: PdfTool;
   penColor: string;
   /** Pen width in the selector's world px; the layer normalizes it to a page-width fraction at commit. */
   penWidth: number;
   highlightColor: string;
   commentColor: string;
   /** The comment whose editor popover is open, or `null`. Drives the per-page comment layer's controlled popover. */
   openCommentId: string | null;
   /** Mints a pen ink from a finished gesture: normalized points + a normalized (page-width fraction) width. */
   commitInk: (pageNumber: number, normalizedPoints: number[], normalizedWidth: number) => void;
   /** Mints a highlight from a finished rect drag (normalized page-space rect). */
   commitHighlight: (pageNumber: number, rect: PdfRect) => void;
   /** Mints an empty comment from a finished rect drag AND opens its editor for authoring. */
   commitComment: (pageNumber: number, rect: PdfRect) => void;
   /**
    * Erases every annotation under a client point on the given page. `rect` is the page box's on-screen
    * (zoomed) rect; `boxW`/`boxH` are its unzoomed pixel size, so the point resolves to box space independent
    * of the current zoom.
    */
   eraseAt: (pageNumber: number, rect: DOMRect, boxW: number, boxH: number, clientX: number, clientY: number) => void;
   /**
    * The topmost comment id under a client point on the given page, or `null`. Same zoom-independent point
    * conversion as {@link eraseAt}; used to reopen an existing comment from a click.
    */
   commentAtPoint: (pageNumber: number, rect: DOMRect, boxW: number, boxH: number, clientX: number, clientY: number) => string | null;
   /** Opens a comment's editor popover. */
   openComment: (id: string) => void;
   /** Closes a comment's editor, deleting it first if its body is still empty. */
   closeComment: (id: string) => void;
   /** Edits a comment's body (rides the debounced autosave). */
   setCommentBody: (id: string, body: string) => void;
   /** Removes a comment outright and closes its editor. */
   deleteComment: (id: string) => void;
   /** The selected annotation's id, or `null`. Drives the per-page selection chrome. */
   selectedId: string | null;
   /** The comment briefly flashed after a comments-list jump, or `null`. Drives the per-page flash chrome. */
   flashCommentId: string | null;
   /** Sets or clears the selection. */
   select: (id: string | null) => void;
   /**
    * The topmost annotation of any kind under a client point on the given page, or `null`. Same
    * zoom-independent point conversion as {@link eraseAt}; drives select-tool hit-testing.
    */
   selectAt: (pageNumber: number, rect: DOMRect, boxW: number, boxH: number, clientX: number, clientY: number) => string | null;
   /** Moves the selected annotation by an incremental normalized delta, clamped so it stays on the page. */
   translateSelected: (dnx: number, dny: number) => void;
   /** Opens an undo checkpoint before a store-mutating gesture. Pairs with {@link commitHistory}. */
   beginHistory: () => void;
   /** Closes the open checkpoint, recording an undo step only when the gesture changed the annotations. */
   commitHistory: () => void;
}

/** The read-mode default: no marking, no-op sinks. Consumers gate on `mode` before ever calling them. */
const READ_ONLY_VALUE: PdfMarkupContextValue = {
   mode: 'read',
   tool: 'pen',
   penColor: '#e11d48',
   penWidth: 3,
   highlightColor: '#fde047',
   commentColor: '#f59e0b',
   openCommentId: null,
   commitInk: () => {},
   commitHighlight: () => {},
   commitComment: () => {},
   eraseAt: () => {},
   commentAtPoint: () => null,
   openComment: () => {},
   closeComment: () => {},
   setCommentBody: () => {},
   deleteComment: () => {},
   selectedId: null,
   flashCommentId: null,
   select: () => {},
   selectAt: () => null,
   translateSelected: () => {},
   beginHistory: () => {},
   commitHistory: () => {},
};

export const PdfMarkupContext = createContext<PdfMarkupContextValue>(READ_ONLY_VALUE);

/** Resolves the markup state + sinks for the enclosing reader. Defaults to read-only when unprovided. */
export function usePdfMarkup(): PdfMarkupContextValue {
   return useContext(PdfMarkupContext);
}
