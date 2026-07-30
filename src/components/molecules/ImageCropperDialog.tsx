// -- React Imports --
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Loader2, RotateCcw, RotateCw, Undo2 } from 'lucide-react';

// -- Basic UI Imports --
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { CropSurface } from '@/components/molecules/CropSurface';

// -- Hook Imports --
import { useDeviceType } from '@/hooks/useDeviceType';

// -- Pipeline --
import { cropImage, type CropRegion } from '@/lib/assets/cropImage';

/*
 * The crop dialog: the image sits on a resizable crop frame (our own stage), and the framed region is
 * what gets cut. The header carries a live preview of the framed result in its own shape; the footer
 * cuts on Accept via the canvas, resolving the blob for the downstream clamp + webp encode. Cancel/Esc
 * resolve nothing. Fixed frame colors live in the stage; all chrome here stays on tokens.
 */

/** Below this on the short edge the cut warns as low-resolution; it never blocks Accept. */
const MIN_CROP_EDGE_PX = 200;

interface ImageCropperDialogProps {
   /** Object URL of the source, for the stage. */
   imageUrl: string;
   /** The decoded, EXIF-oriented source the cut is taken from. */
   bitmap: ImageBitmap;
   /** Locked destination ratio (width / height), or `'free'` for a free crop. */
   aspect: number | 'free';
   onCancel: () => void;
   onComplete: (blob: Blob) => void;
}

