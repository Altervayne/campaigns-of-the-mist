// -- React Imports --
import { useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentType, ReactNode } from 'react';

// -- Icon Imports --
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Trash2 } from 'lucide-react';

// -- Component Imports --
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { ImageRequest } from '@/components/organisms/note/live/assetImageWidget';
import type { NoteImageAlign } from '@/lib/notes/noteImageHint';

interface MobileNoteImageSheetProps {
   /** The open request (null = closed). Anchored to the tapped image; the sheet re-reads its hint each render. */
   request: ImageRequest | null;
   /** Explicit Done / backdrop tap closes the sheet. */
   onClose: () => void;
}

/** Align presets: the four block positions, each with its glyph. `full` spans the measure (no width axis). */
const ALIGN_PRESETS: { key: NoteImageAlign; icon: ComponentType<{ className?: string }>; labelKey: string }[] = [
   { key: 'left', icon: AlignLeft, labelKey: 'alignLeft' },
   { key: 'center', icon: AlignCenter, labelKey: 'alignCenter' },
   { key: 'right', icon: AlignRight, labelKey: 'alignRight' },
   { key: 'full', icon: AlignJustify, labelKey: 'alignFull' },
];

/** Width presets (percent of the measure), thumb-set since drag handles are unusable on touch. */
const WIDTH_PRESETS = [30, 50, 75, 100];

/*
 * The mobile image options slide-up: the touch stand-in for the desktop hover chrome. Tapping an inline image
 * opens it; align + width preset chips (no drag handles on a phone) and a Remove. Align/width tweaks re-read the
 * hint and stay open so a run of tweaks chains; Remove closes. Width has no meaning for a full-width image, so
 * that group greys out. App-token chrome.
 */
export function MobileNoteImageSheet({ request, onClose }: MobileNoteImageSheetProps) {
   const { t } = useTranslation();
   // Align/width dispatch a CM6 change but move no React state, so force a re-render to re-read the live hint.
   const [, bump] = useReducer((n: number) => n + 1, 0);

   const hint = request?.getHint() ?? null;
   const isFull = hint?.align === 'full';

   const setAlign = (align: NoteImageAlign) => { request?.setAlign(align); bump(); };
   const setWidth = (pct: number) => { request?.setWidth(pct); bump(); };
   const remove = () => { request?.remove(); onClose(); };

   return (
      <MobileBottomSheet isOpen={!!request && !!hint} onClose={onClose}>
         {hint && (
            <div className="pb-[env(safe-area-inset-bottom)]">
               <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <span className="text-base font-semibold text-foreground">{t('NoteView.imageSheet.title')}</span>
                  <button
                     type="button"
                     onClick={onClose}
                     className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground active:bg-muted"
                  >
                     {t('NoteView.tableSheet.done')}
                  </button>
               </div>

               <div className="space-y-3 px-4 py-3">
                  <ImageSheetGroup title={t('NoteView.imageSheet.align')}>
                     {ALIGN_PRESETS.map((preset) => (
                        <ImageSheetChip
                           key={preset.key}
                           icon={preset.icon}
                           label={t(`NoteView.imageSheet.${preset.labelKey}`)}
                           active={hint.align === preset.key}
                           onClick={() => setAlign(preset.key)}
                        />
                     ))}
                  </ImageSheetGroup>

                  <ImageSheetGroup title={t('NoteView.imageSheet.width')}>
                     {WIDTH_PRESETS.map((pct) => (
                        <ImageSheetChip
                           key={pct}
                           label={`${pct}%`}
                           ariaLabel={t('NoteView.imageSheet.widthValue', { pct })}
                           active={!isFull && hint.widthPct === pct}
                           disabled={isFull}
                           onClick={() => setWidth(pct)}
                        />
                     ))}
                  </ImageSheetGroup>

                  <div className="flex">
                     <ImageSheetButton icon={Trash2} label={t('NoteView.imageSheet.remove')} destructive onClick={remove} />
                  </div>
               </div>
            </div>
         )}
      </MobileBottomSheet>
   );
}

/** A labeled row of preset chips; `role="group"` carries the group name for assistive tech. */
function ImageSheetGroup({ title, children }: { title: string; children: ReactNode }) {
   return (
      <section role="group" aria-label={title}>
         <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
         <div className="flex gap-2">{children}</div>
      </section>
   );
}

/** A preset chip: optional glyph over label, highlighted when it matches the image's current setting. */
function ImageSheetChip({
   icon: Icon,
   label,
   ariaLabel,
   active,
   disabled,
   onClick,
}: {
   icon?: ComponentType<{ className?: string }>;
   label: string;
   ariaLabel?: string;
   active: boolean;
   disabled?: boolean;
   onClick: () => void;
}) {
   return (
      <button
         type="button"
         aria-label={ariaLabel ?? label}
         aria-pressed={active}
         disabled={disabled}
         onClick={onClick}
         className={cn(
            'flex min-h-14 flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-center text-xs font-medium leading-tight active:bg-muted disabled:opacity-40 disabled:active:bg-transparent',
            active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-foreground',
         )}
      >
         {Icon && <Icon className="h-5 w-5" />}
         <span>{label}</span>
      </button>
   );
}

/** One big action target: icon over label. Destructive ops carry the delete token. */
function ImageSheetButton({
   icon: Icon,
   label,
   onClick,
   destructive,
}: {
   icon: ComponentType<{ className?: string }>;
   label: string;
   onClick: () => void;
   destructive?: boolean;
}) {
   return (
      <button
         type="button"
         aria-label={label}
         onClick={onClick}
         className={cn(
            'flex min-h-16 flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-lg border border-border px-1.5 py-2 text-center text-xs font-medium leading-tight text-foreground active:bg-muted',
            destructive && 'border-destructive/40 text-destructive active:bg-destructive/10',
         )}
      >
         <Icon className="h-5 w-5" />
         <span>{label}</span>
      </button>
   );
}
