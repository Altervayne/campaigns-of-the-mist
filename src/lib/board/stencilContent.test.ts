// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { resolveStencilSourceHash, stenciledImageContent, resetImageContent } from './stencilContent';

// -- Type Imports --
import type { ImageBoardContent } from '@/lib/types/board';

/*
 * The stencil never stacks masks: it always resolves the un-masked original, then either bakes a new
 * masked asset (keeping that original as `sourceAssetId`) or drops back to the plain original. These
 * cover source resolution and the masked-vs-reset content shapes; the canvas bake/store is browser-only.
 */

describe('resolveStencilSourceHash', () => {
   it('uses the plain assetId for an unmasked image', () => {
      const content: ImageBoardContent = { kind: 'image', assetId: 'orig', fit: 'cover' };
      expect(resolveStencilSourceHash(content)).toBe('orig');
   });

   it('uses sourceAssetId for an already-masked image, ignoring the baked assetId', () => {
      const content: ImageBoardContent = { kind: 'image', assetId: 'baked', fit: 'cover', sourceAssetId: 'orig', maskId: 'hexagon' };
      expect(resolveStencilSourceHash(content)).toBe('orig');
   });

   it('is null for an empty image box', () => {
      const content: ImageBoardContent = { kind: 'image', assetId: null, fit: 'contain' };
      expect(resolveStencilSourceHash(content)).toBeNull();
   });
});

describe('stenciledImageContent', () => {
   it('shows the baked asset, keeps the source, records the mask, and preserves fit', () => {
      expect(stenciledImageContent('baked', 'orig', 'hexagon', 'contain')).toEqual({
         kind: 'image',
         assetId: 'baked',
         fit: 'contain',
         sourceAssetId: 'orig',
         maskId: 'hexagon',
      });
   });

   it('re-masking keeps the same source while swapping the baked asset and mask', () => {
      const masked: ImageBoardContent = { kind: 'image', assetId: 'baked1', fit: 'cover', sourceAssetId: 'orig', maskId: 'hexagon' };
      const source = resolveStencilSourceHash(masked)!;
      const next = stenciledImageContent('baked2', source, 'torn-edge', masked.fit);
      expect(next.sourceAssetId).toBe('orig');
      expect(next.assetId).toBe('baked2');
      expect(next.maskId).toBe('torn-edge');
   });
});

describe('resetImageContent', () => {
   it('drops the mask fields and returns to the plain original', () => {
      expect(resetImageContent('orig', 'cover')).toEqual({ kind: 'image', assetId: 'orig', fit: 'cover' });
   });

   it('resetting a masked image restores its resolved source', () => {
      const masked: ImageBoardContent = { kind: 'image', assetId: 'baked', fit: 'contain', sourceAssetId: 'orig', maskId: 'organic-blob' };
      const source = resolveStencilSourceHash(masked)!;
      const next = resetImageContent(source, masked.fit);
      expect(next).toEqual({ kind: 'image', assetId: 'orig', fit: 'contain' });
      expect(next.sourceAssetId).toBeUndefined();
      expect(next.maskId).toBeUndefined();
   });
});
