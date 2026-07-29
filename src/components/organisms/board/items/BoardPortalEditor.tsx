// -- React Imports --
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Image as ImageIcon, Loader2, Replace, Upload } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { resolvePortalIcon, portalDestinationIcon, smartPortalIconName, PORTAL_ICON_NAMES } from '@/lib/board/portalIcons';
import { PORTAL_IMAGE_SIZE_DEFAULT, PORTAL_MIN_SIZE } from '@/lib/board/portalSizing';
import { ACCEPT_IMAGE } from '@/lib/utils/fileAccept';

// -- Pipeline / Asset Store --
import { processImage } from '@/lib/assets/processImage';
import { storeAsset } from '@/lib/assets/assetRepository';

// -- Store and Hook Imports --
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';
import { useImageCropper } from '@/hooks/useImageCropper';

// -- Component Imports --
import { PortalCard } from './BoardPortalItem';
import { Switch } from '@/components/ui/switch';

// -- Type Imports --
import type { PortalAlign, PortalBoardContent, PortalStyle } from '@/lib/types/board';

/*
 * The portal restyle editor: the body of the movable editor window. It drives ONE selected portal's style -
 * change its target (reopens the shared picker), switch between the five styles, pick a curated icon or upload
 * an image, choose where the label sits, and edit the label - with a live preview of the result. Every edit is
 * one undoable command via `onCommitStyle`, which reads the item LIVE and patches only its style (so a deferred
 * label flush can't clobber a target/visual change, and vice versa). App-theme chrome; the preview alone shows
 * the real style.
 *
 * The five styles fold onto `PortalStyle` = (visual kind + image mode) × (label present): text-only = no
 * visual; icon+text = icon + label; icon-only = icon + empty label; image poster / image+text composed = image
 * (mode) + label. The selected kind is EXPLICIT editor state, not re-derived from the data each render: icon+text
 * and icon-only share a visual and differ only by the label, so an empty label in icon+text would read back as
 * icon-only and snap the control - the mode owns that split, and clearing the label stays icon+text (an empty
 * but editable label). Switching into a visual+text kind restores the remembered label (else the target's name).
 * The 4-way alignment control, the image size slider, and the image-background toggle show only for the styles
 * that use them; the portal-background toggle applies to every style.
 */

type PortalStyleKind = 'text' | 'icon-text' | 'icon-only' | 'image-poster' | 'image-composed';

/** Classifies a stored style into its editor kind (icon+text vs icon-only splits on the label; image on mode). */
function styleKind(style: PortalStyle): PortalStyleKind {
   if (style.visual?.kind === 'image') return style.visual.mode === 'composed' ? 'image-composed' : 'image-poster';
   if (style.visual?.kind === 'icon') return style.label ? 'icon-text' : 'icon-only';
   return 'text';
}

/**
 * Re-derives the editor mode after an EXTERNAL style change (undo, retarget, or a toggle we just made). The
 * icon+text / icon-only split lives only in the editor (both are an icon + a possibly-empty label), so an
 * icon-shaped style keeps whichever of the two the user had; every other shape is unambiguous. This is what
 * stops a cleared icon+text label from snapping the control to icon-only.
 */
function reconcileMode(prev: PortalStyleKind, style: PortalStyle): PortalStyleKind {
   if (style.visual?.kind === 'icon') return prev === 'icon-only' ? 'icon-only' : 'icon-text';
   return styleKind(style);
}

/** The two composed visual+text styles that carry a label alignment. */
function isComposedKind(kind: PortalStyleKind): boolean {
   return kind === 'icon-text' || kind === 'image-composed';
}

const KIND_ORDER: { kind: PortalStyleKind; labelKey: string }[] = [
   { kind: 'text', labelKey: 'BoardView.portalStyleTextOnly' },
   { kind: 'icon-only', labelKey: 'BoardView.portalStyleIconOnly' },
   { kind: 'icon-text', labelKey: 'BoardView.portalStyleIconText' },
   { kind: 'image-poster', labelKey: 'BoardView.portalStyleImage' },
   { kind: 'image-composed', labelKey: 'BoardView.portalStyleImageText' },
];

/** The live preview's default box (taller than wide so a top/bottom label alignment reads); a poster reshapes off its width. */
const PREVIEW_BOX = { width: 220, height: 112 };

