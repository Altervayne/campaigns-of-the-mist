// -- React Imports --
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Component Imports --
import { ImageStencilDialog, type StencilSelection } from '@/components/molecules/ImageStencilDialog';

// -- Pipeline / Asset Store --
import { stencilImage } from '@/lib/assets/stencilImage';
import { processImage } from '@/lib/assets/processImage';
import { storeAsset, getAssetBlob } from '@/lib/assets/assetRepository';
import { MaskHasNoTransparencyError } from '@/lib/assets/normalizeMaskUpload';

// -- Mask Library + Content Derivation --
import { getMaskPreset } from '@/lib/board/maskPresets';
import { resolveStencilSourceHash, stenciledImageContent, resetImageContent } from '@/lib/board/stencilContent';
import { useStencilLibraryStore } from '@/lib/stores/stencilLibraryStore';
import { addUploadedStencil } from '@/lib/stores/addUploadedStencil';

// -- Type Imports --
import type { ImageBoardContent } from '@/lib/types/board';

/*
 * The stencil step for a board image item: `open(content)` resolves the un-masked source, decodes it, and
 * mounts the shape dialog; Apply either bakes source x mask into a NEW asset (keeping the source) or clears
 * the mask back to the plain original, then hands the next content to `onApplied`. The stencil always runs
 * on the source (`sourceAssetId ?? assetId`), so masks never stack. A mask is a preset shape OR a user
 * stencil-LIBRARY entry (its owned alpha mask read back and baked). An upload from the picker mints a real
 * library entry (quick-add) - the entry keeps its mask asset alive. Render `dialog` alongside the item.
 */

interface StencilSession {
   /** The item content the stencil opened on, for `fit` and the resolved source. */
   content: ImageBoardContent;
   /** The un-masked source hash the bake reads and the reset returns to. */
   sourceHash: string;
   /** The decoded source, baked on Apply and closed on settle. */
   bitmap: ImageBitmap;
   /** Object URL of the source, for the dialog's live preview. */
   previewUrl: string;
   /** The mask pre-selected when re-opening an already-masked image (preset id or a live library entry). */
   initialSelection: StencilSelection;
}

export interface UseImageStencil {
   /** Opens the stencil dialog on `content`'s un-masked source; a no-op for an empty image box. */
   open: (content: ImageBoardContent) => void;
   /** The mounted dialog while stenciling, else null; render it near the item. */
   dialog: React.ReactNode;
   /** True while the bake/store runs after Apply, for a spinner. */
   isProcessing: boolean;
}

export function useImageStencil(onApplied: (content: ImageBoardContent) => void): UseImageStencil {
   const { t } = useTranslation();
   const [session, setSession] = useState<StencilSession | null>(null);
   const [isProcessing, setIsProcessing] = useState(false);

   const open = useCallback((content: ImageBoardContent) => {
      const sourceHash = resolveStencilSourceHash(content);
      if (!sourceHash) return;
      void (async () => {
         try {
            await useStencilLibraryStore.getState().actions.load();
            const blob = await getAssetBlob(sourceHash);
            if (!blob) throw new Error('Source asset not found');
            const bitmap = await createImageBitmap(blob);
            // A `stencilId` is a SOFT reference: a deleted (unresolvable) entry degrades to None, never a crash.
            const libraryLive = content.stencilId
               ? useStencilLibraryStore.getState().stencils.some((entry) => entry.id === content.stencilId)
               : false;
            const initialSelection: StencilSelection = libraryLive
               ? { kind: 'library', id: content.stencilId! }
               : content.maskId
                  ? { kind: 'preset', id: content.maskId }
                  : null;
            setSession({ content, sourceHash, bitmap, previewUrl: URL.createObjectURL(blob), initialSelection });
         } catch {
            toast.error(t('BoardStencil.applyFailed'));
         }
      })();
   }, [t]);

   // Closes out the active session: release the decode + preview URL, clear the dialog.
   const settle = (current: StencilSession) => {
      current.bitmap.close();
      URL.revokeObjectURL(current.previewUrl);
      setSession(null);
      setIsProcessing(false);
   };

   // Quick-add: normalizes + stores an uploaded mask, mints a library entry owning it (default name = the
   // file's base name), and returns the entry as the selection. Surfaces a friendly warning / error on failure.
   const quickAddToLibrary = async (file: File): Promise<StencilSelection> => {
      try {
         const record = await addUploadedStencil(file, t('BoardStencil.untitledStencil'));
         return { kind: 'library', id: record.id };
      } catch (error) {
         toast.error(error instanceof MaskHasNoTransparencyError ? t('BoardStencil.maskNoTransparency') : t('BoardStencil.maskUploadFailed'));
         return null;
      }
   };

   const apply = async (current: StencilSession, selection: StencilSelection) => {
      // "None": drop back to the plain original, no bake.
      if (selection === null) {
         const next = resetImageContent(current.sourceHash, current.content.fit);
         settle(current);
         onApplied(next);
         return;
      }
      setIsProcessing(true);
      try {
         const baked = selection.kind === 'preset'
            ? await bakePreset(current.bitmap, selection.id)
            : await bakeLibrary(current.bitmap, selection.id);
         if (!baked) {
            setIsProcessing(false);
            return;
         }
         const processed = await processImage(baked);
         const bakedHash = await storeAsset(processed);
         const maskRef = selection.kind === 'preset' ? { preset: selection.id } : { library: selection.id };
         const next = stenciledImageContent(bakedHash, current.sourceHash, maskRef, current.content.fit);
         settle(current);
         onApplied(next);
      } catch {
         toast.error(t('BoardStencil.applyFailed'));
         setIsProcessing(false);
      }
   };

   const dialog = session ? (
      <ImageStencilDialog
         key={session.previewUrl}
         imageUrl={session.previewUrl}
         initialSelection={session.initialSelection}
         isProcessing={isProcessing}
         onQuickAdd={quickAddToLibrary}
         onCancel={() => settle(session)}
         onApply={(selection) => void apply(session, selection)}
      />
   ) : null;

   return { open, dialog, isProcessing };
}

/** Bakes a preset shape onto the source, or null when the preset id is unknown (e.g. a removed preset). */
async function bakePreset(source: ImageBitmap, id: string): Promise<Blob | null> {
   const preset = getMaskPreset(id);
   if (!preset) return null;
   return stencilImage(source, { kind: 'preset', path: preset.path, viewBox: preset.viewBox });
}

/** Bakes a library entry's owned mask onto the source, or null when the entry / its mask asset is gone. */
async function bakeLibrary(source: ImageBitmap, stencilId: string): Promise<Blob | null> {
   const entry = useStencilLibraryStore.getState().stencils.find((candidate) => candidate.id === stencilId);
   if (!entry) return null;
   const blob = await getAssetBlob(entry.maskAssetId);
   if (!blob) return null;
   const bitmap = await createImageBitmap(blob);
   try {
      return await stencilImage(source, { kind: 'raster', bitmap });
   } finally {
      bitmap.close();
   }
}
