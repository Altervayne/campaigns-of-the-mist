/*
 * Pure CSS derivation for board image styling (frame / border / shadow / opacity / filter / brightness).
 * Kept framework-free so the filter chain, the shadow depths, and the frame-plate spec are unit-testable;
 * the DOM render (which element carries which value) stays in the component.
 */

// -- Type Imports --
import type { ImageBorder, ImageFilter, ImageFrame, ImageShadow } from '@/lib/types/board';

/*
 * Physical-photo colors, the matte stock a framed board photo mounts on. Deliberately NOT theme tokens: a
 * frame is meant to read as real photo paper (a warm off-white), the same intentional-physical-color license
 * the card palettes take.
 */
export const IMAGE_FRAME_MATTE = '#f7f4ec';
export const IMAGE_SLIDE_MATTE = '#e7e3d6';
/** The corkboard tape strip: a translucent warm masking-tape tint. */
export const IMAGE_TAPE_COLOR = 'rgba(214, 199, 145, 0.5)';

/** A fresh border's defaults (near-black outline, a classic frame line). Its color is a curated palette entry. */
export const DEFAULT_IMAGE_BORDER: ImageBorder = { color: '#0f172a', width: 2, radius: 0 };

/**
 * The color-filter chain for the `<img>`: the named look, then brightness / contrast / saturation
 * multipliers, all optional. A unit (or absent) multiplier contributes nothing, and no look plus all-unit
 * multipliers yields `undefined` (no filter). A masked image joins its shape-following drop-shadow to this
 * chain at the call site. Adjustments compose after the look, so noir's own contrast and a contrast slider
 * stack as intended.
 */
export function imageFilterCss(filter?: ImageFilter, brightness?: number, contrast?: number, saturation?: number): string | undefined {
   const parts: string[] = [];
   if (filter === 'grayscale') parts.push('grayscale(1)');
   else if (filter === 'sepia') parts.push('sepia(0.85)');
   else if (filter === 'noir') parts.push('grayscale(1) contrast(1.4)');
   if (brightness !== undefined && brightness !== 1) parts.push(`brightness(${brightness})`);
   if (contrast !== undefined && contrast !== 1) parts.push(`contrast(${contrast})`);
   if (saturation !== undefined && saturation !== 1) parts.push(`saturate(${saturation})`);
   return parts.length > 0 ? parts.join(' ') : undefined;
}

/*
 * One depth scale shared by both shadow paths, so a `sm`/`md`/`lg` reads the same whether it is drawn as a
 * container box-shadow (unmasked) or a shape-following drop-shadow (masked).
 */
const SHADOW_DEPTH: Record<ImageShadow, { y: number; blur: number; alpha: number }> = {
   sm: { y: 1, blur: 4, alpha: 0.25 },
   md: { y: 4, blur: 10, alpha: 0.3 },
   lg: { y: 10, blur: 24, alpha: 0.35 },
};

/** The container `box-shadow` for an unmasked image; absent shadow yields `undefined`. */
export function imageBoxShadowCss(shadow?: ImageShadow): string | undefined {
   if (!shadow) return undefined;
   const { y, blur, alpha } = SHADOW_DEPTH[shadow];
   return `0 ${y}px ${blur}px rgba(0, 0, 0, ${alpha})`;
}

/** A `drop-shadow(...)` filter token for a masked image, so the shadow follows the shape's alpha; absent yields `undefined`. */
export function imageDropShadowCss(shadow?: ImageShadow): string | undefined {
   if (!shadow) return undefined;
   const { y, blur, alpha } = SHADOW_DEPTH[shadow];
   return `drop-shadow(0 ${y}px ${blur}px rgba(0, 0, 0, ${alpha}))`;
}

/** A frame's matte plate: the padding revealed around the image, the plate color, and its corner radius. */
export interface FramePlateSpec {
   padding: string;
   background: string;
   radius: number;
}

/**
 * The matte-plate look for a framed rectangular image. `polaroid` reveals an even margin with a heavier
 * bottom lip (the instant-photo caption strip); `matte` is an even card mount; `slide` is a thicker uniform
 * mount in a cooler stock. `tape` has no plate (a bare image with corner strips) and absent has none, so both
 * yield `null`.
 */
export function framePlateSpec(frame?: ImageFrame): FramePlateSpec | null {
   switch (frame) {
      case 'polaroid':
         return { padding: '6% 6% 20% 6%', background: IMAGE_FRAME_MATTE, radius: 2 };
      case 'matte':
         return { padding: '7%', background: IMAGE_FRAME_MATTE, radius: 2 };
      case 'slide':
         return { padding: '10%', background: IMAGE_SLIDE_MATTE, radius: 4 };
      default:
         return null;
   }
}
