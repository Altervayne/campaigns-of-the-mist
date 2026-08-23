// -- React Imports --
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { ColorPickerPopover } from '@/components/molecules/color/ColorPickerPopover';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { framePlateSpec, DEFAULT_IMAGE_BORDER, IMAGE_TAPE_COLOR } from '@/lib/board/imageStyle';
import { CONNECTION_PALETTE } from '@/lib/board/boardConnections';
import { pushRecentColor, readRecentColors } from '@/lib/recentColors';
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';

// -- Type Imports --
import type { ImageBoardContent, ImageFrame } from '@/lib/types/board';

/** The frame presets shown as tiles, in grid order (None is rendered first, separately). */
const FRAME_OPTIONS: ImageFrame[] = ['polaroid', 'matte', 'tape', 'slide'];
/** Border width bound (px); 0 clears the border. */
const BORDER_WIDTH_MAX = 8;
/** Border corner-radius bound (px). */
const BORDER_RADIUS_MAX = 24;

/*
 * The Frame section of the image-style popover: the frame tiles (None + the four presets, one grid row) and
 * a compact custom border - a color swatch plus width + radius sliders (width 0 = no border). A matte or a
 * straight outline around a shaped image reads wrong, so the caller drops this whole section when the image
 * is masked. The sliders buffer a draft and commit ONE undo step on release / popover-close / unmount; every
 * write spreads `content` and sets one field, so the stencil/source fields survive.
 */
export function ImageFrameSection({ content, onChange, onPreview }: { content: ImageBoardContent; onChange: (content: ImageBoardContent) => void; onPreview: (content: ImageBoardContent) => void }) {
   const { t } = useTranslation();
   const border = content.border;

   // Commits read the latest content from a ref so a release firing after another edit is never stale.
   const contentRef = useRef(content);
   useEffect(() => { contentRef.current = content; });

   // The border sliders buffer their value; null = untouched (the committed value shows).
   const [widthDraft, setWidthDraft] = useState<number | null>(null);
   const [radiusDraft, setRadiusDraft] = useState<number | null>(null);
   const widthValue = widthDraft ?? border?.width ?? 0;
   const radiusValue = radiusDraft ?? border?.radius ?? DEFAULT_IMAGE_BORDER.radius;

   // Spread content and set (or, for a None value, delete) one field, so the stencil/source fields survive.
   const setField = <K extends keyof ImageBoardContent>(key: K, value: ImageBoardContent[K] | undefined) => {
      const next: ImageBoardContent = { ...content };
      if (value === undefined) delete next[key];
      else next[key] = value;
      onChange(next);
   };

   // Folds width/radius drafts onto a base: width 0 drops the whole border, else builds it from the current
   // color (the default when the border was off). Takes explicit drafts so an input handler can fold with its
   // just-set value before the state settles.
   const foldBorderDraftsWith = (base: ImageBoardContent, wDraft: number | null, rDraft: number | null): ImageBoardContent => {
      if (wDraft === null && rDraft === null) return base;
      const width = wDraft ?? base.border?.width ?? 0;
      if (width <= 0) { const next = { ...base }; delete next.border; return next; }
      const radius = rDraft ?? base.border?.radius ?? DEFAULT_IMAGE_BORDER.radius;
      const color = base.border?.color ?? DEFAULT_IMAGE_BORDER.color;
      return { ...base, border: { color, width, radius } };
   };

   // A slider drag: buffer the value (drives its % readout) and push a non-committing preview so the border
   // tracks the drag; the store write (one undo step) waits for release / close.
   const inputWidth = (value: number) => { setWidthDraft(value); onPreview(foldBorderDraftsWith(contentRef.current, value, radiusDraft)); };
   const inputRadius = (value: number) => { setRadiusDraft(value); onPreview(foldBorderDraftsWith(contentRef.current, widthDraft, value)); };

   const commitBorder = () => {
      if (widthDraft === null && radiusDraft === null) return;
      const next = foldBorderDraftsWith(contentRef.current, widthDraft, radiusDraft);
      setWidthDraft(null);
      setRadiusDraft(null);
      onChange(next);
   };
   // Flush a buffered slider edit when the popover closes or the image is deselected (unmount).
   useCommitOnUnmount(commitBorder);

   return (
      <>
         <section className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('BoardView.imageFrame')}</span>
            <div className="grid grid-cols-5 gap-1.5">
               <FrameTile label={t('Common.none')} selected={!content.frame} onClick={() => setField('frame', undefined)} />
               {FRAME_OPTIONS.map((frame) => (
                  <FrameTile
                     key={frame}
                     frame={frame}
                     label={t(`BoardView.imageFrame_${frame}`)}
                     selected={content.frame === frame}
                     onClick={() => setField('frame', frame)}
                  />
               ))}
            </div>
         </section>

         <section className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
               {t('BoardView.imageBorder')}
               <BorderColorControl content={content} onChange={onChange} onPreview={onPreview} />
            </span>
            <BorderSlider
               label={t('BoardView.imageBorderWidth')}
               value={widthValue}
               max={BORDER_WIDTH_MAX}
               onInput={inputWidth}
               onCommit={commitBorder}
            />
            <BorderSlider
               label={t('BoardView.imageBorderRadius')}
               value={radiusValue}
               max={BORDER_RADIUS_MAX}
               disabled={widthValue <= 0}
               onInput={inputRadius}
               onCommit={commitBorder}
            />
         </section>
      </>
   );
}

