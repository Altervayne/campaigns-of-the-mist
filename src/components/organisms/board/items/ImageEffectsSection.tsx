// -- React Imports --
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { imageFilterCss } from '@/lib/board/imageStyle';
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';

// -- Type Imports --
import type { ImageBoardContent, ImageFilter, ImageShadow } from '@/lib/types/board';

/** Shadow depth options, in row order. */
const SHADOW_OPTIONS: ImageShadow[] = ['sm', 'md', 'lg'];
/** Color-look options, in row order. */
const FILTER_OPTIONS: ImageFilter[] = ['grayscale', 'sepia', 'noir'];

/*
 * The Effects section of the image-style popover: shadow depth, opacity, a color look, and brightness.
 * Applies to every image (masked or not). Shadow and the looks commit on click; the two sliders buffer a
 * draft that shows live and commit ONE undo step on release / popover-close / unmount (updateItemContent is
 * one command per call, so a live per-frame commit would flood the stack). Every commit spreads `content`
 * and sets one field, so the stencil/source fields survive.
 */
export function ImageEffectsSection({ content, onChange }: { content: ImageBoardContent; onChange: (content: ImageBoardContent) => void }) {
   const { t } = useTranslation();

   // Commits read the latest content from a ref so a release firing after another edit is never stale.
   const contentRef = useRef(content);
   useEffect(() => { contentRef.current = content; });

   // The sliders buffer their value; null = untouched (the committed value shows). A draft equal to the unit
   // default drops the field.
   const [opacityDraft, setOpacityDraft] = useState<number | null>(null);
   const [brightnessDraft, setBrightnessDraft] = useState<number | null>(null);
   const opacityValue = opacityDraft ?? content.opacity ?? 1;
   const brightnessValue = brightnessDraft ?? content.brightness ?? 1;

   const withField = (source: ImageBoardContent, key: keyof ImageBoardContent, value: number | undefined): ImageBoardContent => {
      const next: ImageBoardContent = { ...source };
      if (value === undefined) delete next[key];
      else (next[key] as number) = value;
      return next;
   };

   // Folds any pending slider drafts into a content base (a unit value drops the field), so a click-commit
   // never discards an unreleased slider edit.
   const foldDrafts = (base: ImageBoardContent): ImageBoardContent => {
      let next = base;
      if (opacityDraft !== null) next = withField(next, 'opacity', opacityDraft === 1 ? undefined : opacityDraft);
      if (brightnessDraft !== null) next = withField(next, 'brightness', brightnessDraft === 1 ? undefined : brightnessDraft);
      return next;
   };

   const clearDrafts = () => { setOpacityDraft(null); setBrightnessDraft(null); };

   // A discrete (shadow / look) commit: fold pending slider drafts, then set-or-clear the one field.
   const commitField = <K extends keyof ImageBoardContent>(key: K, value: ImageBoardContent[K] | undefined) => {
      const next: ImageBoardContent = { ...foldDrafts(contentRef.current) };
      if (value === undefined) delete next[key];
      else next[key] = value;
      clearDrafts();
      onChange(next);
   };

   const commitOpacity = () => {
      if (opacityDraft === null) return;
      const value = opacityDraft;
      setOpacityDraft(null);
      onChange(withField(contentRef.current, 'opacity', value === 1 ? undefined : value));
   };
   const commitBrightness = () => {
      if (brightnessDraft === null) return;
      const value = brightnessDraft;
      setBrightnessDraft(null);
      onChange(withField(contentRef.current, 'brightness', value === 1 ? undefined : value));
   };
   // Flush any buffered slider edits when the popover closes or the image is deselected (unmount).
   const commitDrafts = () => {
      if (opacityDraft === null && brightnessDraft === null) return;
      const next = foldDrafts(contentRef.current);
      clearDrafts();
      onChange(next);
   };
   useCommitOnUnmount(commitDrafts);

   return (
      <>
         <section className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('BoardView.imageShadow')}</span>
            <div className="flex items-center gap-1">
               <PillButton label={t('Common.none')} selected={!content.shadow} onClick={() => commitField('shadow', undefined)} />
               {SHADOW_OPTIONS.map((shadow) => (
                  <PillButton key={shadow} label={t(`BoardView.imageShadow_${shadow}`)} selected={content.shadow === shadow} onClick={() => commitField('shadow', shadow)} />
               ))}
            </div>
         </section>

         <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
               {t('BoardView.imageOpacity')}
               <span className="font-mono tabular-nums">{Math.round(opacityValue * 100)}%</span>
            </span>
            <input
               type="range"
               min={0.1}
               max={1}
               step={0.05}
               value={opacityValue}
               onChange={(event) => setOpacityDraft(Number(event.target.value))}
               onPointerUp={commitOpacity}
               className="w-full cursor-pointer accent-primary"
            />
         </label>

         <section className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('BoardView.imageFilter')}</span>
            <div className="grid grid-cols-4 gap-1">
               <FilterTile label={t('Common.none')} selected={!content.filter} onClick={() => commitField('filter', undefined)} />
               {FILTER_OPTIONS.map((filter) => (
                  <FilterTile key={filter} filter={filter} label={t(`BoardView.imageFilter_${filter}`)} selected={content.filter === filter} onClick={() => commitField('filter', filter)} />
               ))}
            </div>
         </section>

         <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
               {t('BoardView.imageBrightness')}
               <span className="font-mono tabular-nums">{Math.round(brightnessValue * 100)}%</span>
            </span>
            <input
               type="range"
               min={0.5}
               max={1.5}
               step={0.05}
               value={brightnessValue}
               onChange={(event) => setBrightnessDraft(Number(event.target.value))}
               onPointerUp={commitBrightness}
               className="w-full cursor-pointer accent-primary"
            />
         </label>
      </>
   );
}

/**
 * A filter option: a live mini-preview (a fixed colorful gradient run through the real filter chain, so
 * grayscale reads gray, sepia warm, noir contrasty) over its label. `None` shows the bare gradient.
 */
function FilterTile({ filter, label, selected, onClick }: { filter?: ImageFilter; label: string; selected: boolean; onClick: () => void }) {
   return (
      <button
         type="button"
         title={label}
         aria-label={label}
         onClick={onClick}
         className={cn(
            'flex cursor-pointer flex-col items-center gap-1 rounded p-1 hover:bg-muted',
            selected && 'bg-muted ring-1 ring-primary',
         )}
      >
         <span
            aria-hidden
            className="h-8 w-full rounded-sm bg-gradient-to-br from-rose-400 via-amber-300 to-sky-400"
            style={{ filter: imageFilterCss(filter) }}
         />
         <span className="w-full truncate text-center text-[10px] leading-none text-foreground">{label}</span>
      </button>
   );
}

/** A compact selectable pill for the shadow option row. */
function PillButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
   return (
      <button
         type="button"
         aria-label={label}
         onClick={onClick}
         className={cn(
            'flex h-7 flex-1 cursor-pointer items-center justify-center rounded px-1.5 text-xs text-foreground hover:bg-muted',
            selected && 'bg-muted ring-1 ring-primary',
         )}
      >
         {label}
      </button>
   );
}