interface BoardPortalEditorProps {
   /** The portal's live content (re-rendered by the board store on every commit). */
   content: PortalBoardContent;
   /** Commits a style edit as one undoable command, read live-then-patched by the caller. */
   onCommitStyle: (updater: (style: PortalStyle) => PortalStyle) => void;
   /** Reopens the shared target picker in retarget mode (keeps the current style). */
   onChangeTarget: () => void;
}

export function BoardPortalEditor({ content, onCommitStyle, onChangeTarget }: BoardPortalEditorProps) {
   const { t } = useTranslation();
   const { style, target } = content;

   // The selected style kind is EXPLICIT state, reconciled only on an external style change (see `reconcileMode`),
   // so a cleared icon+text label never snaps the control to icon-only.
   const [mode, setMode] = useState<PortalStyleKind>(() => styleKind(style));
   const [syncedStyle, setSyncedStyle] = useState(style);
   if (style !== syncedStyle) {
      setSyncedStyle(style);
      setMode((prev) => reconcileMode(prev, style));
   }

   // The last chosen icon + asset (+ its size/background) + non-empty label, so switching styles never loses a
   // prior choice: toggling to text/image and back restores the icon, and icon-only (label blanked) restores the
   // label on return.
   const rememberedIcon = useRef(style.visual?.kind === 'icon' ? style.visual.icon : smartPortalIconName(target));
   const rememberedAsset = useRef(style.visual?.kind === 'image' ? style.visual.assetId : '');
   const rememberedAspect = useRef(style.visual?.kind === 'image' ? style.visual.aspect : 1);
   const rememberedImageSize = useRef(style.visual?.kind === 'image' ? style.visual.size ?? PORTAL_IMAGE_SIZE_DEFAULT : PORTAL_IMAGE_SIZE_DEFAULT);
   const rememberedImageBackground = useRef(style.visual?.kind === 'image' ? style.visual.background ?? true : true);
   const rememberedLabel = useRef(style.label);
   useEffect(() => {
      if (style.visual?.kind === 'icon') rememberedIcon.current = style.visual.icon;
      else if (style.visual?.kind === 'image' && style.visual.assetId) {
         rememberedAsset.current = style.visual.assetId;
         rememberedAspect.current = style.visual.aspect;
         rememberedImageSize.current = style.visual.size ?? PORTAL_IMAGE_SIZE_DEFAULT;
         rememberedImageBackground.current = style.visual.background ?? true;
      }
      if (style.label) rememberedLabel.current = style.label;
   }, [style]);

   // The label typing buffer, resynced when the stored label changes externally (a style toggle, undo, a
   // retarget leaves it be). Committed on blur / unmount, not per keystroke, so one edit session = one undo.
   const [label, setLabel] = useState(style.label);
   const [syncedLabel, setSyncedLabel] = useState(style.label);
   if (style.label !== syncedLabel) {
      setSyncedLabel(style.label);
      setLabel(style.label);
   }

   const commitLabel = () => {
      if (mode === 'icon-only') return; // icon-only carries no label field to flush
      if (label === style.label) return; // unchanged
      onCommitStyle((prev) => ({ ...prev, label }));
   };
   useCommitOnUnmount(commitLabel);

   // The multiline label textarea grows to fit its content up to a cap, then scrolls.
   const labelRef = useRef<HTMLTextAreaElement>(null);
   useEffect(() => {
      const el = labelRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
   }, [label, mode]);

   // The composed image size buffers like the label: the preview reflects it live while a drag commits once (on
   // blur / unmount), so a whole slider drag is a single undo step (updateItemContent is one command per call).
   const [sizeDraft, setSizeDraft] = useState<number | null>(null);
   const commitSize = () => {
      if (sizeDraft === null) return;
      const draft = sizeDraft;
      setSizeDraft(null);
      onCommitStyle((prev) => (prev.visual?.kind === 'image' ? { ...prev, visual: { ...prev.visual, size: draft } } : prev));
   };
   useCommitOnUnmount(commitSize);

   /** Switches the portal to `next`, carrying the remembered visual (+ size/background) + label + align. */
   const applyKind = (next: PortalStyleKind) => {
      setMode(next);
      // The label the next style inherits. Leaving a mode that SHOWED the label field, the buffer is the user's
      // own choice - a deliberately-cleared label stays empty across a style switch. Only icon-only (no label
      // field) restores the remembered label / target name on the way out, so passing through it never eats text.
      const nextLabel = () => (mode !== 'icon-only' ? label : rememberedLabel.current || content.lastKnownName || (target.kind === 'external' ? target.href : ''));
      onCommitStyle((prev): PortalStyle => {
         const background = prev.background ?? true;
         const align = prev.align ?? 'right';
         const icon = prev.visual?.kind === 'icon' ? prev.visual.icon : rememberedIcon.current;
         const asset = prev.visual?.kind === 'image' ? prev.visual.assetId : rememberedAsset.current;
         const imageAspect = prev.visual?.kind === 'image' ? prev.visual.aspect : rememberedAspect.current;
         const imageSize = prev.visual?.kind === 'image' ? prev.visual.size ?? PORTAL_IMAGE_SIZE_DEFAULT : rememberedImageSize.current;
         const imageBg = prev.visual?.kind === 'image' ? prev.visual.background ?? true : rememberedImageBackground.current;
         switch (next) {
            case 'text': return { visual: null, label: nextLabel(), align, background };
            case 'icon-text': return { visual: { kind: 'icon', icon }, label: nextLabel(), align, background };
            case 'icon-only': return { visual: { kind: 'icon', icon }, label: '', align, background };
            case 'image-poster': return { visual: { kind: 'image', assetId: asset, aspect: imageAspect, mode: 'poster', size: imageSize, background: imageBg }, label: nextLabel(), align, background };
            case 'image-composed': return { visual: { kind: 'image', assetId: asset, aspect: imageAspect, mode: 'composed', size: imageSize, background: imageBg }, label: nextLabel(), align, background };
         }
      });
   };

   const pickIcon = (name: string) => onCommitStyle((prev) => ({ ...prev, visual: { kind: 'icon', icon: name } }));
   // Keep the current image mode + size + background when swapping the asset; the new crop's aspect rides along.
   const setAsset = (assetId: string, aspect: number) => onCommitStyle((prev) => ({
      ...prev,
      visual: prev.visual?.kind === 'image'
         ? { ...prev.visual, assetId, aspect }
         : { kind: 'image', assetId, aspect, mode: 'poster', size: rememberedImageSize.current, background: rememberedImageBackground.current },
   }));
   const setImageBackground = (background: boolean) => onCommitStyle((prev) => (
      prev.visual?.kind === 'image' ? { ...prev, visual: { ...prev.visual, background } } : prev
   ));
   const setAlign = (align: PortalAlign) => onCommitStyle((prev) => ({ ...prev, align }));
   const setBackground = (background: boolean) => onCommitStyle((prev) => ({ ...prev, background }));

   // The preview reflects the typing buffer + size draft live even though those commits are deferred.
   const previewContent = useMemo<PortalBoardContent>(
      () => ({
         ...content,
         style: {
            ...style,
            label: mode === 'icon-only' ? '' : label,
            visual: sizeDraft !== null && style.visual?.kind === 'image' ? { ...style.visual, size: sizeDraft } : style.visual,
         },
      }),
      [content, style, mode, label, sizeDraft],
   );
   const DestinationIcon = portalDestinationIcon(target);
   const imageSizeValue = sizeDraft ?? (style.visual?.kind === 'image' ? style.visual.size ?? PORTAL_IMAGE_SIZE_DEFAULT : PORTAL_IMAGE_SIZE_DEFAULT);

   // The preview box: fixed by default, but a poster reshapes to its crop aspect (matching the board tile)
   // so the preview shows the same full-crop shape rather than cover-cropping into the fixed frame.
   const previewVisual = previewContent.style.visual;
   const previewSize = previewVisual?.kind === 'image' && previewVisual.mode === 'poster'
      ? { width: PREVIEW_BOX.width, height: Math.max(PORTAL_MIN_SIZE.height, Math.round(PREVIEW_BOX.width / previewVisual.aspect)) }
      : PREVIEW_BOX;

   return (
      <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
         {/* Live preview at the current style (a taller box so a top/bottom alignment reads). */}
         <div className="flex items-center justify-center rounded-md border border-border bg-muted/30 p-3">
            <div style={previewSize}>
               <PortalCard content={previewContent} size={previewSize} />
            </div>
         </div>

         {/* Change target: reopens the shared picker in retarget mode (keeps the style + label). */}
         <button
            type="button"
            onClick={onChangeTarget}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
         >
            {/* eslint-disable-next-line react-hooks/static-components */}
            <DestinationIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-left">{targetLabel(content, t)}</span>
            <Replace className="h-4 w-4 shrink-0 text-muted-foreground" />
         </button>

         {/* Style: the four-way segmented control. */}
         <div>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('BoardView.portalStyleLabel')}</span>
            <div className="grid grid-cols-2 gap-1.5">
               {KIND_ORDER.map(({ kind: optionKind, labelKey }) => (
                  <button
                     key={optionKind}
                     type="button"
                     onClick={() => applyKind(optionKind)}
                     className={cn(
                        'rounded-md border px-2 py-1.5 text-sm transition-colors cursor-pointer',
                        mode === optionKind ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                     )}
                  >
                     {t(labelKey)}
                  </button>
               ))}
            </div>
         </div>

         {/* Conditional visual control: the curated icon grid (icon styles) or the image upload (image styles). */}
         {(mode === 'icon-text' || mode === 'icon-only') && (
            <PortalIconPicker value={style.visual?.kind === 'icon' ? style.visual.icon : ''} onPick={pickIcon} />
         )}
         {(mode === 'image-poster' || mode === 'image-composed') && (
            <PortalImageControl assetId={style.visual?.kind === 'image' ? style.visual.assetId : ''} onUploaded={setAsset} />
         )}

         {/* Composed image extras: the thumbnail's fill size + its background plate. The poster fills the box
             (`object-cover`) and has no plate, so both hide for it. */}
         {mode === 'image-composed' && (
            <>
               <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{t('BoardView.portalImageSize')}</span>
                  <input
                     type="range"
                     min={0.1}
                     max={1}
                     step={0.05}
                     value={imageSizeValue}
                     onChange={(event) => setSizeDraft(Number(event.target.value))}
                     onBlur={commitSize}
                     className="w-full cursor-pointer accent-primary"
                  />
               </label>
               <label className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{t('BoardView.portalImageBackground')}</span>
                  <Switch checked={style.visual?.kind === 'image' ? style.visual.background ?? true : true} onCheckedChange={setImageBackground} />
               </label>
            </>
         )}

         {/* Label + its alignment, paired on one row: the alignment cross positions the label around the visual,
             so it lives at the label's right. The cross shows only for the composed visual+text styles; text /
             image-poster keep a full-width label, icon-only has none (its label lives in the tooltip). The label
             commits on blur / unmount, not per keystroke, so one edit session = one undo. */}
         {mode !== 'icon-only' && (
            <div className="flex items-start gap-3">
               <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{t('BoardView.portalLabelField')}</span>
                  <textarea
                     ref={labelRef}
                     rows={2}
                     value={label}
                     placeholder={t('BoardView.portalLabelPlaceholder')}
                     onChange={(event) => setLabel(event.target.value)}
                     onBlur={commitLabel}
                     className="max-h-40 min-h-[5.75rem] resize-none overflow-y-auto rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
               </label>
               {isComposedKind(mode) && (
                  <PortalAlignControl value={style.align ?? 'right'} onChange={setAlign} />
               )}
            </div>
         )}

         {/* Portal background: the whole element's card face. Off = the bare visual/label float on the board. */}
         <label className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t('BoardView.portalBackground')}</span>
            <Switch checked={style.background ?? true} onCheckedChange={setBackground} />
         </label>
      </div>
   );
}

