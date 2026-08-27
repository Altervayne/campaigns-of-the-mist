// -- React Imports --
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Basic UI Imports --
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

// -- Icon Imports --
import { Image as ImageIcon, Scaling, Trash2, Upload } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { ACCEPT_IMAGE } from '@/lib/utils/fileAccept';

// -- Component Imports --
import { MistSpinner } from '@/components/molecules/MistSpinner';
import { ToolbarHandle } from '@/components/molecules/ToolbarHandle';

// -- Store and Hook Imports --
import { useCharacterActions } from '@/lib/stores/characterStore';
import { getActiveSheetZoom } from '@/lib/character/tabManagerStore';
import { useToolbarReveal } from '@/hooks/toolbarReveal';
import { useAssetObjectUrl } from '@/hooks/useAssetObjectUrl';
import { useImageUpload } from '@/hooks/useImageUpload';

// -- Constants --
import { IMAGE_CARD_PRESETS, LEGACY_IMAGE_CARD_SIZE, MAX_CARD_HEIGHT_PX, MAX_CARD_PX, clampCardHeight, clampCardWidth } from '@/lib/constants/imageCard';

// -- Type Imports --
import type { Card as CardData, ImageCardDetails } from '@/lib/types/character';
import type { CardComponentProps } from '@/components/organisms/cards/resolveCardComponent';

/*
 * The character portrait card, first consumer of the assets store. Game-agnostic:
 * it renders the same for every game and ignores `details.game`. The empty state
 * (`assetId === null`) is first-class - a persistent placeholder shown in both edit
 * and play mode, doubling as the upload affordance in edit mode. Card-level actions
 * (drag, delete, export) ride the shared ToolbarHandle like any sheet card; the
 * image-specific set/change/remove/resize controls live in the card body.
 *
 * The desktop sheet card renders at its persisted `details.width`/`height` (px); the
 * user resizes it from the bottom-right corner handle or the preset menu. Mobile fills
 * the card column at that persisted ASPECT (height from width:height, so the aspect
 * presets reshape it); the drawer preview keeps a fixed footprint.
 */

interface LiveSize {
   width: number;
   height: number;
}

