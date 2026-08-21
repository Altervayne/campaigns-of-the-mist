// -- React Imports --
import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Loader2, Upload } from 'lucide-react';

// -- Basic UI Imports --
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { ACCEPT_MASK_IMAGE } from '@/lib/utils/fileAccept';

// -- Mask Library --
import { MASK_PRESETS, getMaskPreset, type MaskPreset } from '@/lib/board/maskPresets';
import { useStencilLibraryStore } from '@/lib/stores/stencilLibraryStore';
import { useAssetObjectUrl } from '@/hooks/useAssetObjectUrl';

// -- Type Imports --
import type { StencilRecord } from '@/lib/assets/stencilRecords';

/*
 * The stencil dialog: the source image previewed live under the chosen shape mask, plus a picker of "None
 * (rectangle)", the preset shapes, and the user's stencil LIBRARY (each entry a saved mask), with a text
 * filter over the library and an "Upload custom" tile that quick-adds an upload straight into the library.
 * No bake happens here - the preview is a cheap CSS clip/mask; Apply hands the choice back and the hook does
 * the canvas bake. A preset previews via an SVG clipPath; a library entry previews via CSS `mask-image`. Full
 * rename/delete/reorder live in the manager (Phase 3); here the library is pick + filter + quick-add. Board
 * is desktop-only, so there is no mobile branch. All chrome stays on theme tokens.
 */

/** The mask the picker has selected: a preset shape (by id), a library entry (by id), or none. */
export type StencilSelection =
   | null
   | { kind: 'preset'; id: string }
   | { kind: 'library'; id: string };

interface ImageStencilDialogProps {
   /** Object URL of the UN-masked source, for the live preview. */
   imageUrl: string;
   /** The mask to pre-select when re-opening an already-masked image; null selects "None". */
   initialSelection: StencilSelection;
   /** True while the bake/store runs after Apply, for the spinner + disabled state. */
   isProcessing: boolean;
   /** Normalizes + stores an uploaded mask into the library, returning the new entry's selection or null (warning surfaced upstream). */
   onQuickAdd: (file: File) => Promise<StencilSelection>;
   onCancel: () => void;
   /** The mask to apply, or null to reset to the plain rectangle. */
   onApply: (selection: StencilSelection) => void;
}

export function ImageStencilDialog({ imageUrl, initialSelection, isProcessing, onQuickAdd, onCancel, onApply }: ImageStencilDialogProps) {
   const { t } = useTranslation();
   const stencils = useStencilLibraryStore((state) => state.stencils);
   const [selection, setSelection] = useState<StencilSelection>(initialSelection);
   const [query, setQuery] = useState('');
   const [isUploading, setIsUploading] = useState(false);
   const fileInputRef = useRef<HTMLInputElement>(null);
   const clipId = useId();

   const selectedPreset = selection?.kind === 'preset' ? getMaskPreset(selection.id) : undefined;
   const selectedLibrary = selection?.kind === 'library' ? stencils.find((entry) => entry.id === selection.id) : undefined;
   // The selected library entry's mask, for the stage preview (tiles resolve their own per entry, below).
   const { url: selectedLibraryUrl } = useAssetObjectUrl(selectedLibrary?.maskAssetId ?? null);
   const busy = isProcessing || isUploading;

   const filtered = useMemo(() => {
      const needle = query.trim().toLowerCase();
      if (!needle) return stencils;
      return stencils.filter((entry) => entry.name.toLowerCase().includes(needle));
   }, [stencils, query]);

   const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      setIsUploading(true);
      const added = await onQuickAdd(file);
      setIsUploading(false);
      if (added) setSelection(added);
   };

   return (
      <Dialog open onOpenChange={(open) => !open && onCancel()}>
         <DialogContent showCloseButton={false} className="max-w-3xl gap-0 overflow-hidden p-0">
            <div className="border-b border-border px-4 py-3">
               <DialogTitle className="text-base">{t('BoardStencil.title')}</DialogTitle>
            </div>

            {/* Stage: the source clipped by the selected shape, transparency showing through the muted ground. */}
            <div className="flex h-[min(60vh,480px)] w-full items-center justify-center bg-muted p-6">
               {selectedPreset && (
                  <svg width="0" height="0" aria-hidden className="absolute">
                     <defs>
                        <clipPath id={clipId} clipPathUnits="objectBoundingBox">
                           <path d={selectedPreset.path} transform={`scale(${1 / selectedPreset.viewBox.width} ${1 / selectedPreset.viewBox.height})`} />
                        </clipPath>
                     </defs>
                  </svg>
               )}
               <img
                  src={imageUrl}
                  alt=""
                  draggable={false}
                  className="max-h-full max-w-full object-contain"
                  style={
                     selectedPreset
                        ? { clipPath: `url(#${clipId})` }
                        : selectedLibraryUrl
                           ? maskImageStyle(selectedLibraryUrl)
                           : undefined
                  }
               />
            </div>

            {/* Presets + None: always shown, a rectangle plus each bundled shape. */}
            <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
               <MaskOption
                  label={t('BoardStencil.maskNone')}
                  active={selection === null}
                  onClick={() => setSelection(null)}
               >
                  <rect x="8" y="8" width="84" height="84" rx="8" fill="currentColor" />
               </MaskOption>
               {MASK_PRESETS.map((preset) => (
                  <MaskOption
                     key={preset.id}
                     label={t(preset.labelKey)}
                     active={selection?.kind === 'preset' && selection.id === preset.id}
                     onClick={() => setSelection({ kind: 'preset', id: preset.id })}
                  >
                     <MaskGlyph preset={preset} />
                  </MaskOption>
               ))}
            </div>

            {/* Library: the user's saved masks, filtered by name, plus the quick-add upload tile. */}
            <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
               <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{t('BoardStencil.library')}</span>
                  {stencils.length > 0 && (
                     <Input
                        type="text"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t('BoardStencil.searchLibrary')}
                        className="h-8 w-48"
                     />
                  )}
               </div>
               <div className="flex flex-wrap gap-2">
                  {filtered.map((entry) => (
                     <LibraryMaskTile
                        key={entry.id}
                        entry={entry}
                        active={selection?.kind === 'library' && selection.id === entry.id}
                        onClick={() => setSelection({ kind: 'library', id: entry.id })}
                     />
                  ))}
                  <button
                     type="button"
                     title={t('BoardStencil.uploadCustom')}
                     aria-label={t('BoardStencil.uploadCustom')}
                     onClick={() => fileInputRef.current?.click()}
                     disabled={busy}
                     className="flex w-20 shrink-0 cursor-pointer flex-col items-center gap-1 rounded-md border border-border p-2 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                     <span className="flex h-10 w-10 items-center justify-center">
                        {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                     </span>
                     <span className="w-full truncate text-center text-xs">{t('BoardStencil.uploadCustom')}</span>
                  </button>
               </div>
               {stencils.length > 0 && filtered.length === 0 && (
                  <span className="text-xs text-muted-foreground">{t('BoardStencil.libraryNoMatches')}</span>
               )}
            </div>

            <DialogFooter className="border-t border-border px-4 py-3">
               <Button type="button" variant="outline" onClick={onCancel} className="cursor-pointer">{t('Common.cancel')}</Button>
               <Button type="button" onClick={() => onApply(selection)} disabled={busy} className="cursor-pointer">
                  {isProcessing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {t('BoardStencil.apply')}
               </Button>
            </DialogFooter>

            <input ref={fileInputRef} type="file" accept={ACCEPT_MASK_IMAGE} className="hidden" onChange={handleFileSelected} />
         </DialogContent>
      </Dialog>
   );
}

