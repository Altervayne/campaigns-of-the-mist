/*
 * The bundled shape masks a board image can be stenciled to. Each mask is normalized SVG PATH DATA
 * on its own viewBox (opaque inside the path = the kept shape), NOT a binary asset - so nothing is
 * bundled, licensed, or exported. A stored image references a mask by its stable `id` (`maskId`);
 * the bake (`stencilImage`) scales the path from its viewBox to the canvas and keeps the pixels
 * inside it. Paths are own-made vectors; keep `id` stable, since boards persist it.
 */

/** One shape mask: a stable id, an i18n label key, and path data on `viewBox`. */
export interface MaskPreset {
   /** Stable identifier stored as `ImageBoardContent.maskId`; never rename. */
   id: string;
   /** i18n key for the display label. */
   labelKey: string;
   /** SVG path data (opaque interior = the kept shape), expressed in `viewBox` units. */
   path: string;
   /** The coordinate box `path` is authored in; the bake scales it to the output canvas. */
   viewBox: { width: number; height: number };
}

const BOX = { width: 100, height: 100 };

/** The v1 mask set. Order is the display order in the stencil picker. */
export const MASK_PRESETS: readonly MaskPreset[] = [
   {
      id: 'rough-circle',
      labelKey: 'BoardStencil.maskRoughCircle',
      path: 'M50 1 L65.4 7.7 L82.1 11.7 L89.8 27 L97.3 41.7 L93.3 57.6 L93.3 75 L79.6 85.2 L66.8 96 L50 95 L32.9 97 L19.8 86 L8.4 74 L6.7 57.6 L0.8 41.3 L10.2 27 L18.5 12.5 L34.6 7.7 Z',
      viewBox: BOX,
   },
   {
      id: 'hexagon',
      labelKey: 'BoardStencil.maskHexagon',
      path: 'M25 6.7 L75 6.7 L100 50 L75 93.3 L25 93.3 L0 50 Z',
      viewBox: BOX,
   },
   {
      id: 'rough-rectangle',
      labelKey: 'BoardStencil.maskRoughRectangle',
      path: 'M4 5 L30 3 L60 6 L96 3 L98 35 L95 65 L97 96 L65 98 L35 95 L3 95 L5 62 L2 32 Z',
      viewBox: BOX,
   },
   {
      id: 'torn-edge',
      labelKey: 'BoardStencil.maskTornEdge',
      path: 'M0 10 L7.1 3 L14.3 12 L21.4 5 L28.6 9 L35.7 2 L42.9 11 L50 4 L57.1 13 L64.3 6 L71.4 8 L78.6 3 L85.7 10 L92.9 5 L100 10 L100 100 L0 100 Z',
      viewBox: BOX,
   },
   {
      id: 'organic-blob',
      labelKey: 'BoardStencil.maskOrganicBlob',
      path: 'M98 50 C98.1 59.3 86.3 70.6 78.3 78.3 C70.3 86 59.2 96.2 50 96 C40.8 95.8 31.3 84.5 23.1 76.9 C15 69.2 1.4 59.3 1 50 C0.6 40.7 12.8 28.5 21 21 C29.2 13.5 40.6 4.8 50 5 C59.4 5.2 69.6 14.9 77.6 22.4 C85.6 29.9 97.9 40.7 98 50 Z',
      viewBox: BOX,
   },
   {
      id: 'circle',
      labelKey: 'BoardStencil.maskCircle',
      path: 'M2 50 A48 48 0 1 0 98 50 A48 48 0 1 0 2 50 Z',
      viewBox: BOX,
   },
   {
      id: 'ripped-rectangle',
      labelKey: 'BoardStencil.maskRippedRectangle',
      path: 'M4 4 L28 2 L55 6 L82 3 L96 5 L97 25 L96 47 L78 48 L60 49 L50 49 L46 50 L50 51 L60 51 L78 52 L96 53 L97 76 L95 96 L68 98 L40 95 L12 98 L4 96 L2 64 L6 34 Z',
      viewBox: BOX,
   },
] as const;

/** Looks up a mask by its stored id, or `undefined` when the id is unknown (e.g. a removed preset). */
export function getMaskPreset(id: string): MaskPreset | undefined {
   return MASK_PRESETS.find((mask) => mask.id === id);
}
