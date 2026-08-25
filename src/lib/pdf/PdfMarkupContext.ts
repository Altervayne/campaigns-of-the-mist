// -- React Imports --
import { createContext, useContext } from 'react';

// -- Type Imports --
import type { PdfMarkupMode, PdfTool } from '@/lib/stores/pdfStore';

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
   /** Mints a pen ink from a finished gesture: normalized points + a normalized (page-width fraction) width. */
   commitInk: (pageNumber: number, normalizedPoints: number[], normalizedWidth: number) => void;
   /**
    * Erases every annotation under a client point on the given page. `rect` is the page box's on-screen
    * (zoomed) rect; `boxW`/`boxH` are its unzoomed pixel size, so the point resolves to box space independent
    * of the current zoom.
    */
   eraseAt: (pageNumber: number, rect: DOMRect, boxW: number, boxH: number, clientX: number, clientY: number) => void;
}

/** The read-mode default: no marking, no-op sinks. Consumers gate on `mode` before ever calling them. */
const READ_ONLY_VALUE: PdfMarkupContextValue = {
   mode: 'read',
   tool: 'pen',
   penColor: '#e11d48',
   penWidth: 3,
   commitInk: () => {},
   eraseAt: () => {},
};

export const PdfMarkupContext = createContext<PdfMarkupContextValue>(READ_ONLY_VALUE);

/** Resolves the markup state + sinks for the enclosing reader. Defaults to read-only when unprovided. */
export function usePdfMarkup(): PdfMarkupContextValue {
   return useContext(PdfMarkupContext);
}
