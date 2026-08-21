// -- Asset Pipeline Imports --
import { normalizeMaskUpload } from '@/lib/assets/normalizeMaskUpload';
import { storeAsset } from '@/lib/assets/assetRepository';
import { useStencilLibraryStore } from '@/lib/stores/stencilLibraryStore';

// -- Type Imports --
import type { StencilRecord } from '@/lib/assets/stencilRecords';

/*
 * The one upload-to-library path, shared by the picker's quick-add and the manager's "Add stencil": normalize
 * the picked mask (SVG via secure `<img>`, raster as-is), store its alpha-mask asset (dedup-aware), then mint a
 * library entry owning it. The entry is the asset's sole GC keeper. Throws `MaskHasNoTransparencyError` (and any
 * decode/store error) up to the caller, which owns the friendly toast.
 */
export async function addUploadedStencil(file: File, fallbackName: string): Promise<StencilRecord> {
   const processed = await normalizeMaskUpload(file);
   const maskAssetId = await storeAsset(processed);
   return useStencilLibraryStore.getState().actions.add(stencilNameFromFile(file, fallbackName), maskAssetId);
}

/** The default name an uploaded stencil takes: the file's base name sans extension, or a fallback when empty. */
function stencilNameFromFile(file: File, fallback: string): string {
   const base = file.name.replace(/\.[^./]+$/, '').trim();
   return base || fallback;
}
