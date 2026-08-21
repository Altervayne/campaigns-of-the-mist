/*
 * Bakes a shape mask into an image: draws the source onto a canvas, then keeps only the pixels the
 * mask covers (transparent outside). Mirrors {@link cropImage} - same canvas-to-Blob shape, same
 * downstream contract: the clamp-to-1024 + webp encode lives in {@link processImage}, the sole
 * authority on the stored bytes. Output is PNG so the alpha stays lossless and `processImage`'s
 * single webp pass is the only lossy step.
 *
 * The mask is EITHER preset path data on its own viewBox (see `maskPresets`) or an uploaded custom
 * raster. Both apply with `destination-in`, which multiplies existing pixels by the incoming alpha -
 * keeping the image only where the mask is opaque. A preset scales its path from the viewBox to the
 * canvas and fills it; a raster is drawn stretched to the canvas so its own alpha weights the source.
 */

/** The viewBox the mask path is authored in, so the bake can scale it to the canvas. */
export interface MaskViewBox {
   width: number;
   height: number;
}

/**
 * The mask a bake applies: a `preset` shape (path data on a viewBox) or a `raster` (an uploaded custom
 * mask, already normalized to an alpha bitmap). Both weight the source by their alpha under `destination-in`.
 */
export type StencilMask =
   | { kind: 'preset'; path: string; viewBox: MaskViewBox }
   | { kind: 'raster'; bitmap: ImageBitmap };

/** Draws `canvas` to a PNG blob (lossless, alpha-preserving), rejecting if the encoder yields nothing. */
function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
   return new Promise((resolve, reject) => {
      canvas.toBlob(
         (blob) => (blob ? resolve(blob) : reject(new Error('Canvas stencil encoding produced no blob'))),
         'image/png',
      );
   });
}

/** Acquires a 2D context, throwing on the (unexpected) allocation failure. */
function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
   const context = canvas.getContext('2d');
   if (!context) throw new Error('Could not acquire a 2D canvas context for stenciling');
   return context;
}

/**
 * Masks `source` by `mask`, keeping the image only where the mask is opaque (transparent outside).
 * The output canvas matches the source's pixel size; a preset scales from its `viewBox` to fill it,
 * a raster is drawn stretched to fill it.
 *
 * @param source - The decoded source image (already crop/rotation-resolved upstream).
 * @param mask - A preset shape (path + viewBox) or a custom raster mask (alpha = the kept region).
 * @returns The masked pixels as a lossless PNG blob, ready for {@link processImage}.
 */
export async function stencilImage(source: ImageBitmap, mask: StencilMask): Promise<Blob> {
   const output = document.createElement('canvas');
   output.width = source.width;
   output.height = source.height;
   const context = context2d(output);

   context.drawImage(source, 0, 0);

   // `destination-in` keeps existing pixels weighted by the incoming alpha, so the mask erases
   // everything it does not cover.
   context.globalCompositeOperation = 'destination-in';
   if (mask.kind === 'preset') {
      // Scale the path from its viewBox to the canvas, then fill it.
      context.scale(output.width / mask.viewBox.width, output.height / mask.viewBox.height);
      context.fill(new Path2D(mask.path));
   } else {
      // Stretch the custom mask to the canvas; its own alpha weights the source (soft edges stay soft).
      context.drawImage(mask.bitmap, 0, 0, output.width, output.height);
   }

   return canvasToPngBlob(output);
}
