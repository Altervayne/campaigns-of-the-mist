// -- React Imports --
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Image as ImageIcon, ImageOff, Palette, Proportions, SaveAll, Upload } from 'lucide-react';

// -- Component Imports --
import { MistSpinner } from '@/components/molecules/MistSpinner';
import { StyledBoardImage } from './StyledBoardImage';
import { ImageStylePopover } from './ImageStylePopover';
import { ImageSizingPopover } from './ImageSizingPopover';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { ACCEPT_IMAGE } from '@/lib/utils/fileAccept';
import { aspectResize } from '@/lib/board/boardResize';
import { IMAGE_TOOLBAR_BUTTON_CLASS } from './imageToolbarButton';

// -- Store and Hook Imports --
import { useAssetObjectUrl } from '@/hooks/useAssetObjectUrl';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useImageStencil } from '@/hooks/useImageStencil';
import { useDrawerStore } from '@/lib/stores/drawerStore';
import { useAppGeneralStateStore, useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';

// -- Save-Back --
import { runSaveImageToDrawerAs } from '@/hooks/board/useBoardItemSaveBack';

// -- Type Imports --
import type { BoardItem, BoardItemContent, ImageBoardContent } from '@/lib/types/board';
import type { ResizePatch } from '@/lib/board/boardCommands';

/*
 * An image board item. It reuses the asset MACHINERY (processImage -> storeAsset ->
 * useAssetObjectUrl), not the character `ImageCard` component: this image lives in its
 * own freeform box and fills it (`object-cover`/`object-contain` per `fit`). Resize is
 * the canvas's handles. Every change goes through `updateItemContent` (undoable).
 */

interface ImageItemProps {
   item: BoardItem;
   content: ImageBoardContent;
   isSelected: boolean;
   /** The selection toolbar's action slot; the change/style/sizing/remove controls portal here. */
   toolbarSlot: HTMLElement | null;
   onContentChange: (content: BoardItemContent) => void;
   /** Resizes the item's box (undoable); the aspect-ratio presets reshape it. */
   onResize: (patch: ResizePatch) => void;
   onRequestSelect: () => void;
}

export function ImageItem({ item, content, isSelected, toolbarSlot, onContentChange, onResize, onRequestSelect }: ImageItemProps) {
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

   const removeImage = () => onContentChange({ kind: 'image', assetId: null, fit: content.fit });

   // A masked image is a shape: it drops the placeholder plate (which would show through the transparent
   // corners) and fits the whole shape in the box (`contain`), so no aspect crops the shape off. A preset
   // (`maskId`) or a library (`stencilId`) mask both count.
   const isMasked = !!content.maskId || !!content.stencilId;

   // The style/sizing popovers anchor to the IMAGE box (a real overlay element inside this box) so they open
   // to its SIDE, image fully visible - not to the toolbar button centered above it. They are CONTROLLED by
   // the toolbar toggles here; a toolbar toggle that lives outside the popover would otherwise let Radix's
   // click-away close it and the toggle immediately reopen, so the popovers ignore an interact-outside on
   // their toggle. Reset both when the item is deselected so a re-select never reopens a stale menu.
   const [styleOpen, setStyleOpen] = useState(false);
   const [sizingOpen, setSizingOpen] = useState(false);
   const styleBtnRef = useRef<HTMLButtonElement>(null);
   const sizingBtnRef = useRef<HTMLButtonElement>(null);
   // Reset the open menus when the item deselects (its toolbar toggles vanish) so a re-select never reopens
   // a stale one. Adjusting state during render, not in an effect (avoids a cascading-render lint).
   const [wasSelected, setWasSelected] = useState(isSelected);
   if (wasSelected !== isSelected) {
      setWasSelected(isSelected);
      if (!isSelected) { setStyleOpen(false); setSizingOpen(false); }
   }

   // A live slider preview: while a tone/opacity slider drags, the effects section pushes the folded content
   // here so the picture updates every frame WITHOUT a store write (no undo-stack flood). The real commit
   // (onContentChange, fired on release / close) clears it, so the committed content takes back over.
   const [preview, setPreview] = useState<ImageBoardContent | null>(null);
   const shownContent = preview ?? content;
   const commitContent = (next: BoardItemContent) => { setPreview(null); onContentChange(next); };

   const hasStyle = !!content.frame || !!content.border || !!content.shadow || !!content.filter
      || (content.opacity !== undefined && content.opacity !== 1)
      || (content.brightness !== undefined && content.brightness !== 1)
      || (content.contrast !== undefined && content.contrast !== 1)
      || (content.saturation !== undefined && content.saturation !== 1);
   const styleActive = styleOpen || isMasked || hasStyle;

   return (
      // No opaque backing behind a loaded image: opacity (and a transparent PNG's own alpha) must reveal the
      // board through it, not a muted fill. The spinner and empty-upload states paint their own placeholder.
      <div className="relative h-full w-full">
         {showSpinner ? (
            <div className="flex h-full w-full items-center justify-center bg-muted">
               <MistSpinner variant="disc" size={28} className="text-muted-foreground" />
            </div>
         ) : url ? (
            <StyledBoardImage url={url} content={shownContent} isMasked={isMasked} />
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

         {/* Style + sizing popovers anchor to THIS box (an inset overlay) so they open beside the image; the
             toolbar toggles control them. Only while selected + loaded. */}
         {url && !showSpinner && isSelected && (
            <>
               <ImageStylePopover
                  open={styleOpen}
                  onOpenChange={setStyleOpen}
                  toggleRef={styleBtnRef}
                  content={content}
                  onChange={commitContent}
                  onPreview={setPreview}
                  isMasked={isMasked}
                  onOpenMask={() => stencil.open(content)}
               />
               <ImageSizingPopover
                  open={sizingOpen}
                  onOpenChange={setSizingOpen}
                  toggleRef={sizingBtnRef}
                  content={content}
                  onChange={commitContent}
                  onAspect={(ratio) => onResize(aspectResize(item.width, ratio))}
               />
            </>
         )}

         {/* Image actions live in the selection toolbar (the body is content only). They
             portal into the bar's slot so their logic stays co-located with this item. */}
         {url && !showSpinner && isSelected && toolbarSlot && createPortal(
            <>
               <ImageControl title={t('BoardView.imageChange')} onClick={openPicker}>
                  <ImageIcon className="h-4 w-4" />
               </ImageControl>
               <button
                  ref={styleBtnRef}
                  type="button"
                  title={t('BoardView.imageStyle')}
                  aria-label={t('BoardView.imageStyle')}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setStyleOpen((open) => !open)}
                  className={cn(IMAGE_TOOLBAR_BUTTON_CLASS, styleActive && 'ring-1 ring-primary')}
               >
                  <Palette className="h-4 w-4" />
               </button>
               <button
                  ref={sizingBtnRef}
                  type="button"
                  title={t('BoardView.imageSizing')}
                  aria-label={t('BoardView.imageSizing')}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setSizingOpen((open) => !open)}
                  className={cn(IMAGE_TOOLBAR_BUTTON_CLASS, sizingOpen && 'ring-1 ring-primary')}
               >
                  <Proportions className="h-4 w-4" />
               </button>
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
         className={cn(destructive ? 'flex cursor-pointer items-center justify-center rounded p-1 text-destructive hover:bg-destructive/15' : IMAGE_TOOLBAR_BUTTON_CLASS)}
      >
         {children}
      </button>
   );
}