export function ImageCropperDialog({ imageUrl, bitmap, aspect, onCancel, onComplete }: ImageCropperDialogProps) {
   const { t } = useTranslation();
   const { isMobile } = useDeviceType();
   const [rotation, setRotation] = useState(0);
   const [region, setRegion] = useState<CropRegion | null>(null);
   const [resetKey, setResetKey] = useState(0);
   const [isCutting, setIsCutting] = useState(false);

   const lockedAspect = aspect === 'free' ? undefined : aspect;
   const lowResolution = region !== null && Math.min(region.width, region.height) < MIN_CROP_EDGE_PX;

   const reset = () => {
      setRotation(0);
      setResetKey((current) => current + 1);
   };

   const accept = async () => {
      if (!region) return;
      setIsCutting(true);
      try {
         onComplete(await cropImage(bitmap, region, rotation));
      } catch {
         setIsCutting(false);
      }
   };

   // Mobile takes the whole viewport: a top-to-bottom sheet with the stage filling the height between a
   // fixed control bar and the accept/cancel footer, both clear of the device insets.
   if (isMobile) {
      return (
         <Dialog open onOpenChange={(open) => !open && onCancel()}>
            <DialogContent
               showCloseButton={false}
               className="left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none"
            >
               {/* Header: title + a live preview of the crop in its own shape. */}
               <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 pt-safe">
                  <DialogTitle className="text-base">{t('ImageCropper.title')}</DialogTitle>
                  <DestinationPreview imageUrl={imageUrl} region={region} rotation={rotation} source={bitmap} />
               </div>

               {/* Stage: fills the space between the header and the controls. */}
               <div className="min-h-0 w-full flex-1 bg-muted">
                  <CropSurface
                     image={imageUrl}
                     sourceWidth={bitmap.width}
                     sourceHeight={bitmap.height}
                     rotation={rotation}
                     aspect={lockedAspect}
                     resetKey={resetKey}
                     onCropChange={setRegion}
                  />
               </div>

               {/* Control bar: the rotate pair, then reset set apart. */}
               <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
                  <IconButton type="button" variant="ghost" onClick={() => setRotation((current) => (current + 270) % 360)} aria-label={t('ImageCropper.rotateCcw')} title={t('ImageCropper.rotateCcw')}>
                     <RotateCcw className="h-5 w-5" />
                  </IconButton>
                  <IconButton type="button" variant="ghost" onClick={() => setRotation((current) => (current + 90) % 360)} aria-label={t('ImageCropper.rotateCw')} title={t('ImageCropper.rotateCw')}>
                     <RotateCw className="h-5 w-5" />
                  </IconButton>
                  <IconButton type="button" variant="ghost" onClick={reset} className="ml-auto" aria-label={t('ImageCropper.reset')} title={t('ImageCropper.reset')}>
                     <Undo2 className="h-5 w-5" />
                  </IconButton>
               </div>

               {lowResolution && <p className="shrink-0 px-4 pb-1 text-sm text-muted-foreground">{t('ImageCropper.lowResolution')}</p>}

               {/* Footer: full-width touch targets. The safe-area inset adds to the base padding so the
                   bottom gutter survives on devices without a home indicator. */}
               <div className="flex shrink-0 gap-2 border-t border-border px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                  <Button type="button" variant="outline" onClick={onCancel} className="h-11 flex-1 cursor-pointer">{t('ImageCropper.cancel')}</Button>
                  <Button type="button" onClick={accept} disabled={!region || isCutting} className="h-11 flex-1 cursor-pointer">
                     {isCutting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                     {t('ImageCropper.apply')}
                  </Button>
               </div>
            </DialogContent>
         </Dialog>
      );
   }

   return (
      <Dialog open onOpenChange={(open) => !open && onCancel()}>
         <DialogContent showCloseButton={false} className="max-w-3xl gap-0 overflow-hidden p-0">
            {/* Header: title + a live preview of the crop in its own shape. */}
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
               <DialogTitle className="text-base">{t('ImageCropper.title')}</DialogTitle>
               <DestinationPreview imageUrl={imageUrl} region={region} rotation={rotation} source={bitmap} />
            </div>

            {/* Stage: the image under a resizable crop frame. */}
            <div className="h-[min(60vh,480px)] w-full bg-muted">
               <CropSurface
                  image={imageUrl}
                  sourceWidth={bitmap.width}
                  sourceHeight={bitmap.height}
                  rotation={rotation}
                  aspect={lockedAspect}
                  resetKey={resetKey}
                  onCropChange={setRegion}
               />
            </div>

            {/* Control bar: the rotate pair, then reset set apart. */}
            <div className="flex items-center gap-2 border-t border-border px-4 py-3">
               <IconButton type="button" variant="ghost" size="sm" onClick={() => setRotation((current) => (current + 270) % 360)} aria-label={t('ImageCropper.rotateCcw')} title={t('ImageCropper.rotateCcw')}>
                  <RotateCcw className="h-4 w-4" />
               </IconButton>
               <IconButton type="button" variant="ghost" size="sm" onClick={() => setRotation((current) => (current + 90) % 360)} aria-label={t('ImageCropper.rotateCw')} title={t('ImageCropper.rotateCw')}>
                  <RotateCw className="h-4 w-4" />
               </IconButton>
               <IconButton type="button" variant="ghost" size="sm" onClick={reset} className="ml-auto" aria-label={t('ImageCropper.reset')} title={t('ImageCropper.reset')}>
                  <Undo2 className="h-4 w-4" />
               </IconButton>
            </div>

            {lowResolution && <p className="px-4 pb-2 text-sm text-muted-foreground">{t('ImageCropper.lowResolution')}</p>}

            <DialogFooter className="border-t border-border px-4 py-3">
               <Button type="button" variant="outline" onClick={onCancel} className="cursor-pointer">{t('ImageCropper.cancel')}</Button>
               <Button type="button" onClick={accept} disabled={!region || isCutting} className="cursor-pointer">
                  {isCutting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {t('ImageCropper.apply')}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/**
 * A small chip previewing the framed region in its own shape. Mirrors the stage's transform: the source
 * sits rotated in its bounding box, and the box is offset + scaled so the region fills the chip.
 */
function DestinationPreview({ imageUrl, region, rotation, source }: {
   imageUrl: string;
   region: CropRegion | null;
   rotation: number;
   source: ImageBitmap;
}) {
   const CHIP_HEIGHT = 44;
   const ratio = region ? region.width / region.height : source.width / source.height;
   const chipWidth = CHIP_HEIGHT * ratio;

   const layout = useMemo(() => {
      if (!region) return null;
      const scale = CHIP_HEIGHT / region.height;
      const radians = (rotation * Math.PI) / 180;
      const sin = Math.abs(Math.sin(radians));
      const cos = Math.abs(Math.cos(radians));
      const boxWidth = source.width * cos + source.height * sin;
      const boxHeight = source.width * sin + source.height * cos;
      return {
         boxWidth: boxWidth * scale,
         boxHeight: boxHeight * scale,
         offsetX: -region.x * scale,
         offsetY: -region.y * scale,
         imageWidth: source.width * scale,
         imageHeight: source.height * scale,
      };
   }, [region, rotation, source]);

   return (
      <div className="relative shrink-0 overflow-hidden rounded-md border border-border bg-muted" style={{ width: chipWidth, height: CHIP_HEIGHT }}>
         {layout && (
            <div className="absolute" style={{ left: layout.offsetX, top: layout.offsetY, width: layout.boxWidth, height: layout.boxHeight }}>
               <img
                  src={imageUrl}
                  alt=""
                  className="absolute left-1/2 top-1/2 max-w-none"
                  style={{ width: layout.imageWidth, height: layout.imageHeight, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
               />
            </div>
         )}
      </div>
   );
}
