// -- React Imports --
import { useTranslation } from 'react-i18next';
import type { ComponentType, ReactNode } from 'react';

// -- Icon Imports --
import { ImageIcon, Trash2 } from 'lucide-react';

// -- Component Imports --
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';

// -- Cover Sizing --
import { COVER_ASPECT_PRESETS, clampCoverWidth } from '@/components/molecules/note/noteCoverClasses';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { NoteCover } from '@/lib/types/board';

interface MobileNoteCoverSheetProps {
   /** Whether the sheet is shown. */
   isOpen: boolean;
   /** The current cover; the sheet renders nothing (and can't act) without one. */
   cover: NoteCover | null | undefined;
   /** Explicit Done / backdrop tap closes the sheet. */
   onClose: () => void;
   /** Opens the image picker to swap the cover image. Closes the sheet so the cropper isn't behind it. */
   onChange: () => void;
   /** Clears the cover. Closes the sheet (there is nothing left to act on). */
   onRemove: () => void;
   /** Commits a new box aspect (height / width) - the sheet stays open so several tweaks chain. */
   onSetAspect: (aspect: number) => void;
   /** Commits a new box width (percent of the measure), keeping the current aspect. Stays open. */
   onSetWidth: (widthPct: number, aspect: number) => void;
}

/** Width presets within the cover clamp band (20-80%), thumb-set since drag handles are unusable on touch. */
const WIDTH_PRESETS: { key: string; pct: number }[] = [
   { key: 'small', pct: 25 },
   { key: 'medium', pct: 40 },
   { key: 'large', pct: 60 },
   { key: 'full', pct: 80 },
];

/** Aspect chips read their labels from these keys; the icon is a rectangle roughly matching the ratio. */
const ASPECT_LABEL: Record<string, string> = { wide: 'aspectWide', photo: 'aspectPhoto', square: 'aspectSquare' };

/*
 * The mobile cover options slide-up: the touch stand-in for the desktop hover controls. Tapping the cover (or the
 * editing bar's Cover chip when one exists) opens it; big touch targets for Change / Remove, plus aspect and width
 * preset chips (no drag handles on a phone). Change and Remove close the sheet; aspect/width stay open so a run of
 * tweaks doesn't cost a reopen per step. App-token chrome.
 */
export function MobileNoteCoverSheet({ isOpen, cover, onClose, onChange, onRemove, onSetAspect, onSetWidth }: MobileNoteCoverSheetProps) {
   const { t } = useTranslation();

   const activeWidth = cover ? clampCoverWidth(cover.width) : null;

   const handleChange = () => {
      onChange();
      onClose();
   };
   const handleRemove = () => {
      onRemove();
      onClose();
   };

   return (
      <MobileBottomSheet isOpen={isOpen && !!cover} onClose={onClose}>
         {cover && (
            <div className="pb-[env(safe-area-inset-bottom)]">
               <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <span className="text-base font-semibold text-foreground">{t('NoteView.cover.sheetTitle')}</span>
                  <button
                     type="button"
                     onClick={onClose}
                     className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground active:bg-muted"
                  >
                     {t('NoteView.tableSheet.done')}
                  </button>
               </div>

               <div className="space-y-3 px-4 py-3">
                  <div className="flex gap-2">
                     <CoverSheetButton icon={ImageIcon} label={t('NoteView.cover.change')} onClick={handleChange} />
                     <CoverSheetButton icon={Trash2} label={t('NoteView.cover.remove')} destructive onClick={handleRemove} />
                  </div>

                  <CoverSheetGroup title={t('NoteView.cover.aspect')}>
                     {COVER_ASPECT_PRESETS.map((preset) => (
                        <CoverSheetChip
                           key={preset.key}
                           label={t(`NoteView.cover.${ASPECT_LABEL[preset.key]}`)}
                           active={Math.abs(cover.aspect - preset.ratio) < 0.01}
                           onClick={() => onSetAspect(preset.ratio)}
                        >
                           <AspectGlyph ratio={preset.ratio} />
                        </CoverSheetChip>
                     ))}
                  </CoverSheetGroup>

                  <CoverSheetGroup title={t('NoteView.cover.width')}>
                     {WIDTH_PRESETS.map((preset) => (
                        <CoverSheetChip
                           key={preset.key}
                           label={t(`NoteView.cover.width${preset.key[0].toUpperCase()}${preset.key.slice(1)}`)}
                           active={activeWidth === preset.pct}
                           onClick={() => onSetWidth(preset.pct, cover.aspect)}
                        />
                     ))}
                  </CoverSheetGroup>
               </div>
            </div>
         )}
      </MobileBottomSheet>
   );
}

/** A labeled row of preset chips; `role="group"` carries the group name for assistive tech. */
function CoverSheetGroup({ title, children }: { title: string; children: ReactNode }) {
   return (
      <section role="group" aria-label={title}>
         <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
         <div className="flex gap-2">{children}</div>
      </section>
   );
}

/** One big action target: icon over label, equal-width. Destructive ops carry the delete token. */
function CoverSheetButton({
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

/** A preset chip: optional glyph over label, highlighted when it matches the cover's current setting. */
function CoverSheetChip({
   label,
   active,
   onClick,
   children,
}: {
   label: string;
   active: boolean;
   onClick: () => void;
   children?: ReactNode;
}) {
   return (
      <button
         type="button"
         aria-label={label}
         aria-pressed={active}
         onClick={onClick}
         className={cn(
            'flex min-h-14 flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-center text-xs font-medium leading-tight active:bg-muted',
            active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-foreground',
         )}
      >
         {children}
         <span>{label}</span>
      </button>
   );
}

/** A rectangle sized to an aspect (height / width) so a chip previews the box shape it sets. */
function AspectGlyph({ ratio }: { ratio: number }) {
   const base = 18;
   const width = ratio >= 1 ? Math.round(base / ratio) : base;
   const height = ratio >= 1 ? base : Math.round(base * ratio);
   return (
      <span
         aria-hidden
         className="rounded-sm border-2 border-current"
         style={{ width, height }}
      />
   );
}