/** A short human label for the portal's current target (its cached name, else the external URL, else a kind). */
function targetLabel(content: PortalBoardContent, t: (key: string) => string): string {
   if (content.style.label) return content.style.label;
   if (content.lastKnownName) return content.lastKnownName;
   if (content.target.kind === 'external') return content.target.href;
   return t('BoardView.portalChangeTarget');
}

/**
 * The curated icon picker: a searchable `grid-cols-8` grid over the ~300-name catalog (statically imported, so
 * the search is instant and the bundle never balloons). Stores the icon NAME string; the selected name rings.
 */
function PortalIconPicker({ value, onPick }: { value: string; onPick: (name: string) => void }) {
   const { t } = useTranslation();
   const [search, setSearch] = useState('');
   const filtered = useMemo(() => {
      const term = search.trim().toLowerCase();
      return term ? PORTAL_ICON_NAMES.filter((name) => name.includes(term)) : PORTAL_ICON_NAMES;
   }, [search]);

   return (
      <div className="flex flex-col gap-1.5">
         <input
            type="text"
            value={search}
            placeholder={t('BoardView.portalIconSearch')}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
         />
         {filtered.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">{t('BoardView.portalNoIcons')}</div>
         ) : (
            <div className="grid max-h-44 grid-cols-8 gap-1 overflow-y-auto rounded-md border border-border p-1">
               {filtered.map((name) => {
                  const Icon = resolvePortalIcon(name);
                  const selected = name === value;
                  return (
                     <button
                        key={name}
                        type="button"
                        title={name}
                        aria-label={name}
                        onClick={() => onPick(name)}
                        className={cn(
                           'flex h-9 w-9 items-center justify-center rounded text-foreground hover:bg-muted cursor-pointer',
                           selected && 'ring-1 ring-primary bg-primary/10',
                        )}
                     >
                        <Icon className="h-4 w-4" />
                     </button>
                  );
               })}
            </div>
         )}
      </div>
   );
}

