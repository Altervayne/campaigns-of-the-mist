// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { isSvgMask, hasTransparency } from './normalizeMaskUpload';

/*
 * The pure seams of custom-mask normalization: file-type routing (SVG vs raster) and the
 * no-transparency detection that rejects a mask which would keep the whole image. The actual
 * rasterize/encode is browser-only (canvas + `createImageBitmap`) and is verified in-app.
 */

/** A `File` with the given name/type (contents irrelevant to the routing check). */
function makeFile(name: string, type: string): File {
   return new File([new Uint8Array([0])], name, { type });
}

/** Builds flat RGBA pixel data from a list of alpha values (RGB fixed opaque-ish, alpha is what matters). */
function rgba(alphas: number[]): Uint8ClampedArray {
   const data = new Uint8ClampedArray(alphas.length * 4);
   alphas.forEach((a, i) => {
      data[i * 4 + 0] = 255;
      data[i * 4 + 1] = 255;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = a;
   });
   return data;
}

describe('isSvgMask', () => {
   it('routes an SVG by its MIME type', () => {
      expect(isSvgMask(makeFile('shape', 'image/svg+xml'))).toBe(true);
   });

   it('routes an SVG by its .svg extension even when the MIME is blank', () => {
      expect(isSvgMask(makeFile('shape.svg', ''))).toBe(true);
      expect(isSvgMask(makeFile('SHAPE.SVG', ''))).toBe(true);
   });

   it('treats a PNG / WebP as a raster (not SVG)', () => {
      expect(isSvgMask(makeFile('shape.png', 'image/png'))).toBe(false);
      expect(isSvgMask(makeFile('shape.webp', 'image/webp'))).toBe(false);
   });
});

describe('hasTransparency', () => {
   it('is true when any pixel is below fully opaque', () => {
      expect(hasTransparency(rgba([255, 255, 0, 255]))).toBe(true);
      expect(hasTransparency(rgba([255, 128, 255]))).toBe(true);
   });

   it('is false when every pixel is fully opaque (would mask nothing)', () => {
      expect(hasTransparency(rgba([255, 255, 255, 255]))).toBe(false);
   });

   it('is false for empty data', () => {
      expect(hasTransparency(new Uint8ClampedArray(0))).toBe(false);
   });
});