const ImageCardContent = React.memo(
   React.forwardRef<HTMLDivElement, CardComponentProps>(
      ({ card, isEditing = false, isSnapshot, isDrawerPreview, isBoardEmbed = false, isMobile = false, dragAttributes, dragListeners, onExport }, ref) => {
         const { t } = useTranslation();
         const actions = useCharacterActions();
         const details = card.details as ImageCardDetails;

         const { isRevealed, revealHandlers } = useToolbarReveal(card.id, isDrawerPreview);
         const { url, isLoading } = useAssetObjectUrl(details.assetId);
         const { fileInputRef, open: openPicker, isProcessing, handleFileSelected, cropperDialog } = useImageUpload(
            (hash) => actions.setCardImage(card.id, hash),
            { aspect: 'free' },
         );
         const imgRef = useRef<HTMLImageElement>(null);

         // Static everywhere a snapshot is shown: drag overlay and drawer preview have
         // no controls and never open the picker.
         const interactive = isEditing && !isSnapshot && !isDrawerPreview;
         const showSpinner = isProcessing || (details.assetId !== null && isLoading);
         // Resizing is a desktop-sheet affordance; mobile keeps its carousel sizing.
         const canResize = interactive && !isMobile;

         // The committed size (with a legacy fallback for any card that slipped through
         // harmonization). During a corner drag, `liveSize` holds the in-progress size
         // for a lag-free preview; it commits to the store once on pointer-up.
         const [liveSize, setLiveSize] = useState<LiveSize | null>(null);
         const storedWidth = details.width || LEGACY_IMAGE_CARD_SIZE.width;
         const storedHeight = details.height || LEGACY_IMAGE_CARD_SIZE.height;
         // Clamp on read too, so a card stored taller than the current cap (or an
         // import) still renders within the row's height on the sheet.
         const cardWidth = liveSize?.width ?? clampCardWidth(storedWidth);
         const cardHeight = liveSize?.height ?? clampCardHeight(storedHeight);

         const altText = card.title || t('ImageCard.alt');

         // Downloads the raw image file (the stored webp), distinct from the .cotm export.
         // Uses the already-loaded object URL; a filesystem-friendly name from the title.
         const downloadName = (card.title.trim() || 'portrait').replace(/[^\w-]+/g, '_');
         const handleDownloadImage = () => {
            if (!url) return;
            const link = document.createElement('a');
            link.href = url;
            link.download = `${downloadName}.webp`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
         };

         // The loaded image's natural height/width ratio, for Shift-lock + "Fit to image".
         // Null when no image has decoded yet (Shift-lock becomes a no-op, "Fit" disabled).
         const naturalRatio = (): number | null => {
            const img = imgRef.current;
            if (img && img.naturalWidth > 0 && img.naturalHeight > 0) return img.naturalHeight / img.naturalWidth;
            return null;
         };

         // ==================
         //  Corner resize (custom drag)
         // ==================
         // Pointer capture keeps the drag on the handle; `stopPropagation` guards against
         // it ever starting the reorder drag (which is initiated from the ToolbarHandle).
         // The live size lives in state for preview and in a ref for a stale-free commit.
         const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number; zoom: number } | null>(null);
         const liveSizeRef = useRef<LiveSize | null>(null);

         const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
            if (!canResize) return;
            event.preventDefault();
            event.stopPropagation();
            // The card renders inside the sheet's zoom layer, so a screen-space cursor delta covers
            // `delta / zoom` card pixels - captured at grab so the resize tracks the cursor 1:1 at any zoom.
            resizeStartRef.current = { x: event.clientX, y: event.clientY, width: cardWidth, height: cardHeight, zoom: getActiveSheetZoom() };
            const initial = { width: cardWidth, height: cardHeight };
            liveSizeRef.current = initial;
            setLiveSize(initial);
            event.currentTarget.setPointerCapture(event.pointerId);
         };

         const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
            const start = resizeStartRef.current;
            if (!start) return;
            event.stopPropagation();
            const width = clampCardWidth(start.width + (event.clientX - start.x) / start.zoom);
            let height = clampCardHeight(start.height + (event.clientY - start.y) / start.zoom);
            // Shift locks to the image's natural aspect ratio (no-op without an image).
            if (event.shiftKey) {
               const ratio = naturalRatio();
               if (ratio) height = clampCardHeight(width * ratio);
            }
            const next = { width, height };
            liveSizeRef.current = next;
            setLiveSize(next);
         };

         const handleResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
            if (!resizeStartRef.current) return;
            event.stopPropagation();
            event.currentTarget.releasePointerCapture(event.pointerId);
            const final = liveSizeRef.current;
            resizeStartRef.current = null;
            liveSizeRef.current = null;
            setLiveSize(null);
            if (final) actions.setCardSize(card.id, final.width, final.height);
         };

         // Snaps the card to the image's natural ratio, scaled to fit within BOTH the
         // width and height bounds (never upscaled), so the photo fills with no crop and
         // the card never exceeds a standard card's height.
         const handleFitToImage = () => {
            const img = imgRef.current;
            if (!img || !img.naturalWidth || !img.naturalHeight) return;
            const scale = Math.min(MAX_CARD_PX / img.naturalWidth, MAX_CARD_HEIGHT_PX / img.naturalHeight, 1);
            actions.setCardSize(card.id, img.naturalWidth * scale, img.naturalHeight * scale);
         };

         const imageArea = (
            <div className="relative h-full w-full bg-muted">
               {showSpinner ? (
                  <div className="flex h-full w-full items-center justify-center">
                     <MistSpinner variant="disc" size={32} className="text-muted-foreground" />
                  </div>
               ) : url ? (
                  <img
                     ref={imgRef}
                     src={url}
                     alt={altText}
                     title={altText}
                     draggable={false}
                     className={cn('h-full w-full', details.fit === 'contain' ? 'object-contain' : 'object-cover')}
                  />
               ) : interactive ? (
                  <button
                     type="button"
                     onClick={openPicker}
                     className={cn(
                        'flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center',
                        'border-2 border-dashed border-border text-muted-foreground',
                        'hover:text-foreground hover:border-foreground transition-colors cursor-pointer',
                     )}
                  >
                     <Upload className={cn(isDrawerPreview ? 'h-6 w-6' : 'h-10 w-10')} />
                     <span className={cn('font-semibold', isDrawerPreview ? 'text-sm' : 'text-xl')}>{t('ImageCard.upload')}</span>
                  </button>
               ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center text-muted-foreground">
                     <ImageIcon className={cn(isDrawerPreview ? 'h-6 w-6' : 'h-10 w-10')} />
                     <span className={cn('font-semibold', isDrawerPreview ? 'text-sm' : 'text-xl')}>{t('ImageCard.empty')}</span>
                  </div>
               )}

               {/* On-image controls. Resize/change/remove are edit-only; the raw-image
                   download is available in play mode too, revealed on hover so it never
                   covers the art (edit mode keeps them all visible). */}
               {!isSnapshot && !isDrawerPreview && !showSpinner && (interactive || (url && isRevealed)) && (
                  <div className="absolute right-2 top-2 flex gap-1">
                     {canResize && (
                        <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                              <Button
                                 variant="secondary"
                                 size="icon"
                                 className="h-8 w-8 cursor-pointer opacity-90"
                                 title={t('ImageCard.resize')}
                              >
                                 <Scaling className="h-4 w-4" />
                              </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                              <DropdownMenuItem disabled={!url} onClick={handleFitToImage} className="cursor-pointer">
                                 {t('ImageCard.fitToImage')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => actions.setCardSize(card.id, IMAGE_CARD_PRESETS.portrait.width, IMAGE_CARD_PRESETS.portrait.height)} className="cursor-pointer">
                                 {t('Common.portrait')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => actions.setCardSize(card.id, IMAGE_CARD_PRESETS.square.width, IMAGE_CARD_PRESETS.square.height)} className="cursor-pointer">
                                 {t('Common.square')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => actions.setCardSize(card.id, IMAGE_CARD_PRESETS.landscape.width, IMAGE_CARD_PRESETS.landscape.height)} className="cursor-pointer">
                                 {t('Common.landscape')}
                              </DropdownMenuItem>
                           </DropdownMenuContent>
                        </DropdownMenu>
                     )}
                     {interactive && url && (
                        <Button
                           variant="secondary"
                           size="icon"
                           className="h-8 w-8 cursor-pointer opacity-90"
                           title={t('ImageCard.change')}
                           onClick={openPicker}
                        >
                           <ImageIcon className="h-4 w-4" />
                        </Button>
                     )}
                     {interactive && url && (
                        <Button
                           variant="destructive"
                           size="icon"
                           className="h-8 w-8 cursor-pointer opacity-90"
                           title={t('ImageCard.remove')}
                           onClick={() => actions.setCardImage(card.id, null)}
                        >
                           <Trash2 className="h-4 w-4" />
                        </Button>
                     )}
                     {url && (
                        <Button
                           variant="secondary"
                           size="icon"
                           className="h-8 w-8 cursor-pointer opacity-90"
                           title={t('ImageCard.download')}
                           onClick={handleDownloadImage}
                        >
                           <Upload className="h-4 w-4" />
                        </Button>
                     )}
                  </div>
               )}

               {/* Bottom-right resize grip: drags the card's size; Shift locks aspect. */}
               {canResize && (
                  <div
                     role="button"
                     aria-label={t('ImageCard.resizeHandle')}
                     title={t('ImageCard.resizeHandle')}
                     onPointerDown={handleResizePointerDown}
                     onPointerMove={handleResizePointerMove}
                     onPointerUp={handleResizePointerUp}
                     className={cn(
                        'absolute bottom-1 right-1 z-10 flex h-5 w-5 items-center justify-center',
                        'cursor-nwse-resize touch-none rounded-sm bg-background/70 ring-1 ring-border hover:bg-background',
                        // Coarse-pointer hit-slop: the grip already owns a positioning context, so slop via
                        // an inline `::before` rather than `touch-target` (which would drop its absolute placement).
                        "coarse:before:absolute coarse:before:-inset-2 coarse:before:content-['']",
                     )}
                  >
                     <div className="h-2.5 w-2.5 border-b-2 border-r-2 border-foreground/60" />
                  </div>
               )}
            </div>
         );

         return (
            <motion.div ref={ref} {...revealHandlers} className="relative">
               {!isDrawerPreview && !isSnapshot && !isBoardEmbed && (
                  <ToolbarHandle
                     isEditing={isEditing}
                     isHovered={isRevealed}
                     dragAttributes={dragAttributes}
                     dragListeners={dragListeners}
                     onDelete={() => actions.deleteCard(card.id)}
                     onExport={onExport}
                     cardTheme="card-type-image"
                  />
               )}
               <Card
                  className={cn(
                     isMobile ? 'w-62.5' : isDrawerPreview ? 'w-62.5 h-30' : '',
                     'flex flex-col border-2 shadow-lg p-0 overflow-hidden gap-0 relative z-0',
                     'border-card-accent card-type-image',
                     { 'shadow-none pointer-events-none border-card-border': isDrawerPreview },
                  )}
                  style={
                     isMobile
                        ? { aspectRatio: `${cardWidth} / ${cardHeight}` }
                        : isDrawerPreview
                           ? undefined
                           : { width: cardWidth, height: cardHeight }
                  }
               >
                  {imageArea}
               </Card>

               <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT_IMAGE}
                  className="hidden"
                  onChange={handleFileSelected}
               />
               {cropperDialog}
            </motion.div>
         );
      },
   ),
);
ImageCardContent.displayName = 'ImageCardContent';



export const ImageCard: React.NamedExoticComponent<CardComponentProps & React.RefAttributes<HTMLDivElement>> = React.memo(
   React.forwardRef<HTMLDivElement, CardComponentProps>((props, ref) => {
      if ((props.card as CardData).cardType !== 'IMAGE_CARD') return null;
      return <ImageCardContent {...props} ref={ref} />;
   }),
);
ImageCard.displayName = 'ImageCard';
