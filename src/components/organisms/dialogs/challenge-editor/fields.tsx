// -- React Imports --
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

// -- Icon Imports --
import { Image as ImageIcon, Loader2, Minus, Plus, Trash2, Upload } from 'lucide-react';

// -- Component Imports --
import { MentionMarkdown } from '@/components/molecules/MentionMarkdown';

// -- Store and Hook Imports --
import { useAssetObjectUrl } from '@/hooks/useAssetObjectUrl';
import { useImageUpload } from '@/hooks/useImageUpload';

// -- Shared Constants --
import { CHALLENGE_ART_ASPECT } from '@/lib/cards/challengeArt';
import { ACCEPT_IMAGE } from '@/lib/utils/fileAccept';

/** A small square ghost button for row controls. */
export function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
   return (
      <button type="button" onClick={onClick} title={label} aria-label={label} className="touch-target flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer">
         {children}
      </button>
   );
}

/** A labeled field wrapper. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
   return (
      <div className="flex flex-col gap-1.5">
         <Label className="text-sm font-semibold">{label}</Label>
         {children}
      </div>
   );
}

/** A labeled dynamic-list section with an add button. */
export function ListSection({ label, addLabel, onAdd, children }: { label: string; addLabel: string; onAdd: () => void; children: ReactNode }) {
   return (
      <div className="flex flex-col gap-1.5">
         <Label className="text-sm font-semibold">{label}</Label>
         <div className="flex flex-col gap-1.5">{children}</div>
         <Button type="button" variant="ghost" size="sm" onClick={onAdd} className="mt-1 w-full cursor-pointer border border-dashed">
            <Plus className="mr-1 h-4 w-4" />{addLabel}
         </Button>
      </div>
   );
}

/** A live styled preview of authored text, shown once it carries a `{brace}` mention. */
export function MentionPreview({ text }: { text: string }) {
   if (!text.includes('{')) return null;
   return (
      <div className="rounded bg-muted/50 px-2 py-1 text-xs leading-relaxed">
         <MentionMarkdown text={text} />
      </div>
   );
}

/** A -/value/+ stepper clamped to `[min, max]`. */
export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (value: number) => void }) {
   const set = (next: number) => onChange(Math.max(min, Math.min(max, next)));
   return (
      <div className="flex shrink-0 items-center justify-between gap-1 rounded-md border border-border px-1 py-0.5">
         <IconButton onClick={() => set(value - 1)} label="-"><Minus className="h-4 w-4" /></IconButton>
         <span className="w-7 text-center font-mono text-sm tabular-nums">{value}</span>
         <IconButton onClick={() => set(value + 1)} label="+"><Plus className="h-4 w-4" /></IconButton>
      </div>
   );
}

/** The image field: reuses the asset pipeline (process -> store -> hash), showing a preview or an upload prompt. */
export function ImagePicker({ assetId, onChange }: { assetId: string | null; onChange: (assetId: string | null) => void }) {
   const { t } = useTranslation();
   const { url, isLoading } = useAssetObjectUrl(assetId);
   const { fileInputRef, open, isProcessing, handleFileSelected, cropperDialog } = useImageUpload(onChange, { aspect: CHALLENGE_ART_ASPECT });
   const showSpinner = isProcessing || (assetId !== null && isLoading);

   return (
      <div className="flex flex-col gap-2">
         <div className="relative w-full overflow-hidden rounded-md border border-border bg-muted" style={{ aspectRatio: CHALLENGE_ART_ASPECT }}>
            {showSpinner ? (
               <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : url ? (
               <img src={url} alt="" className="h-full w-full object-cover" />
            ) : (
               <div className="flex h-full w-full items-center justify-center text-muted-foreground"><ImageIcon className="h-8 w-8" /></div>
            )}
         </div>
         <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={open} className="cursor-pointer">
               <Upload className="mr-1 h-4 w-4" />{url ? t('ChallengeCard.editor.changeImage') : t('ChallengeCard.editor.setImage')}
            </Button>
            {url && (
               <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} className="cursor-pointer text-destructive">
                  <Trash2 className="mr-1 h-4 w-4" />{t('Common.remove')}
               </Button>
            )}
         </div>
         <input ref={fileInputRef} type="file" accept={ACCEPT_IMAGE} className="hidden" onChange={handleFileSelected} />
         {cropperDialog}
      </div>
   );
}
