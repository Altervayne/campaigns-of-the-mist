/*
 * Bakes a shape mask into an image: draws the source onto a canvas, then keeps only the pixels
 * inside the mask path (transparent outside). Mirrors {@link cropImage} - same canvas-to-Blob shape,
 * same downstream contract: the clamp-to-1024 + webp encode lives in {@link processImage}, the sole
 * authority on the stored bytes. Output is PNG so the alpha stays lossless and `processImage`'s
 * single webp pass is the only lossy step.
 *
 * The mask is normalized path data on its own viewBox (see `maskPresets`); it is scaled to the
 * source's pixel size and filled with `destination-in`, which multiplies existing pixels by the
 * fill's alpha - keeping the image only where the shape covers it.
 */

/** The viewBox the mask path is authored in, so the bake can scale it to the canvas. */
export interface MaskViewBox {
   width: number;
   height: number;
}

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
 * Masks `source` to `maskPath`, keeping the image only inside the shape (transparent outside).
 * The output canvas matches the source's pixel size; the mask is scaled from `viewBox` to fill it.
 *
 * @param source - The decoded source image (already crop/rotation-resolved upstream).
 * @param maskPath - SVG path data for the mask (opaque interior = the kept shape).
 * @param viewBox - The coordinate box `maskPath` is authored in.
 * @returns The masked pixels as a lossless PNG blob, ready for {@link processImage}.
 */
export async function stencilImage(
   source: ImageBitmap,
   maskPath: string,
   viewBox: MaskViewBox,
): Promise<Blob> {
   const output = document.createElement('canvas');
   output.width = source.width;
   output.height = source.height;
   const context = context2d(output);

   context.drawImage(source, 0, 0);

   // `destination-in` keeps existing pixels weighted by the incoming fill's alpha, so filling the
   // shape erases everything outside it. Scale the path from its viewBox to the canvas first.
   context.globalCompositeOperation = 'destination-in';
   context.scale(output.width / viewBox.width, output.height / viewBox.height);
   context.fill(new Path2D(maskPath));

   return canvasToPngBlob(output);
}
