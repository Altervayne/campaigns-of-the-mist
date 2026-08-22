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

/** The continuous-slider adjustments (all multipliers, 1 = neutral, absent from content = 1). */
type AdjustKey = 'opacity' | 'brightness' | 'contrast' | 'saturation';
const ADJUST_RANGE: Record<AdjustKey, { min: number; max: number; labelKey: string }> = {
   opacity: { min: 0.1, max: 1, labelKey: 'imageOpacity' },
   brightness: { min: 0.5, max: 1.5, labelKey: 'imageBrightness' },
   contrast: { min: 0.5, max: 1.5, labelKey: 'imageContrast' },
   saturation: { min: 0, max: 2, labelKey: 'imageSaturation' },
};

/*
 * The Effects section of the image-style popover: shadow depth, opacity, a color look, and the tone sliders
 * (brightness / contrast / saturation). Applies to every image (masked or not). Shadow and the looks commit
 * on click; each slider buffers a draft that shows live and commits ONE undo step on release / popover-close
 * / unmount (updateItemContent is one command per call, so a live per-frame commit would flood the stack).
 * Every commit spreads `content` and sets one field, so the stencil/source fields survive.
 */
export function ImageEffectsSection({ content, onChange, onPreview }: { content: ImageBoardContent; onChange: (content: ImageBoardContent) => void; onPreview: (content: ImageBoardContent) => void }) {
   const { t } = useTranslation();

   // Commits read the latest content from a ref so a release firing after another edit is never stale.
   const contentRef = useRef(content);
   useEffect(() => { contentRef.current = content; });

   // Each slider buffers its value here; absent key = untouched (the committed value shows). A draft equal
   // to the unit default (1) drops the field on commit.
   const [drafts, setDrafts] = useState<Partial<Record<AdjustKey, number>>>({});
   const valueOf = (key: AdjustKey) => drafts[key] ?? content[key] ?? 1;

   const withField = (source: ImageBoardContent, key: keyof ImageBoardContent, value: number | undefined): ImageBoardContent => {
      const next: ImageBoardContent = { ...source };
      if (value === undefined) delete next[key];
      else (next[key] as number) = value;
      return next;
   };

   // Folds a set of slider drafts into a content base (a unit value drops the field), so a click-commit never
   // discards an unreleased slider edit, and the live preview reflects every in-progress slider at once.
   const foldDraftsInto = (base: ImageBoardContent, draftMap: Partial<Record<AdjustKey, number>>): ImageBoardContent => {
      let next = base;
      for (const [key, value] of Object.entries(draftMap) as [AdjustKey, number][]) {
         next = withField(next, key, value === 1 ? undefined : value);
      }
      return next;
   };
   const foldDrafts = (base: ImageBoardContent): ImageBoardContent => foldDraftsInto(base, drafts);

   // A slider drag: buffer the value (drives its own % readout) and push the folded content as a live,
   // non-committing preview so the picture tracks the drag without a per-frame undo write.
   const inputAdjust = (key: AdjustKey, value: number) => {
      const nextDrafts = { ...drafts, [key]: value };
      setDrafts(nextDrafts);
      onPreview(foldDraftsInto(contentRef.current, nextDrafts));
   };

   // A discrete (shadow / look) commit: fold pending slider drafts, then set-or-clear the one field.
   const commitField = <K extends keyof ImageBoardContent>(key: K, value: ImageBoardContent[K] | undefined) => {
      const next: ImageBoardContent = { ...foldDrafts(contentRef.current) };
      if (value === undefined) delete next[key];
      else next[key] = value;
      setDrafts({});
      onChange(next);
   };

   // A slider release: commit that one field and drop its draft.
   const commitAdjust = (key: AdjustKey) => {
      const value = drafts[key];
      if (value === undefined) return;
      setDrafts((prev) => { const next = { ...prev }; delete next[key]; return next; });
      onChange(withField(contentRef.current, key, value === 1 ? undefined : value));
   };

   // Flush any buffered slider edits when the popover closes or the image is deselected (unmount).
   const commitDrafts = () => {
      if (Object.keys(drafts).length === 0) return;
      const next = foldDrafts(contentRef.current);
      setDrafts({});
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

         <AdjustSlider adjust="opacity" value={valueOf('opacity')} onInput={(v) => inputAdjust('opacity', v)} onCommit={() => commitAdjust('opacity')} />

         <section className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('BoardView.imageFilter')}</span>
            <div className="grid grid-cols-4 gap-1">
               <FilterTile label={t('Common.none')} selected={!content.filter} onClick={() => commitField('filter', undefined)} />
               {FILTER_OPTIONS.map((filter) => (
                  <FilterTile key={filter} filter={filter} label={t(`BoardView.imageFilter_${filter}`)} selected={content.filter === filter} onClick={() => commitField('filter', filter)} />
               ))}
            </div>
         </section>

         <AdjustSlider adjust="brightness" value={valueOf('brightness')} onInput={(v) => inputAdjust('brightness', v)} onCommit={() => commitAdjust('brightness')} />
         <AdjustSlider adjust="contrast" value={valueOf('contrast')} onInput={(v) => inputAdjust('contrast', v)} onCommit={() => commitAdjust('contrast')} />
         <AdjustSlider adjust="saturation" value={valueOf('saturation')} onInput={(v) => inputAdjust('saturation', v)} onCommit={() => commitAdjust('saturation')} />
      </>
   );
}

/** A labeled 0..N multiplier slider (value shown as a percent); buffers via `onInput`, commits on release. */
function AdjustSlider({ adjust, value, onInput, onCommit }: { adjust: AdjustKey; value: number; onInput: (value: number) => void; onCommit: () => void }) {
   const { t } = useTranslation();
   const { min, max, labelKey } = ADJUST_RANGE[adjust];
   return (
      <label className="flex flex-col gap-1">
         <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            {t(`BoardView.${labelKey}`)}
            <span className="font-mono tabular-nums">{Math.round(value * 100)}%</span>
         </span>
         <input
            type="range"
            min={min}
            max={max}
            step={0.05}
            value={value}
            onChange={(event) => onInput(Number(event.target.value))}
            onPointerUp={onCommit}
            className="w-full cursor-pointer accent-primary"
         />
      </label>
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
