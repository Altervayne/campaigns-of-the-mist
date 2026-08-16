// -- React Imports --
import { useTranslation } from 'react-i18next';
import type { CSSProperties, ReactNode } from 'react';

// -- Icon Imports --
import { Bold, Heading, ImagePlus, Italic, Link, List, ListOrdered, Loader2, Minus, PanelTop, Quote, Redo2, Strikethrough, Table, Undo2 } from 'lucide-react';

// -- Hook Imports --
import { useNoteFormatActions } from '@/hooks/useNoteFormatActions';
import { useKeyboardInset } from '@/hooks/mobile/useKeyboardInset';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { NoteEditorHandle } from '@/components/organisms/note/NoteEditor';
import type { LinkNodeInfo } from '@/components/organisms/note/live/linkNode';

interface MobileNoteEditingBarProps {
   /** Accessor for the live editor handle (the ref may be unset on first paint). */
   getEditor: () => NoteEditorHandle | null;
   /** Opens the image picker (shared upload pipeline -> hash -> splice at the guarded caret). */
   onInsertImage: () => void;
   /** Whether an image upload is in flight (disables the image button). */
   isImageProcessing: boolean;
   canUndo: boolean;
   canRedo: boolean;
   onUndo: () => void;
   onRedo: () => void;
   /** Whether the caret sits in a table cell; the Table chip is alive only then. */
   canOpenTable: boolean;
   /** Drops the keyboard and raises the table slide-up for the caret's cell. */
   onOpenTable: () => void;
   /** Whether the note has a cover; flips the Cover chip between "Add cover" and "Cover". */
   hasCover: boolean;
   /** With a cover, opens the options sheet; without one, opens the picker to add it. */
   onCoverButton: () => void;
   /** The caret's link (or null); flips the Link chip between the options sheet and the insert picker. */
   linkCaret: LinkNodeInfo | null;
   /** In a link opens the options sheet; otherwise opens the insert-link picker. */
   onLinkChip: () => void;
   /** Pins Undo/Redo on the thumb-side edge; the scrolling format group takes the rest. */
   isLeftHanded: boolean;
   /** No bottom tab bar in FAB mode, so the resting (keyboard-down) dock sits lower. */
   isMobileFABMode: boolean;
}

/*
 * The keyboard-docked editing bar (Edit mode only): a full-width strip that rides the top of the soft keyboard
 * via VisualViewport, resting above the bottom chrome when the keyboard is down. The format/insert group scrolls
 * horizontally; Undo/Redo are PINNED thumb-side so they never scroll off (there is no other undo on a phone).
 * App-token chrome; the floating selection bar is suppressed on mobile, so B/I/S live here. Actions reuse the
 * shared markdown handlers.
 */