/** One labeled border slider (width / radius): the label + px value in a header, the range full-width below. */
function BorderSlider({ label, value, max, disabled, onInput, onCommit }: {
   label: string;
   value: number;
   max: number;
   disabled?: boolean;
   onInput: (value: number) => void;
   onCommit: () => void;
}) {
   return (
      <label className={cn('flex flex-col gap-1', disabled && 'opacity-40')}>
         <span className="flex items-center justify-between text-[10px] text-muted-foreground">
            {label}
            <span className="font-mono tabular-nums">{value}px</span>
         </span>
         <input
            type="range"
            min={0}
            max={max}
            step={1}
            value={value}
            disabled={disabled}
            aria-label={label}
            onChange={(event) => onInput(Number(event.target.value))}
            onPointerUp={onCommit}
            className="w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
         />
      </label>
   );
}

/** A small preview tile for a frame preset (or a bare photo for None), mirroring the real matte look. The
 * preview carries a soft shadow the real frame doesn't: a picker-only aid so the off-white matte stays
 * legible against a light-theme popover, where plate and background are nearly the same tone. */
function FrameTile({ frame, label, selected, onClick }: { frame?: ImageFrame; label: string; selected: boolean; onClick: () => void }) {
   const plate = framePlateSpec(frame);
   const isTape = frame === 'tape';
   return (
      <button
         type="button"
         title={label}
         aria-label={label}
         onClick={onClick}
         className={cn('flex h-12 w-full cursor-pointer items-center justify-center rounded hover:bg-muted', selected && 'bg-muted ring-1 ring-primary')}
      >
         <span className="relative block h-9 w-9 shadow-md" style={plate ? { padding: plate.padding, background: plate.background, borderRadius: plate.radius } : undefined}>
            <span className="block h-full w-full rounded-[1px] bg-gradient-to-br from-sky-400/70 to-indigo-500/70" />
            {isTape && (
               <>
                  <span className="pointer-events-none absolute -top-1 left-0 h-1.5 w-3.5 -rotate-12" style={{ background: IMAGE_TAPE_COLOR }} />
                  <span className="pointer-events-none absolute -top-1 right-0 h-1.5 w-3.5 rotate-12" style={{ background: IMAGE_TAPE_COLOR }} />
               </>
            )}
         </span>
      </button>
   );
}

/**
 * The border color swatch: the shared color popover. A picker drag previews live (so the border tracks the SV
 * square) but commits ONE update on close (a per-sample commit would flood the undo stack). Picking a color on
 * an off border initializes it from the default width/radius.
 */
function BorderColorControl({ content, onChange, onPreview }: { content: ImageBoardContent; onChange: (content: ImageBoardContent) => void; onPreview: (content: ImageBoardContent) => void }) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);
   const swatch = content.border?.color ?? DEFAULT_IMAGE_BORDER.color;

   // The commit reads from refs so it is correct from any close path and unaffected by stale closures.
   const pendingRef = useRef<string | null>(null);
   const contentRef = useRef(content);
   useEffect(() => { contentRef.current = content; });

   const commit = useCallback(() => {
      const next = pendingRef.current;
      pendingRef.current = null;
      if (next === null) return; // never applied -> nothing previewed, nothing to commit
      // Always commit when a color was applied (even if unchanged), so the close clears the live preview -
      // an early return here would strand the preview override on the image.
      const current = contentRef.current;
      const base = current.border ?? DEFAULT_IMAGE_BORDER;
      onChange({ ...current, border: { ...base, color: next } });
      if (!(CONNECTION_PALETTE as readonly string[]).includes(next)) pushRecentColor(next);
   }, [onChange]);

   // Commit a pending color if the control unmounts (the image is deselected) before the popover's dismiss fires.
   const commitRef = useRef(commit);
   useEffect(() => { commitRef.current = commit; });
   useEffect(() => () => { commitRef.current(); }, []);

   return (
      <ColorPickerPopover
         open={open}
         onOpenChange={(next) => { if (!next) commit(); setOpen(next); }}
         activeColor={swatch}
         palette={CONNECTION_PALETTE}
         recent={readRecentColors()}
         recentLabel={t('BoardView.recentColors')}
         onApply={(color) => {
            const next = color ?? DEFAULT_IMAGE_BORDER.color;
            pendingRef.current = next;
            // Preview live so the border tracks the SV drag; the store write (one undo step) waits for close.
            const current = contentRef.current;
            const base = current.border ?? DEFAULT_IMAGE_BORDER;
            onPreview({ ...current, border: { ...base, color: next } });
         }}
         trigger={
            <button
               type="button"
               title={t('BoardView.imageBorderColor')}
               aria-label={t('BoardView.imageBorderColor')}
               onPointerDown={(event) => event.stopPropagation()}
               className="h-5 w-5 shrink-0 cursor-pointer rounded border border-border"
               style={{ backgroundColor: swatch }}
            />
         }
      />
   );
}