/**
 * The label alignment pad: a cross of four directional buttons setting which side of the visual the label sits
 * on (top / bottom / left / right). Shown only for the composed visual+text styles; the arrow points the way
 * the label goes. The selected side rings.
 */
function PortalAlignControl({ value, onChange }: { value: PortalAlign; onChange: (align: PortalAlign) => void }) {
   const { t } = useTranslation();
   const cell = (align: PortalAlign, Icon: LucideIcon, key: string) => (
      <button
         type="button"
         title={t(key)}
         aria-label={t(key)}
         onClick={() => onChange(align)}
         className={cn(
            'flex h-7 w-7 items-center justify-center rounded border transition-colors cursor-pointer',
            value === align ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
         )}
      >
         <Icon className="h-3.5 w-3.5" />
      </button>
   );
   return (
      <div className="flex shrink-0 flex-col gap-1.5">
         <span className="text-xs font-medium text-muted-foreground">{t('BoardView.portalAlignLabel')}</span>
         {/* Fixed 3x3 tracks (each a button's 1.75rem), self-centered: the empty corner/center cells can't
             collapse, so the arrows always read as a symmetric, centered plus. */}
         <div className="grid grid-cols-[repeat(3,1.75rem)] grid-rows-[repeat(3,1.75rem)] gap-1 self-center">
            <span />
            {cell('top', ArrowUp, 'BoardView.portalAlignTop')}
            <span />
            {cell('left', ArrowLeft, 'BoardView.portalAlignLeft')}
            <span />
            {cell('right', ArrowRight, 'BoardView.portalAlignRight')}
            <span />
            {cell('bottom', ArrowDown, 'BoardView.portalAlignBottom')}
            <span />
         </div>
      </div>
   );
}

