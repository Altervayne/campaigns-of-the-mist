// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Custom Hooks --
import { useAssetObjectUrl } from '@/hooks/useAssetObjectUrl';

// -- Local Imports --
import { parseImageHint, clampImageAspect } from '@/lib/notes/noteImageHint';
import { IMAGE_ALIGN_MAX_HEIGHT, IMAGE_ALIGN_WRAPPER, IMAGE_INNER, IMAGE_INNER_COVER, IMAGE_PLACEHOLDER, imageCaptionClass } from './noteImageClasses';

// -- Type Imports --
import type { NoteImageAlign } from '@/lib/notes/noteImageHint';

/*
 * The Note surface's OWN inline-image renderer. Inline images ride inside the markdown body as
 * `![alt](asset:<hash> "align width")`, a custom `asset:` scheme + a layout hint in the title. This
 * resolves the hash through `useAssetObjectUrl` and renders the image in-flow on the Paper palette as an
 * aligned BLOCK (left / center / right / full) with NO text wrapping beside it - block-styled spans, NOT
 * <figure>/<figcaption>, which are invalid inside react-markdown's image-wrapping <p>. Reading and the CM6
 * Live editor render the identical block (shared `noteImageClasses`), so a mode switch never jumps. Images
 * do not float: a float is out of normal flow, which blinds the Live editor's cursor line-math.
 *
 * SAFETY: it renders an <img> ONLY for the `asset:` scheme. Any other src - `http(s):`, a bare path,
 * anything - falls back to alt text only, so an imported (untrusted) note can never phone home on display.
 * This is Note-scoped; the shared card/board `img` renderer stays alt-text-only and is NOT loosened.
 *
 * LAYOUT: align + width% live in the title, parsed by `parseImageHint` (the single grammar home). Width%
 * resolves against the prose measure (the 68ch column), never the sheet; `full` ignores width (always 100%).
 */

/** Reads the `asset:<hash>` hash out of a src, or `null` when the src is any other (untrusted) scheme. */
function assetHashFromSrc(src: string | undefined): string | null {
   if (!src) return null;
   const match = /^asset:([0-9a-f]{6,})$/.exec(src.trim());
   return match ? match[1] : null;
}

/**
 * A block-styled "figure" span for one asset image, aligned within the measure. `full` pins to 100% of the
 * measure; every other align applies `widthPct` as an inline `width` against the prose column.
 * `break-inside-avoid` keeps the image + caption from splitting a page (print-ready, harmless on screen).
 * The class-strings are the shared `noteImageClasses`, so the CM6 live-editor widget renders an identical figure.
 */
function AssetFigure({ hash, alt, align, widthPct, aspect }: { hash: string; alt: string; align: NoteImageAlign; widthPct: number; aspect: number | null }) {
   const { url } = useAssetObjectUrl(hash);
   // Width resolves against the prose measure; full ignores it. Left/right/center get an inline % width.
   const widthStyle = align === 'full' ? undefined : { width: `${widthPct}%` };

   return (
      <span className={cn('break-inside-avoid', IMAGE_ALIGN_WRAPPER[align])} style={widthStyle}>
         {url ? (
            aspect != null ? (
               // BOX mode (resized): the image fills a fixed-ratio box via object-fit:cover, like the cover.
               <img src={url} alt={alt} draggable={false} className={cn(IMAGE_INNER_COVER, IMAGE_ALIGN_MAX_HEIGHT[align])} style={{ aspectRatio: `1 / ${clampImageAspect(aspect)}` }} />
            ) : (
               // NATURAL mode: the image at its own ratio (object-contain).
               <img src={url} alt={alt} draggable={false} className={cn(IMAGE_INNER, IMAGE_ALIGN_MAX_HEIGHT[align])} />
            )
         ) : (
            // Loading, or a missing/reclaimed blob: a quiet placeholder frame, never a broken-image glyph.
            <span className={IMAGE_PLACEHOLDER}>{alt || '…'}</span>
         )}
         {alt ? <span className={imageCaptionClass(align)}>{alt}</span> : null}
      </span>
   );
}

/**
 * The `img` component for the Note doc markdown map. Renders an `asset:` image in-flow with its layout
 * hint; any other src degrades to alt text (or nothing), preserving the untrusted-content safety.
 */
export function NoteImage({ src, alt, title }: { src?: string; alt?: string; title?: string }) {
   const hash = assetHashFromSrc(src);
   const altText = alt ?? '';

   if (!hash) {
      // Non-asset (untrusted) src: alt text only, never an outbound <img> request.
      return altText ? <span className="opacity-70">{altText}</span> : null;
   }

   const { align, widthPct, aspect } = parseImageHint(title);
   return <AssetFigure hash={hash} alt={altText} align={align} widthPct={widthPct} aspect={aspect} />;
}
