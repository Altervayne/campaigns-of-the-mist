// -- React Imports --
import { createContext, useContext } from 'react';

// -- Type Imports --
import type { StrokeStylePatch } from '@/lib/drawing/strokeStyle';

/*
 * React Context carrying a LIVE, uncommitted style edit for the transform tool's selection, so a drawing
 * layer can paint its selected strokes with the in-progress patch while a color / width control is being
 * dragged - no store write until the control releases. Null whenever nothing is being adjusted. Same family
 * as the pending-erase + in-flight-transform previews: transient canvas state, real only on commit.
 *
 * The context + hook live in this `.ts` file so the provider stays in a `.tsx` without tripping
 * `react-refresh/only-export-components`.
 */

/** A live style patch scoped to one layer's selected strokes; null when no control is being adjusted. */
export interface StrokeStylePreview {
   layerId: string;
   strokeIds: ReadonlySet<string>;
   patch: StrokeStylePatch;
}

export const StrokeStylePreviewContext = createContext<StrokeStylePreview | null>(null);

/** The live, uncommitted stroke-style patch to paint (or null when nothing is being adjusted). */
export function useStrokeStylePreview(): StrokeStylePreview | null {
   return useContext(StrokeStylePreviewContext);
}