export function MobileNoteEditingBar({
   getEditor,
   onInsertImage,
   isImageProcessing,
   canUndo,
   canRedo,
   onUndo,
   onRedo,
   canOpenTable,
   onOpenTable,
   hasCover,
   onCoverButton,
   linkCaret,
   onLinkChip,
   isLeftHanded,
   isMobileFABMode,
}: MobileNoteEditingBarProps) {
   const { t } = useTranslation();
   const { toggleFormat, cycleHeading, toggleList, insertHorizontalRule, insertTable } = useNoteFormatActions(getEditor);

   // Ride the keyboard top when it is up; rest above the bottom chrome (tab bar in nav mode) when it is down.
   // Full-width in every case: in FAB mode the nav FAB rides ABOVE this bar, so no horizontal slot is reserved.
   const keyboardInset = useKeyboardInset();
   const keyboardUp = keyboardInset > 0;
   const restingBottom = isMobileFABMode ? 'env(safe-area-inset-bottom)' : 'calc(4rem + env(safe-area-inset-bottom))';
   const bottom = keyboardUp ? `${keyboardInset}px` : restingBottom;
   const style: CSSProperties = { bottom };

   return (
      <div
         className="fixed inset-x-0 layer-floating border-t border-border bg-popover"
         style={style}
      >
         <div className={cn('flex items-stretch', isLeftHanded && 'flex-row-reverse')}>
            {/* Format/insert group: scrolls horizontally so it never crowds the pinned undo/redo. */}
            <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 py-1">
               <EditingBarButton label={t('NoteView.format.bold')} onClick={() => toggleFormat('bold')}>
                  <Bold className="h-5 w-5" />
               </EditingBarButton>
               <EditingBarButton label={t('NoteView.format.italic')} onClick={() => toggleFormat('italic')}>
                  <Italic className="h-5 w-5" />
               </EditingBarButton>
               <EditingBarButton label={t('NoteView.format.strikethrough')} onClick={() => toggleFormat('strikethrough')}>
                  <Strikethrough className="h-5 w-5" />
               </EditingBarButton>
               <BarDivider />
               <EditingBarButton label={t('NoteView.toolbar.heading')} onClick={cycleHeading}>
                  <Heading className="h-5 w-5" />
               </EditingBarButton>
               <EditingBarButton label={t('NoteView.toolbar.quote')} onClick={() => toggleList('quote')}>
                  <Quote className="h-5 w-5" />
               </EditingBarButton>
               <BarDivider />
               <EditingBarButton label={t('NoteView.toolbar.bulletList')} onClick={() => toggleList('bullet')}>
                  <List className="h-5 w-5" />
               </EditingBarButton>
               <EditingBarButton label={t('NoteView.toolbar.numberedList')} onClick={() => toggleList('numbered')}>
                  <ListOrdered className="h-5 w-5" />
               </EditingBarButton>
               <BarDivider />
               <EditingBarButton label={t('NoteView.toolbar.horizontalRule')} onClick={insertHorizontalRule}>
                  <Minus className="h-5 w-5" />
               </EditingBarButton>
               <EditingBarButton label={t('NoteView.insertImage')} onClick={onInsertImage} disabled={isImageProcessing}>
                  {isImageProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
               </EditingBarButton>
               {/* Context-aware, never greyed: with a cover it opens the options sheet; without one it adds a cover. */}
               <EditingBarButton label={hasCover ? t('NoteView.cover.label') : t('NoteView.cover.add')} onClick={onCoverButton}>
                  <PanelTop className="h-5 w-5" />
               </EditingBarButton>
               {/* Context-aware, never greyed: in a link it opens the options sheet; otherwise it inserts a link. */}
               <EditingBarButton label={linkCaret ? t('Common.link') : t('NoteView.toolbar.insertLink')} onClick={onLinkChip}>
                  <Link className="h-5 w-5" />
               </EditingBarButton>
               <BarDivider />
               {/* Context-aware, never greyed: in a table it opens the slide-up; otherwise it inserts a starter
                   table (the slide-up then grows it). Hand-typing pipe rows on a phone is a non-starter. */}
               <EditingBarButton
                  label={canOpenTable ? t('Common.table') : t('NoteView.toolbar.insertTable')}
                  onClick={canOpenTable ? onOpenTable : () => insertTable(2, 2)}
               >
                  <Table className="h-5 w-5" />
               </EditingBarButton>
            </div>

            {/* Pinned Undo/Redo: never scrolls off, thumb-side, with a divider from the scrolling group. */}
            <div className={cn('flex shrink-0 items-center gap-0.5 px-1 py-1', isLeftHanded ? 'border-r border-border' : 'border-l border-border')}>
               <EditingBarButton label={t('NoteView.mobile.undo')} onClick={onUndo} disabled={!canUndo}>
                  <Undo2 className="h-5 w-5" />
               </EditingBarButton>
               <EditingBarButton label={t('NoteView.mobile.redo')} onClick={onRedo} disabled={!canRedo}>
                  <Redo2 className="h-5 w-5" />
               </EditingBarButton>
            </div>
         </div>
      </div>
   );
}

/** One 36px icon action in the editing bar - a dense secondary-action size so more fit at once on a phone.
    mousedown is swallowed so the editor keeps focus + selection. */
function EditingBarButton({
   label,
   onClick,
   disabled,
   children,
}: {
   label: string;
   onClick: () => void;
   disabled?: boolean;
   children: ReactNode;
}) {
   return (
      <button
         type="button"
         title={label}
         aria-label={label}
         disabled={disabled}
         onMouseDown={(event) => event.preventDefault()}
         onClick={onClick}
         className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-foreground active:bg-muted disabled:opacity-40 disabled:active:bg-transparent"
      >
         {children}
      </button>
   );
}

/** A thin separator between button groups. */
function BarDivider() {
   return <span aria-hidden className="mx-0.5 my-2 w-px shrink-0 self-stretch bg-border" />;
}
