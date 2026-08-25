// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Eraser, Highlighter, MessageSquare, Pen, Redo2, Undo2 } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { StrokeWidthSelector } from '@/components/molecules/board/draw/StrokeWidthSelector';
import { InkColorControl } from '@/components/molecules/board/draw/InkColorControl';

// -- Type Imports --
import type { PdfTool } from '@/lib/stores/pdfStore';
import type { ReactNode } from 'react';

/*
 * The markup pill: stacks above the reader's nav/zoom bar while markup mode is on. It carries the tool
 * axis (pen / eraser / highlight / comment), each tool's own controls (pen width + ink, highlight fill,
 * comment color), and the annotation undo/redo pair. Chrome uses theme tokens; the mark colors are user
 * content, so the swatches show the hex.
 */

interface PdfMarkupToolbarProps {
   tool: PdfTool;
   onToolChange: (tool: PdfTool) => void;
   penColor: string;
   onPenColorChange: (color: string) => void;
   penWidth: number;
   onPenWidthChange: (width: number) => void;
   highlightColor: string;
   onHighlightColorChange: (color: string) => void;
   commentColor: string;
   onCommentColorChange: (color: string) => void;
   canUndo: boolean;
   canRedo: boolean;
   onUndo: () => void;
   onRedo: () => void;
}

export function PdfMarkupToolbar({ tool, onToolChange, penColor, onPenColorChange, penWidth, onPenWidthChange, highlightColor, onHighlightColorChange, commentColor, onCommentColorChange, canUndo, canRedo, onUndo, onRedo }: PdfMarkupToolbarProps) {
   const { t } = useTranslation();

   return (
      <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center">
         <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-card/95 px-1.5 py-1 text-card-foreground shadow-md backdrop-blur-sm">
            <ToolButton title={t('PdfMarkup.pen')} active={tool === 'pen'} onClick={() => onToolChange('pen')}>
               <Pen className="h-4 w-4" />
            </ToolButton>
            <ToolButton title={t('PdfMarkup.eraser')} active={tool === 'eraser'} onClick={() => onToolChange('eraser')}>
               <Eraser className="h-4 w-4" />
            </ToolButton>
            <ToolButton title={t('PdfMarkup.highlight')} active={tool === 'highlight'} onClick={() => onToolChange('highlight')}>
               <Highlighter className="h-4 w-4" />
            </ToolButton>
            <ToolButton title={t('PdfMarkup.comment')} active={tool === 'comment'} onClick={() => onToolChange('comment')}>
               <MessageSquare className="h-4 w-4" />
            </ToolButton>

            {tool === 'pen' ? (
               <>
                  <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
                  <StrokeWidthSelector width={penWidth} onInput={onPenWidthChange} />
                  <InkColorControl color={penColor} title={t('PdfMarkup.inkColor')} onApply={(color) => color && onPenColorChange(color)} />
               </>
            ) : null}
            {tool === 'highlight' ? (
               <>
                  <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
                  <InkColorControl color={highlightColor} title={t('PdfMarkup.highlightColor')} onApply={(color) => color && onHighlightColorChange(color)} />
               </>
            ) : null}
            {tool === 'comment' ? (
               <>
                  <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
                  <InkColorControl color={commentColor} title={t('PdfMarkup.commentColor')} onApply={(color) => color && onCommentColorChange(color)} />
               </>
            ) : null}

            <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />
            <ActionButton title={t('Actions.undo')} disabled={!canUndo} onClick={onUndo}>
               <Undo2 className="h-4 w-4" />
            </ActionButton>
            <ActionButton title={t('Actions.redo')} disabled={!canRedo} onClick={onRedo}>
               <Redo2 className="h-4 w-4" />
            </ActionButton>
         </div>
      </div>
   );
}

/** A square icon button in the pill; the armed tool reads as pressed. */
function ToolButton({ title, active, onClick, children }: { title: string; active: boolean; onClick: () => void; children: ReactNode }) {
   return (
      <button
         type="button"
         title={title}
         aria-label={title}
         aria-pressed={active}
         onClick={onClick}
         className={cn(
            'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-card-foreground hover:bg-muted',
            active && 'bg-muted text-primary',
         )}
      >
         {children}
      </button>
   );
}

/** A square icon action button in the pill; greys out and stops taking clicks when disabled. */
function ActionButton({ title, disabled, onClick, children }: { title: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
   return (
      <button
         type="button"
         title={title}
         aria-label={title}
         disabled={disabled}
         onClick={onClick}
         className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-card-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
         {children}
      </button>
   );
}
