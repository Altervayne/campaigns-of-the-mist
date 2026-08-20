// -- React Imports --
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Component Imports --
import { ImageStencilDialog } from '@/components/molecules/ImageStencilDialog';

// -- Pipeline / Asset Store --
import { stencilImage } from '@/lib/assets/stencilImage';
import { processImage } from '@/lib/assets/processImage';
import { storeAsset, getAssetBlob } from '@/lib/assets/assetRepository';

// -- Mask Library + Content Derivation --
import { getMaskPreset } from '@/lib/board/maskPresets';
import { resolveStencilSourceHash, stenciledImageContent, resetImageContent } from '@/lib/board/stencilContent';

// -- Type Imports --
import type { ImageBoardContent } from '@/lib/types/board';

/*
 * The stencil step for a board image item: `open(content)` resolves the un-masked source, decodes it, and
 * mounts the shape dialog; Apply either bakes source x mask into a NEW asset (keeping the source) or clears
 * the mask back to the plain original, then hands the next content to `onApplied`. The stencil always runs
 * on the source (`sourceAssetId ?? assetId`), so masks never stack. Render `dialog` alongside the item.
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
            const blob = await getAssetBlob(sourceHash);
            if (!blob) throw new Error('Source asset not found');
            const bitmap = await createImageBitmap(blob);
            setSession({ content, sourceHash, bitmap, previewUrl: URL.createObjectURL(blob) });
         } catch {
            toast.error(t('BoardStencil.applyFailed'));
         }
      })();
   }, [t]);

   // Closes out the active session: release the decode + preview URL, clear the dialog and spinner.
   const settle = (current: StencilSession) => {
      current.bitmap.close();
      URL.revokeObjectURL(current.previewUrl);
      setSession(null);
      setIsProcessing(false);
   };

   const apply = async (current: StencilSession, maskId: string | null) => {
      // "None": drop back to the plain original, no bake.
      if (maskId === null) {
         const next = resetImageContent(current.sourceHash, current.content.fit);
         settle(current);
         onApplied(next);
         return;
      }
      const preset = getMaskPreset(maskId);
      if (!preset) return;
      setIsProcessing(true);
      try {
         const baked = await stencilImage(current.bitmap, preset.path, preset.viewBox);
         const processed = await processImage(baked);
         const bakedHash = await storeAsset(processed);
         const next = stenciledImageContent(bakedHash, current.sourceHash, maskId, current.content.fit);
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
         initialMaskId={session.content.maskId ?? null}
         isProcessing={isProcessing}
         onCancel={() => settle(session)}
         onApply={(maskId) => void apply(session, maskId)}
      />
   ) : null;

   return { open, dialog, isProcessing };
}