/** Stretches a mask image across the element it styles, so it maps to the box the same way the bake does. */
function maskImageStyle(url: string): React.CSSProperties {
   return {
      WebkitMaskImage: `url(${url})`,
      maskImage: `url(${url})`,
      WebkitMaskSize: '100% 100%',
      maskSize: '100% 100%',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
   };
}

/** A `contain`-fit variant of the mask style for the small picker glyph (keeps the shape's own aspect). */
function maskGlyphStyle(url: string): React.CSSProperties {
   return {
      WebkitMaskImage: `url(${url})`,
      maskImage: `url(${url})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
   };
}

/** One library entry's picker tile: its mask painted as a glyph over its name, highlighted when active. */
function LibraryMaskTile({ entry, active, onClick }: { entry: StencilRecord; active: boolean; onClick: () => void }) {
   const { url } = useAssetObjectUrl(entry.maskAssetId);
   return (
      <MaskOption label={entry.name} active={active} onClick={onClick}>
         {url && (
            <foreignObject x="0" y="0" width="100" height="100">
               {/* The mask's opaque region, painted in the tile's foreground via CSS mask. */}
               <div className="h-full w-full" style={{ backgroundColor: 'currentColor', ...maskGlyphStyle(url) }} />
            </foreignObject>
         )}
      </MaskOption>
   );
}

/** One entry in the mask picker: a glyph tile over its label, highlighted when active. */
function MaskOption({ label, active, onClick, children }: {
   label: string;
   active: boolean;
   onClick: () => void;
   children: React.ReactNode;
}) {
   return (
      <button
         type="button"
         title={label}
         aria-label={label}
         aria-pressed={active}
         onClick={onClick}
         className={cn(
            'flex w-20 shrink-0 cursor-pointer flex-col items-center gap-1 rounded-md border p-2 transition-colors',
            active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground',
         )}
      >
         <svg viewBox="0 0 100 100" className="h-10 w-10">{children}</svg>
         <span className="w-full truncate text-center text-xs">{label}</span>
      </button>
   );
}

/** Fills a preset's path so the picker tile reads as the shape it applies. */
function MaskGlyph({ preset }: { preset: MaskPreset }) {
   return (
      <path
         d={preset.path}
         transform={`scale(${100 / preset.viewBox.width} ${100 / preset.viewBox.height})`}
         fill="currentColor"
      />
   );
}
