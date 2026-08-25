// -- React Imports --
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { ChevronLeft, ChevronRight, MessagesSquare, Minus, MoveHorizontal, Pencil, Plus, Scan } from 'lucide-react';

// -- Component Imports --
import { PdfVisibilityMenu } from './PdfVisibilityMenu';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { PdfMarkupMode } from '@/lib/stores/pdfStore';
import type { PdfAnnotationKind, PdfAnnotationVisibility } from '@/lib/types/pdfAnnotation';

/*
 * The reader's floating control bar, pinned bottom-center: page navigation (prev / jump-to input / next),
 * zoom (out / level / in), and fit presets (fit-width / fit-page). Chrome, so it uses theme tokens; the
 * page sheet stays white on its own. Everything read-only - it drives scroll and zoom, never document data.
 */

interface PdfToolbarProps {
   current: number;
   total: number;
   zoom: number;
   markupMode: PdfMarkupMode;
   onToggleMarkup: () => void;
   commentsPanelOpen: boolean;
   onToggleComments: () => void;
   annotationVisibility: PdfAnnotationVisibility;
   onSetTypeVisible: (kind: PdfAnnotationKind, visible: boolean) => void;
   onSetAllVisible: (visible: boolean) => void;
   onPrev: () => void;
   onNext: () => void;
   /** Jumps to a page (clamped by the reader); called on Enter / blur of the page input. */
   onJump: (page: number) => void;
   onZoomIn: () => void;
   onZoomOut: () => void;
   onResetZoom: () => void;
   onFitWidth: () => void;
   onFitPage: () => void;
}

export function PdfToolbar({ current, total, zoom, markupMode, onToggleMarkup, commentsPanelOpen, onToggleComments, annotationVisibility, onSetTypeVisible, onSetAllVisible, onPrev, onNext, onJump, onZoomIn, onZoomOut, onResetZoom, onFitWidth, onFitPage }: PdfToolbarProps) {
   const { t } = useTranslation();

   return (
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
         <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-card/95 px-1.5 py-1 text-card-foreground shadow-md backdrop-blur-sm">
            {/* Markup toggle: leads the bar; the nav/zoom groups never move. */}
            <button
               type="button"
               title={markupMode === 'markup' ? t('PdfMarkup.read') : t('PdfMarkup.markup')}
               aria-label={markupMode === 'markup' ? t('PdfMarkup.read') : t('PdfMarkup.markup')}
               aria-pressed={markupMode === 'markup'}
               onClick={onToggleMarkup}
               className={cn(
                  'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-card-foreground hover:bg-muted',
                  markupMode === 'markup' && 'bg-muted text-primary',
               )}
            >
               <Pencil className="h-4 w-4" />
            </button>

            <Divider />

            {/* Page group */}
            <ToolbarButton title={t('PdfView.prevPage')} onClick={onPrev} disabled={current <= 1}>
               <ChevronLeft className="h-4 w-4" />
            </ToolbarButton>
            <PageInput current={current} total={total} onJump={onJump} />
            <ToolbarButton title={t('PdfView.nextPage')} onClick={onNext} disabled={current >= total}>
               <ChevronRight className="h-4 w-4" />
            </ToolbarButton>

            <Divider />

            {/* Zoom group */}
            <ToolbarButton title={t('PdfView.zoomOut')} onClick={onZoomOut}>
               <Minus className="h-4 w-4" />
            </ToolbarButton>
            <button
               type="button"
               title={t('PdfView.zoomReset')}
               aria-label={t('PdfView.zoomReset')}
               onClick={onResetZoom}
               className="min-w-11 cursor-pointer rounded px-1 text-center text-xs font-medium tabular-nums text-muted-foreground hover:bg-muted hover:text-card-foreground"
            >
               {t('PdfView.zoomPercent', { percent: Math.round(zoom * 100) })}
            </button>
            <ToolbarButton title={t('PdfView.zoomIn')} onClick={onZoomIn}>
               <Plus className="h-4 w-4" />
            </ToolbarButton>

            <Divider />

            {/* Fit group */}
            <ToolbarButton title={t('PdfView.fitWidth')} onClick={onFitWidth}>
               <MoveHorizontal className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton title={t('PdfView.fitPage')} onClick={onFitPage}>
               <Scan className="h-4 w-4" />
            </ToolbarButton>

            <Divider />

            {/* View aids, available in read and markup: annotation visibility + the comments panel. Trail the bar
                so the nav/zoom groups never move. */}
            <PdfVisibilityMenu visibility={annotationVisibility} onSetTypeVisible={onSetTypeVisible} onSetAllVisible={onSetAllVisible} />
            <button
               type="button"
               title={t('PdfMarkup.comments')}
               aria-label={t('PdfMarkup.comments')}
               aria-pressed={commentsPanelOpen}
               onClick={onToggleComments}
               className={cn(
                  'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-card-foreground hover:bg-muted',
                  commentsPanelOpen && 'bg-muted text-primary',
               )}
            >
               <MessagesSquare className="h-4 w-4" />
            </button>
         </div>
      </div>
   );
}

/** The editable page field: shows the current page, jumps on Enter / blur, reverts on Escape. */
function PageInput({ current, total, onJump }: { current: number; total: number; onJump: (page: number) => void }) {
   const { t } = useTranslation();
   const [draft, setDraft] = useState('');
   const [editing, setEditing] = useState(false);
   // Set by Escape so the blur it triggers discards the draft instead of jumping.
   const reverting = useRef(false);

   // While focused, the field shows the typed draft; otherwise it tracks the live page as it scrolls.
   const value = editing ? draft : String(current);

   const commit = () => {
      setEditing(false);
      if (reverting.current) {
         reverting.current = false;
         return;
      }
      const page = Number.parseInt(draft, 10);
      if (Number.isFinite(page)) onJump(page);
   };

   return (
      <div className="flex items-center gap-1 px-1 text-xs font-medium text-card-foreground">
         <input
            value={value}
            inputMode="numeric"
            aria-label={t('PdfView.pageInputLabel')}
            onFocus={(event) => {
               setDraft(String(current));
               setEditing(true);
               event.target.select();
            }}
            onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commit}
            onKeyDown={(event) => {
               if (event.key === 'Enter') event.currentTarget.blur();
               else if (event.key === 'Escape') {
                  reverting.current = true;
                  event.currentTarget.blur();
               }
            }}
            className="w-8 rounded border border-border bg-muted px-1 py-0.5 text-center tabular-nums outline-none focus:border-ring"
         />
         <span className="text-muted-foreground">{t('PdfView.pageTotal', { total })}</span>
      </div>
   );
}

/** A square icon button in the bar; disabled dims and blocks the click. */
function ToolbarButton({ title, onClick, disabled = false, children }: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
   return (
      <button
         type="button"
         title={title}
         aria-label={title}
         onClick={onClick}
         disabled={disabled}
         className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-card-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
      >
         {children}
      </button>
   );
}

/** A thin vertical rule between toolbar groups. */
function Divider() {
   return <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}
