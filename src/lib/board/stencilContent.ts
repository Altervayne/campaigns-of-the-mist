/*
 * Pure content-derivation for image stenciling: turns an image item's current content plus a mask
 * choice into the next `ImageBoardContent`. The bake (`stencilImage`) and store (`storeAsset`) are the
 * impure, browser-only side and live in the hook; this module only shapes the resulting content so the
 * two-asset invariant (baked `assetId` + kept `sourceAssetId`) is decided in one tested place.
 */

// -- Type Imports --
import type { ImageBoardContent } from '@/lib/types/board';

/**
 * A reference to the mask an applied stencil records: a `preset` shape (by its bundled id) or a `library`
 * stencil (by its library entry id). Exactly one is applied at a time, so the content carries `maskId` XOR
 * `stencilId`.
 */
export type StencilMaskRef = { preset: string } | { library: string };

/**
 * The un-masked original a stencil always operates on, so masks never stack: an already-masked item
 * re-runs on its kept `sourceAssetId`, an unmasked one on its own `assetId`. Null when the box is empty.
 */
export function resolveStencilSourceHash(content: ImageBoardContent): string | null {
   return content.sourceAssetId ?? content.assetId;
}

/**
 * Builds the content for applying a mask: `assetId` becomes the baked result, `sourceAssetId` keeps the
 * original for a later re-mask/reset, and the mask is recorded as EITHER `maskId` (preset) or `stencilId`
 * (library) - never both. Re-masking passes the same `sourceHash`, so the source is preserved and only the
 * baked asset (and the mask reference) changes.
 */
export function stenciledImageContent(
   bakedHash: string,
   sourceHash: string,
   mask: StencilMaskRef,
   fit: ImageBoardContent['fit'],
): ImageBoardContent {
   const base: ImageBoardContent = { kind: 'image', assetId: bakedHash, fit, sourceAssetId: sourceHash };
   return 'preset' in mask ? { ...base, maskId: mask.preset } : { ...base, stencilId: mask.library };
}

/**
 * Builds the content for clearing a mask (reset to rectangle): back to the plain original, dropping
 * `sourceAssetId`/`maskId` so the item reads as unmasked. The old baked asset becomes unreferenced and
 * the garbage collector reclaims it.
 */
export function resetImageContent(sourceHash: string, fit: ImageBoardContent['fit']): ImageBoardContent {
   return { kind: 'image', assetId: sourceHash, fit };
}

/**
 * Flips `fit` while preserving every other field. Critically keeps `sourceAssetId`/`maskId`/`stencilId` -
 * rebuilding the content from scratch here would strand a stenciled image's original (GC-reclaimed) and
 * make a re-mask bake on top of the already-baked asset.
 */
export function toggleImageFit(content: ImageBoardContent): ImageBoardContent {
   return { ...content, fit: content.fit === 'cover' ? 'contain' : 'cover' };
}
