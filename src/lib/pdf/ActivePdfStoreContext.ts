// -- React Imports --
import { createContext, useContext } from 'react';

// -- Type Imports --
import type { PdfStore } from '@/lib/stores/pdfStore';

/*
 * React Context carrying the ACTIVE pdf store instance to the PDF reader surface. Mirrors the
 * board/note contexts: the value is `PdfStore | null` - `null` whenever the active tab is not a
 * pdf (a character/board/note tab or the menu), so the hook legitimately returns `null` and
 * consumers tolerate it (there is no menu fallback for pdfs).
 *
 * The context + hook live in this `.ts` file (no component export) so the provider, which is a
 * component, can live in its own `.tsx` without tripping `react-refresh/only-export-components`.
 */

/** Holds the active pdf instance, or `null` when no pdf tab is active. */
export const ActivePdfStoreContext = createContext<PdfStore | null>(null);

/**
 * Resolves the active pdf store instance from context, or `null` when the active tab is not a pdf.
 * Never throws: `null` is a valid state.
 */
export function useActivePdfInstance(): PdfStore | null {
   return useContext(ActivePdfStoreContext);
}
