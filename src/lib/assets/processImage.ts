/*
 * Image processing pipeline for stored assets. Pure helper: no store access, no
 * React. Takes an arbitrary image blob and returns a normalized, content-hashed
 * webp ready for the repository to persist (or dedup against).
 *
 * The decode/scale/encode path relies on `createImageBitmap` and a canvas, which
 * are browser built-ins not reliably available under the unit-test runner; the
 * hashing step is factored out into {@link hashBytes} so it is testable in
 * isolation. The full pipeline is exercised in-browser once the consumer lands.
 */

/** Default longest edge (px) the processed image is clamped to; never upscaled past the source. */
const MAX_EDGE_PX = 1024;
/** Quality passed to the webp encoder (0-1). A starting value, to be tuned later. */
const WEBP_QUALITY = 0.82;

/** The pipeline output: an {@link AssetRecord} minus its persistence-assigned `createdAt`. */
export interface ProcessedImage {
   /** SHA-256 of the processed webp bytes, hex. */
   hash: string;
   /** The processed webp bytes. */
   blob: Blob;
   /** Always `'image/webp'`. */
   mimeType: string;
   /** Processed width in pixels. */
   width: number;
   /** Processed height in pixels. */
   height: number;
   /** `blob.size`. */
   byteSize: number;
}

/**
 * Hashes raw bytes to a hex SHA-256 string via `crypto.subtle`. Exported on its own
 * (no canvas / `createImageBitmap`) so dedup keying is unit-testable.
 *
 * @param buffer - The bytes to hash (the processed webp's `ArrayBuffer`).
 * @returns The lowercase hex digest.
 */
export async function hashBytes(buffer: ArrayBuffer): Promise<string> {
   const digest = await crypto.subtle.digest('SHA-256', buffer);
   return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
}

/** Computes target dimensions so the longest edge is <= `maxEdge`, never upscaling. */
function fitWithinMaxEdge(width: number, height: number, maxEdge: number): { width: number; height: number } {
   const longest = Math.max(width, height);
   if (longest <= maxEdge) return { width, height };
   const scale = maxEdge / longest;
   return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Encodes a canvas to a webp blob, bridging `OffscreenCanvas` and `HTMLCanvasElement`. */
function canvasToWebpBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
   if (canvas instanceof OffscreenCanvas) {
      return canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
   }
   return new Promise((resolve, reject) => {
      canvas.toBlob(
         (blob) => (blob ? resolve(blob) : reject(new Error('Canvas webp encoding produced no blob'))),
         'image/webp',
         WEBP_QUALITY,
      );
   });
}

/** Options for {@link processImage}. */
export interface ProcessImageOptions {
   /** Longest-edge clamp (px). Defaults to `MAX_EDGE_PX`; a thumbnail consumer (a PDF cover) passes a smaller cap. */
   maxEdge?: number;
}

/**
 * Decodes `file`, scales it so the longest edge is at most `maxEdge` (default `MAX_EDGE_PX`,
 * never upscaling), re-encodes it as webp, and content-hashes the resulting bytes.
 *
 * The hash keys on what is actually stored (the processed webp), so two visually
 * identical sources that processed to the same bytes dedup to one asset.
 *
 * @param file - The source image blob (any decodable image type).
 * @param options - Optional processing overrides (e.g. a smaller `maxEdge` for a thumbnail).
 * @returns The processed, hashed webp ready to store.
 */
export async function processImage(file: Blob, options: ProcessImageOptions = {}): Promise<ProcessedImage> {
   const bitmap = await createImageBitmap(file);
   const { width, height } = fitWithinMaxEdge(bitmap.width, bitmap.height, options.maxEdge ?? MAX_EDGE_PX);

   const canvas: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas !== 'undefined'
         ? new OffscreenCanvas(width, height)
         : Object.assign(document.createElement('canvas'), { width, height });

   const context = canvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
   if (!context) throw new Error('Could not acquire a 2D canvas context for image processing');
   context.drawImage(bitmap, 0, 0, width, height);
   bitmap.close();

   const blob = await canvasToWebpBlob(canvas);
   const hash = await hashBytes(await blob.arrayBuffer());

   return { hash, blob, mimeType: 'image/webp', width, height, byteSize: blob.size };
}
