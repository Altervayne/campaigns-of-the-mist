// -- Type Imports --
import type { CSSProperties } from 'react';
import type { BoardBackground, BoardTexture } from '@/lib/types/board';

/*
 * Pure CSS for the board surface backdrop: a fill color plus a color-agnostic texture overlay. The
 * textures are inline SVG-noise data URIs (no bundled asset, so the precache stays clean), layered OVER
 * the fill so the same grain reads as tooth over a warm color and as weave over a dark one. The layer
 * component only maps the returned style onto its div; the swatch previews reuse it too.
 */

/** Wraps a raw SVG in a URL-encoded data URI for `background-image`. */
function svgTexture(svg: string): string {
   return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** A grayscale fractal-noise tile: `freq` sets the grain scale (a pair skews it into threads), `alpha` its strength. */
function noiseTile(id: string, size: number, freq: string, alpha: number, octaves = 2): string {
   return svgTexture(
      `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
         `<filter id='${id}'>` +
         `<feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${octaves}' stitchTiles='stitch'/>` +
         `<feColorMatrix type='saturate' values='0'/>` +
         `<feComponentTransfer><feFuncA type='linear' slope='${alpha}'/></feComponentTransfer>` +
         `</filter>` +
         `<rect width='${size}' height='${size}' filter='url(#${id})'/>` +
      `</svg>`,
   );
}

/**
 * The CSS `background-image` stack for a texture, drawn over the fill. `paper` is a fine isotropic grain
 * (paper tooth); `linen` crosses two skewed-noise layers into a woven warp + weft. Both lean on the fill
 * (or the theme canvas) showing through their low alpha.
 */
const TEXTURE_IMAGE: Record<BoardTexture, string> = {
   paper: noiseTile('p', 160, '0.65', 0.16),
   linen: [noiseTile('lw', 120, '0.7 0.014', 0.12, 1), noiseTile('lf', 120, '0.014 0.7', 0.12, 1)].join(', '),
};

/** The tile size for each texture's repeat, so the pattern reads at a fixed on-screen scale. */
const TEXTURE_SIZE: Record<BoardTexture, string> = {
   paper: '160px 160px',
   linen: '120px 120px, 120px 120px',
};

/** True when a background carries nothing to paint (absent, or all fields cleared). */
function isEmpty(background: BoardBackground | undefined): background is undefined {
   return !background || (!background.color && !background.texture);
}

/**
 * The screen-space CSS for a board surface backdrop: the fill `backgroundColor` plus, when set, the
 * texture overlay. An empty background returns `{}`, so the layer paints nothing and the theme canvas
 * shows. A texture with no fill overlays the theme canvas directly.
 */
export function boardBackgroundStyle(background: BoardBackground | undefined): CSSProperties {
   if (isEmpty(background)) return {};
   const style: CSSProperties = {};
   if (background.color) style.backgroundColor = background.color;
   if (background.texture) {
      style.backgroundImage = TEXTURE_IMAGE[background.texture];
      style.backgroundSize = TEXTURE_SIZE[background.texture];
   }
   return style;
}

/**
 * Sets (or clears with `undefined`) the fill color, normalizing a fully-empty result to `undefined`
 * so an absent background is always the canonical "no backdrop" form.
 */
export function withBackgroundColor(background: BoardBackground | undefined, color: string | undefined): BoardBackground | undefined {
   const next: BoardBackground = { ...background, color };
   if (!color) delete next.color;
   return isEmpty(next) ? undefined : next;
}

/** Sets (or clears with `undefined`) the texture, normalizing a fully-empty result to `undefined`. */
export function withBackgroundTexture(background: BoardBackground | undefined, texture: BoardTexture | undefined): BoardBackground | undefined {
   const next: BoardBackground = { ...background, texture };
   if (!texture) delete next.texture;
   return isEmpty(next) ? undefined : next;
}