/**
 * The image control: a free crop through `processImage -> storeAsset`, reporting the stored hash AND the
 * cropped image's aspect (width/height) so the portal can wear its shape. Shows Upload when empty, Change
 * once set. A failed crop/process leaves the current image untouched.
 */
function PortalImageControl({ assetId, onUploaded }: { assetId: string; onUploaded: (assetId: string, aspect: number) => void }) {
   const { t } = useTranslation();
   const [isProcessing, setIsProcessing] = useState(false);
   const fileInputRef = useRef<HTMLInputElement>(null);
   const { open: openCropper, dialog: cropperDialog } = useImageCropper();

   const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = ''; // allow re-picking the same file
      if (!file) return;
      const cropped = await openCropper(file, { aspect: 'free' });
      if (!cropped) return;
      setIsProcessing(true);
      try {
         const processed = await processImage(cropped);
         await storeAsset(processed);
         const aspect = processed.height > 0 ? processed.width / processed.height : 1;
         onUploaded(processed.hash, aspect);
      } catch {
         // Leaves the existing image untouched.
      } finally {
         setIsProcessing(false);
      }
   };

   return (
      <>
         <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-foreground hover:text-foreground transition-colors cursor-pointer disabled:cursor-default"
         >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : assetId ? <ImageIcon className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            <span>{assetId ? t('BoardView.imageChange') : t('BoardView.imageUpload')}</span>
         </button>
         <input ref={fileInputRef} type="file" accept={ACCEPT_IMAGE} className="hidden" onChange={handleFileSelected} />
         {cropperDialog}
      </>
   );
}
