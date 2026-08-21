// -- React Imports --
import type { CSSProperties } from 'react';

// -- Asset Imports --
import { useAssetObjectUrl } from '@/hooks/useAssetObjectUrl';

// -- Utils Imports --
import { cn } from '@/lib/utils';

/*
 * Paints one stencil's alpha mask as a monochrome glyph: a box filled with the current text color, clipped to
 * the mask's opaque region via CSS `mask-image` (contain-fit, so the shape keeps its own aspect). Shared by the
 * picker's library tiles and the library manager's rows so both read a mask the same way. Renders nothing until
 * the asset URL resolves (an empty frame, never a broken glyph).
 */
export function StencilMaskGlyph({ maskAssetId, className }: { maskAssetId: string; className?: string }) {
   const { url } = useAssetObjectUrl(maskAssetId);
   if (!url) return null;
   return <div className={cn('h-full w-full', className)} style={{ backgroundColor: 'currentColor', ...maskGlyphStyle(url) }} />;
}

/** The contain-fit mask CSS that clips the box to the mask's shape (its own aspect kept, centered). */
function maskGlyphStyle(url: string): CSSProperties {
   return {
      WebkitMaskImage: `url(${url})`,
      maskImage: `url(${url})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
   };
}
