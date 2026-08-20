// -- React Imports --
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Loader2 } from 'lucide-react';

// -- Basic UI Imports --
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Mask Library --
import { MASK_PRESETS, getMaskPreset, type MaskPreset } from '@/lib/board/maskPresets';

/*
 * The stencil dialog: the source image previewed live under the chosen shape mask (an SVG clipPath scaled
 * from the preset's viewBox), plus a picker of "None (rectangle)" and the preset shapes. No bake happens
 * here - the preview is a cheap clip; Apply hands the choice back and the hook does the canvas bake. Board
 * is desktop-only, so there is no mobile branch. All chrome stays on theme tokens.
 */

interface ImageStencilDialogProps {
   /** Object URL of the UN-masked source, for the live preview. */
   imageUrl: string;
   /** Preset id to pre-select when re-opening an already-masked image; null selects "None". */
   initialMaskId: string | null;
   /** True while the bake/store runs after Apply, for the spinner + disabled state. */
   isProcessing: boolean;
   onCancel: () => void;
   /** A preset id to mask with, or null to reset to the plain rectangle. */
   onApply: (maskId: string | null) => void;
}

export function ImageStencilDialog({ imageUrl, initialMaskId, isProcessing, onCancel, onApply }: ImageStencilDialogProps) {
   const { t } = useTranslation();
   const [selectedMaskId, setSelectedMaskId] = useState<string | null>(initialMaskId);
   const clipId = useId();

   const selectedPreset = selectedMaskId ? getMaskPreset(selectedMaskId) : undefined;

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
                  style={selectedPreset ? { clipPath: `url(#${clipId})` } : undefined}
               />
            </div>

            {/* Mask picker: "None" plus each preset as a small filled glyph of its shape. */}
            <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
               <MaskOption
                  label={t('BoardStencil.maskNone')}
                  active={selectedMaskId === null}
                  onClick={() => setSelectedMaskId(null)}
               >
                  <rect x="8" y="8" width="84" height="84" rx="8" fill="currentColor" />
               </MaskOption>
               {MASK_PRESETS.map((preset) => (
                  <MaskOption
                     key={preset.id}
                     label={t(preset.labelKey)}
                     active={selectedMaskId === preset.id}
                     onClick={() => setSelectedMaskId(preset.id)}
                  >
                     <MaskGlyph preset={preset} />
                  </MaskOption>
               ))}
            </div>

            <DialogFooter className="border-t border-border px-4 py-3">
               <Button type="button" variant="outline" onClick={onCancel} className="cursor-pointer">{t('Common.cancel')}</Button>
               <Button type="button" onClick={() => onApply(selectedMaskId)} disabled={isProcessing} className="cursor-pointer">
                  {isProcessing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {t('BoardStencil.apply')}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
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
