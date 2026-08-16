// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { ChevronLeft, Image as ImageIcon, ImageUp, Loader2, Trash2 } from 'lucide-react';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';

// -- Store and Hook Imports --
import { useCharacterStore, useCharacterActions } from '@/lib/stores/characterStore';
import { useAssetObjectUrl } from '@/hooks/useAssetObjectUrl';
import { useImageUpload } from '@/hooks/useImageUpload';

// -- Utils and Constants --
import { cn } from '@/lib/utils';
import { IMAGE_CARD_PRESETS, LEGACY_IMAGE_CARD_SIZE, clampCardHeight, clampCardWidth } from '@/lib/constants/imageCard';
import { ACCEPT_IMAGE } from '@/lib/utils/fileAccept';

// -- Type Imports --
import type { ImageCardDetails } from '@/lib/types/character';

/*
 * The mobile portrait editor: the image is cropped once at creation, so this screen never re-crops it.
 * It reshapes the card FRAME instead - an aspect preset, non-destructive (the stored image displays
 * through `object-cover`). Absolute size is a desktop-sheet concern; the mobile carousel is fixed-width,
 * so aspect is the only frame control here. Replace picks a brand new image (and crops that); Delete drops
 * the portrait and leaves. Portrait is the one card type with this control, so this screen is portrait-only.
 */

/** The aspect presets, in the order they read left to right. */
const ASPECTS = [
   { id: 'portrait', preset: IMAGE_CARD_PRESETS.portrait, labelKey: 'Common.portrait' },
   { id: 'square', preset: IMAGE_CARD_PRESETS.square, labelKey: 'Common.square' },
   { id: 'landscape', preset: IMAGE_CARD_PRESETS.landscape, labelKey: 'Common.landscape' },
] as const;

interface MobileEditPortraitProps {
   onBack: () => void;
}

