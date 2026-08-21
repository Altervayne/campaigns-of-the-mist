/*
 * Normalizes an uploaded custom stencil mask (an SVG or a transparent raster) into a stored alpha-mask
 * asset. The mask's ALPHA is the shape: opaque pixels are kept, transparent pixels are cut - so a mask
 * with no transparency masks nothing (detected and rejected below). The output rides the same pipeline as
 * every other stored image ({@link processImage} -> webp, which preserves alpha), so the bake reads it back
 * as an ordinary asset bitmap.
 *
 * SECURITY: an uploaded SVG is rasterized ONLY by loading it into an `<img>` element, which the browser
 * renders in secure static mode - no script execution, no external subresource fetches. The SVG bytes are
 * NEVER inserted into the DOM as markup (no innerHTML / inline `<svg>` / dangerouslySetInnerHTML), so there
 * is no persistent SVG-XSS surface; only the resulting raster is stored.
 */

// -- Pipeline Imports --
import { processImage, type ProcessedImage } from '@/lib/assets/processImage';

/** Longest edge (px) an uploaded mask is rasterized to before {@link processImage} clamps the stored copy. */
const MASK_RASTER_EDGE_PX = 1024;
/** Fallback raster size for an SVG whose intrinsic dimensions are unknown (viewBox-only, no width/height). */
const SVG_FALLBACK_EDGE_PX = 512;

/**
 * Thrown when a picked mask has no transparency, so it would keep the whole image and mask nothing.
 * The caller surfaces this as a friendly warning rather than baking a no-op.
 */
export class MaskHasNoTransparencyError extends Error {
   constructor() {
      super('The uploaded mask has no transparency, so it would not mask anything.');
      this.name = 'MaskHasNoTransparencyError';
   }
}

/** Whether a picked file is an SVG (by MIME or extension), routing it to the secure-static rasterize path. */
export function isSvgMask(file: File): boolean {
   return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
}

/** Whether RGBA pixel data carries any translucency (an alpha below fully opaque). None means it masks nothing. */
export function hasTransparency(data: Uint8ClampedArray): boolean {
   for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
   }
   return false;
}

/** Scales `width`/`height` so the longest edge is at most `max`, never upscaling. */
function fitWithinEdge(width: number, height: number, max: number): { width: number; height: number } {
   const longest = Math.max(width, height);
   if (longest <= 0) return { width: max, height: max };
   if (longest <= max) return { width: Math.round(width), height: Math.round(height) };
   const scale = max / longest;
   return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Loads an SVG file into an `<img>` (secure static mode - see the module-level SECURITY note) so it can be
 * rasterized. The blob URL is revoked once the decode settles.
 */
function loadSvgImage(file: File): Promise<HTMLImageElement> {
   return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
         URL.revokeObjectURL(url);
         resolve(img);
      };
      img.onerror = () => {
         URL.revokeObjectURL(url);
         reject(new Error('Could not load the uploaded SVG mask'));
      };
      img.src = url;
   });
}

/** Acquires a 2D context, throwing on the (unexpected) allocation failure. */
function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
   const context = canvas.getContext('2d');
   if (!context) throw new Error('Could not acquire a 2D canvas context for mask normalization');
   return context;
}

/** Draws `canvas` to a PNG blob (lossless, alpha-preserving), rejecting if the encoder yields nothing. */
function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
   return new Promise((resolve, reject) => {
      canvas.toBlob(
         (blob) => (blob ? resolve(blob) : reject(new Error('Mask normalization encoding produced no blob'))),
         'image/png',
      );
   });
}

/** Rasterizes an uploaded SVG onto a canvas at its intrinsic size (or a fallback when it has none). */
async function rasterizeSvg(file: File): Promise<HTMLCanvasElement> {
   const img = await loadSvgImage(file);
   const natural = fitWithinEdge(
      img.naturalWidth || SVG_FALLBACK_EDGE_PX,
      img.naturalHeight || SVG_FALLBACK_EDGE_PX,
      MASK_RASTER_EDGE_PX,
   );
   const canvas = Object.assign(document.createElement('canvas'), natural);
   context2d(canvas).drawImage(img, 0, 0, natural.width, natural.height);
   return canvas;
}

/** Rasterizes an uploaded raster mask onto a canvas; its own alpha is already the mask. */
async function rasterizeImage(file: File): Promise<HTMLCanvasElement> {
   const bitmap = await createImageBitmap(file);
   const size = fitWithinEdge(bitmap.width, bitmap.height, MASK_RASTER_EDGE_PX);
   const canvas = Object.assign(document.createElement('canvas'), size);
   context2d(canvas).drawImage(bitmap, 0, 0, size.width, size.height);
   bitmap.close();
   return canvas;
}

/**
 * Normalizes an uploaded mask file to a stored alpha-mask asset: rasterizes it (SVG via secure `<img>`,
 * raster via `createImageBitmap`), rejects a mask with no transparency, and runs the raster through
 * {@link processImage} so it stores exactly like any other image.
 *
 * @throws {MaskHasNoTransparencyError} when the mask is fully opaque (it would mask nothing).
 */
export async function normalizeMaskUpload(file: File): Promise<ProcessedImage> {
   const canvas = isSvgMask(file) ? await rasterizeSvg(file) : await rasterizeImage(file);

   const pixels = context2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
   if (!hasTransparency(pixels.data)) throw new MaskHasNoTransparencyError();

   return processImage(await canvasToPngBlob(canvas));
}
