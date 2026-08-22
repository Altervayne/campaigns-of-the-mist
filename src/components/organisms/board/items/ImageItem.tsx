// -- React Imports --
import { type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Image as ImageIcon, ImageOff, Loader2, SaveAll, Scaling, Shapes, Upload } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { ACCEPT_IMAGE } from '@/lib/utils/fileAccept';
import { toggleImageFit } from '@/lib/board/stencilContent';

// -- Store and Hook Imports --
import { useAssetObjectUrl } from '@/hooks/useAssetObjectUrl';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useImageStencil } from '@/hooks/useImageStencil';
import { useDrawerStore } from '@/lib/stores/drawerStore';
import { useAppGeneralStateStore, useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';

// -- Save-Back --
import { runSaveImageToDrawerAs } from '@/hooks/board/useBoardItemSaveBack';

// -- Type Imports --
import type { BoardItemContent, ImageBoardContent } from '@/lib/types/board';

/*
 * An image board item. It reuses the asset MACHINERY (processImage -> storeAsset ->
 * useAssetObjectUrl), not the character `ImageCard` component: this image lives in its
 * own freeform box and fills it (`object-cover`/`object-contain` per `fit`). Resize is
 * the canvas's handles. Every change goes through `updateItemContent` (undoable).
 */

interface ImageItemProps {
   content: ImageBoardContent;
   isSelected: boolean;
   /** The selection toolbar's action slot; the fit/change/remove controls portal here. */
   toolbarSlot: HTMLElement | null;
   onContentChange: (content: BoardItemContent) => void;
   onRequestSelect: () => void;
}

export function ImageItem({ content, isSelected, toolbarSlot, onContentChange, onRequestSelect }: ImageItemProps) {
   const { t } = useTranslation();
   const { url, isLoading } = useAssetObjectUrl(content.assetId);
   const { setDrawerOpen } = useAppGeneralStateActions();
   const { fileInputRef, open: openPicker, isProcessing, handleFileSelected, cropperDialog } = useImageUpload(
      (hash) => onContentChange({ kind: 'image', assetId: hash, fit: content.fit }),
      { aspect: 'free' },
   );
   const stencil = useImageStencil((next) => onContentChange(next));

   const showSpinner = isProcessing || stencil.isProcessing || (content.assetId !== null && isLoading);

   // Save As: mint this image as a game-agnostic IMAGE_CARD in the drawer. Mint only - an image has no
   // source link, so there is no write-back and nothing to adopt. Reads the drawer/app state directly (a
   // one-shot action, not a subscription).
   const saveImageToDrawer = () => runSaveImageToDrawerAs(content, {
      t,
      drawerCurrentFolderId: useDrawerStore.getState().currentFolderId,
      isDrawerOpen: useAppGeneralStateStore.getState().isDrawerOpen,
      setDrawerOpen,
   });

   const toggleFit = () => onContentChange(toggleImageFit(content));
   const removeImage = () => onContentChange({ kind: 'image', assetId: null, fit: content.fit });

   // A masked image is a shape: it drops the placeholder plate (which would show through the transparent
   // corners) and fits the whole shape in the box (`contain`), so no aspect crops the shape off. A preset
   // (`maskId`) or a library (`stencilId`) mask both count.
   const isMasked = !!content.maskId || !!content.stencilId;

   return (
      <div className={cn('relative h-full w-full', !isMasked && 'bg-muted')}>
         {showSpinner ? (
            <div className="flex h-full w-full items-center justify-center">
               <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
         ) : url ? (
            <img src={url} alt="" draggable={false} className={cn('h-full w-full', isMasked || content.fit === 'contain' ? 'object-contain' : 'object-cover')} />
         ) : (
            // A padding frame stays part of the draggable body so an empty image box can
            // still be moved (the upload button itself stops pointer propagation).
            <div className="h-full w-full p-2">
               <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                     onRequestSelect();
                     openPicker();
                  }}
                  className="flex h-full w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-border p-3 text-center text-muted-foreground hover:border-foreground hover:text-foreground transition-colors cursor-pointer"
               >
                  <Upload className="h-7 w-7" />
                  <span className="text-sm font-medium">{t('BoardView.imageUpload')}</span>
               </button>
            </div>
         )}

         {/* Image actions live in the selection toolbar (the body is content only). They
             portal into the bar's slot so their logic stays co-located with this item. */}
         {url && !showSpinner && isSelected && toolbarSlot && createPortal(
            <>
               <ImageControl title={t('BoardView.imageToggleFit')} onClick={toggleFit}>
                  <Scaling className="h-4 w-4" />
               </ImageControl>
               <ImageControl title={t('BoardView.imageChange')} onClick={openPicker}>
                  <ImageIcon className="h-4 w-4" />
               </ImageControl>
               <ImageControl title={t('BoardView.imageMask')} onClick={() => stencil.open(content)}>
                  <Shapes className="h-4 w-4" />
               </ImageControl>
               <ImageControl title={t('BoardView.saveItemToDrawerAs')} onClick={saveImageToDrawer}>
                  <SaveAll className="h-4 w-4" />
               </ImageControl>
               <ImageControl title={t('BoardView.imageRemove')} destructive onClick={removeImage}>
                  <ImageOff className="h-4 w-4" />
               </ImageControl>
            </>,
            toolbarSlot,
         )}

         <input ref={fileInputRef} type="file" accept={ACCEPT_IMAGE} className="hidden" onChange={handleFileSelected} />
         {cropperDialog}
         {stencil.dialog}
      </div>
   );
}

/** An image action button in the selection toolbar; stops the drag so the click lands reliably. */
function ImageControl({
   title,
   destructive = false,
   onClick,
   children,
}: {
   title: string;
   destructive?: boolean;
   onClick: () => void;
   children: React.ReactNode;
}) {
   return (
      <button
         type="button"
         title={title}
         aria-label={title}
         onPointerDown={(event: ReactPointerEvent) => event.stopPropagation()}
         onClick={onClick}
         className={cn(
            'flex cursor-pointer items-center justify-center rounded p-1',
            destructive ? 'text-destructive hover:bg-destructive/15' : 'text-popover-foreground hover:bg-muted',
         )}
      >
         {children}
      </button>
   );
}