export default function MobileEditPortrait({ onBack }: MobileEditPortraitProps) {
   const { t } = useTranslation();
   const character = useCharacterStore((state) => state.character);
   const { setCardSize, setCardImage, deleteCard } = useCharacterActions();
   const [confirmDelete, setConfirmDelete] = useState(false);

   const portrait = character?.cards.find((c) => c.cardType === 'IMAGE_CARD') ?? null;
   const details = portrait?.details as ImageCardDetails | undefined;

   const { url, isLoading } = useAssetObjectUrl(details?.assetId ?? null);

   // Replace picks a NEW image and crops it free; the cut lands on the same portrait.
   const {
      fileInputRef: replaceInputRef,
      open: openReplacePicker,
      isProcessing: isReplacing,
      handleFileSelected: onReplaceFileSelected,
      cropperDialog: replaceCropperDialog,
   } = useImageUpload(
      (hash) => portrait && setCardImage(portrait.id, hash),
      { aspect: 'free' },
   );

   // Reached only with a portrait loaded; back out if it's gone (e.g. deleted from elsewhere).
   if (!portrait || !details) {
      return (
         <div className="h-full flex flex-col items-center justify-center gap-4 p-6 pt-[calc(1.5rem+env(safe-area-inset-top))]">
            <p className="text-center text-muted-foreground">{t('MobileEditPortrait.missing')}</p>
            <Button onClick={onBack} className="cursor-pointer">{t('MobileEditPortrait.back')}</Button>
         </div>
      );
   }

   const cardWidth = clampCardWidth(details.width || LEGACY_IMAGE_CARD_SIZE.width);
   const cardHeight = clampCardHeight(details.height || LEGACY_IMAGE_CARD_SIZE.height);
   const ratio = cardHeight / cardWidth;

   // The active aspect is whichever preset the current ratio matches (else none, e.g. a legacy size).
   const activeAspect = ASPECTS.find((a) => Math.abs(ratio - a.preset.height / a.preset.width) < 0.02)?.id ?? null;

   const handleDelete = () => {
      deleteCard(portrait.id);
      setConfirmDelete(false);
      onBack();
   };

   return (
      <div className="h-full flex flex-col">
         {/* Sticky header: back + title. */}
         <div className="shrink-0 border-b border-border bg-background pt-safe">
            <div className="flex items-center gap-2 px-4 py-2">
               <IconButton variant="ghost" size="lg" onClick={onBack} className="h-10 w-10 p-0">
                  <ChevronLeft className="h-8 w-8" />
               </IconButton>
               <span className="min-w-0 flex-1 truncate text-lg font-semibold">{t('MobileEditPortrait.title')}</span>
            </div>
         </div>

         <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {/* The portrait at its current frame, so aspect changes read immediately. */}
            <div className="flex justify-center">
               <div
                  className="relative w-full max-w-xs overflow-hidden rounded-lg border-2 border-card-accent bg-muted card-type-image"
                  style={{ aspectRatio: `${cardWidth} / ${cardHeight}` }}
               >
                  {isLoading ? (
                     <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                     </div>
                  ) : url ? (
                     <img
                        src={url}
                        alt={portrait.title || t('ImageCard.alt')}
                        className={cn('absolute inset-0 h-full w-full', details.fit === 'contain' ? 'object-contain' : 'object-cover')}
                     />
                  ) : (
                     <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <ImageIcon className="h-10 w-10" />
                        <span className="text-sm font-semibold">{t('ImageCard.empty')}</span>
                     </div>
                  )}
               </div>
            </div>

            {/* Aspect presets. */}
            <div className="space-y-2">
               <span className="text-sm font-medium">{t('MobileEditPortrait.aspect')}</span>
               <div className="grid grid-cols-3 gap-2">
                  {ASPECTS.map((a) => (
                     <button
                        key={a.id}
                        type="button"
                        onClick={() => setCardSize(portrait.id, a.preset.width, a.preset.height)}
                        className={cn(
                           'rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors',
                           activeAspect === a.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                     >
                        {t(a.labelKey)}
                     </button>
                  ))}
               </div>
            </div>

            {/* Replace + Delete. */}
            <div className="space-y-2 border-t border-border pt-4">
               <Button variant="outline" onClick={openReplacePicker} disabled={isReplacing} className="w-full h-11 cursor-pointer">
                  {isReplacing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImageUp className="mr-1 h-4 w-4" />}
                  {t('MobileEditPortrait.replaceImage')}
               </Button>
               <Button variant="destructive" onClick={() => setConfirmDelete(true)} className="w-full h-11 cursor-pointer">
                  <Trash2 className="mr-1 h-4 w-4" />
                  {t('MobileEditPortrait.delete')}
               </Button>
            </div>
         </div>

         {/* Replace picker + crop stage. */}
         <input
            ref={replaceInputRef}
            type="file"
            accept={ACCEPT_IMAGE}
            className="hidden"
            onChange={onReplaceFileSelected}
         />
         {replaceCropperDialog}

         {/* Delete confirm. */}
         <MobileBottomSheet isOpen={confirmDelete} onClose={() => setConfirmDelete(false)}>
            <div className="p-4 pb-3 border-b border-border">
               <h2 className="text-lg font-semibold">{t('MobileEditPortrait.deleteConfirmTitle')}</h2>
               <p className="text-sm text-muted-foreground mt-2">{t('MobileEditPortrait.deleteConfirmBody')}</p>
            </div>
            <div className="p-4">
               <div className="flex gap-2 pb-safe">
                  <Button variant="outline" onClick={() => setConfirmDelete(false)} className="flex-1 h-11 cursor-pointer">
                     {t('Common.cancel')}
                  </Button>
                  <Button variant="destructive" onClick={handleDelete} className="flex-1 h-11 cursor-pointer">
                     {t('MobileEditPortrait.deleteConfirm')}
                  </Button>
               </div>
            </div>
         </MobileBottomSheet>
      </div>
   );
}
