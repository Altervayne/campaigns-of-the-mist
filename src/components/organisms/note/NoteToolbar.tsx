// -- React Imports --
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

// -- Icon Imports --
import {
   Bold, BookOpen, ChevronDown, Code, Heading, Image, ImagePlus, Italic, Link, List, ListOrdered, ListTree, Loader2,
   Minus, PenLine, Quote, Strikethrough, Table, Trash2,
} from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Basic UI Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// -- Hook Imports --
import { useNoteFormatActions } from '@/hooks/useNoteFormatActions';

// -- Component Imports --
import { NoteLinkPicker } from '@/components/organisms/note/NoteLinkPicker';

// -- Type Imports --
import type { NoteEditorHandle } from '@/components/organisms/note/NoteEditor';
import type { LinkEditSeed } from '@/components/organisms/note/live/linkNode';

/*
 * The single permanent editor toolbar (theme tokens, NOT paper - it's chrome). ONE row, replacing the old
 * two-row header + toolbar. It is persistent across ALL modes so the mode toggle is always reachable (you can
 * always leave Reading). Contents adapt by mode:
 *  - the MODE TOGGLE is always shown (right side);
 *  - the COVER button + format group (B/I/S) + heading/quote + lists + image/table insert are shown only in the
 *    editable modes (Live/Source) and hidden in Reading, which needs no editing chrome.
 *
 * When the row is too narrow to fit, the 3-segment Reading/Live/Source toggle collapses into a single CYCLING
 * button (Reading -> Live -> Source -> Reading). Every editing action drives the CM6 doc through the editor
 * handle at real byte offsets (buffer stays literal markdown); this component never hand-formats markdown. The
 * floating selection bar keeps the same B/I/S as quick-access on a selection - both exist by design.
 */

export type NoteMode = 'reading' | 'live' | 'source';

interface NoteToolbarProps {
   mode: NoteMode;
   onModeChange: (mode: NoteMode) => void;
   /** True in Live/Source (editing chrome shown); false in Reading (only the mode toggle shows). */
   isEditing: boolean;
   /** Accessor for the live editor handle (the ref may be unset on first paint). */
   getEditor: () => NoteEditorHandle | null;
   /** Opens the image picker (shared upload pipeline -> hash -> splice at the guarded caret). */
   onInsertImage: () => void;
   /** Whether an image upload is in flight (disables the image button). */
   isImageProcessing: boolean;
   /** Cover controls: state + add/change/remove (routed through the shared upload pipeline / store). */
   hasCover: boolean;
   isCoverProcessing: boolean;
   onAddCover: () => void;
   onChangeCover: () => void;
   onRemoveCover: () => void;
   /** The document-outline rail: its open state + toggle. Shown in ALL modes (the outline works in Reading too). */
   isOutlineOpen: boolean;
   onToggleOutline: () => void;
   /** The link picker's open state (controlled so the command palette can open it too) + its change handler. */
   isLinkPickerOpen: boolean;
   onLinkPickerOpenChange: (open: boolean) => void;
   /** When set, the picker REPLACES an existing link's target (the caret bar's Change-target), keeping its label. */
   linkEditSeed: LinkEditSeed | null;
}

export function NoteToolbar({
   mode,
   onModeChange,
   isEditing,
   getEditor,
   onInsertImage,
   isImageProcessing,
   hasCover,
   isCoverProcessing,
   onAddCover,
   onChangeCover,
   onRemoveCover,
   isOutlineOpen,
   onToggleOutline,
   isLinkPickerOpen,
   onLinkPickerOpenChange,
   linkEditSeed,
}: NoteToolbarProps) {
   const { t } = useTranslation();

   // Fit detection: collapse the segmented mode toggle to a cycling button when the row is too narrow. A
   // ResizeObserver tracks the live width; a window-resize listener + a deferred initial read cover cases where
   // the observer's first callback lands before layout (a 0-width pre-paint would else latch compact).
   const rowRef = useRef<HTMLDivElement>(null);
   const [compact, setCompact] = useState(false);
   useEffect(() => {
      const row = rowRef.current;
      if (!row) return;
      // Only collapse once we have a real (non-zero) width below the threshold - a 0-width pre-layout read
      // must not latch compact.
      const check = () => { const w = row.clientWidth; if (w > 0) setCompact(w < 560); };
      const raf = requestAnimationFrame(check);
      const ro = new ResizeObserver(check);
      ro.observe(row);
      window.addEventListener('resize', check);
      return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('resize', check); };
   }, []);

   // The markdown format/insert actions, shared with the mobile editing bar (no duplicated markdown logic).
   const { toggleFormat, cycleHeading, toggleList, insertTable, insertHorizontalRule } = useNoteFormatActions(getEditor);

   return (
      <div ref={rowRef} data-tutorial="note-toolbar" className="flex items-center gap-0.5 border-b border-border bg-popover px-2 py-1.5">
         {/* Outline toggle: shown in ALL modes (the document outline works in Reading too), leftmost. */}
         <button
            type="button"
            title={t('NoteView.outline.toggle')}
            aria-label={t('NoteView.outline.toggle')}
            aria-pressed={isOutlineOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onToggleOutline}
            className={cn(
               'grid h-7 w-7 place-items-center rounded cursor-pointer',
               isOutlineOpen ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
            )}
         >
            <ListTree className="h-4 w-4" />
         </button>
         {isEditing && <ToolbarDivider />}

         {/* Editing chrome: only in Live/Source. In Reading just the mode toggle remains (right). */}
         {isEditing && (
            <>
               <CoverButton
                  hasCover={hasCover}
                  isProcessing={isCoverProcessing}
                  onAdd={onAddCover}
                  onChange={onChangeCover}
                  onRemove={onRemoveCover}
               />
               <ToolbarDivider />
               {/* Inline format (acts on the selection; the floating bar mirrors these on a selection). */}
               <ToolbarButton label={t('NoteView.format.bold')} onClick={() => toggleFormat('bold')}>
                  <Bold className="h-4 w-4" />
               </ToolbarButton>
               <ToolbarButton label={t('NoteView.format.italic')} onClick={() => toggleFormat('italic')}>
                  <Italic className="h-4 w-4" />
               </ToolbarButton>
               <ToolbarButton label={t('NoteView.format.strikethrough')} onClick={() => toggleFormat('strikethrough')}>
                  <Strikethrough className="h-4 w-4" />
               </ToolbarButton>
               <ToolbarDivider />
               {/* Block: heading cycle + quote. */}
               <ToolbarButton label={t('NoteView.toolbar.heading')} onClick={cycleHeading}>
                  <Heading className="h-4 w-4" />
               </ToolbarButton>
               <ToolbarButton label={t('NoteView.toolbar.quote')} onClick={() => toggleList('quote')}>
                  <Quote className="h-4 w-4" />
               </ToolbarButton>
               <ToolbarButton label={t('NoteView.toolbar.horizontalRule')} onClick={insertHorizontalRule}>
                  <Minus className="h-4 w-4" />
               </ToolbarButton>
               <ToolbarDivider />
               {/* Lists. */}
               <ToolbarButton label={t('NoteView.toolbar.bulletList')} onClick={() => toggleList('bullet')}>
                  <List className="h-4 w-4" />
               </ToolbarButton>
               <ToolbarButton label={t('NoteView.toolbar.numberedList')} onClick={() => toggleList('numbered')}>
                  <ListOrdered className="h-4 w-4" />
               </ToolbarButton>
               <ToolbarDivider />
               {/* Insert. */}
               <ToolbarButton label={t('NoteView.insertImage')} onClick={onInsertImage} disabled={isImageProcessing} dataTutorial="note-insert-image">
                  {isImageProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
               </ToolbarButton>
               <TableButton onInsert={insertTable} />
               <LinkButton getEditor={getEditor} open={isLinkPickerOpen} onOpenChange={onLinkPickerOpenChange} editSeed={linkEditSeed} />
            </>
         )}

         {/* Mode toggle: ALWAYS shown, pushed to the right. Segmented when it fits, cycling button when tight. */}
         <div data-tutorial="note-mode-toggle" className="ml-auto pl-2">
            <ModeToggle mode={mode} onChange={onModeChange} compact={compact} />
         </div>
      </div>
   );
}

/** A single icon action in the toolbar. mousedown is swallowed so the editor keeps its selection. */
function ToolbarButton({
   label,
   onClick,
   disabled,
   dataTutorial,
   children,
}: {
   label: string;
   onClick: () => void;
   disabled?: boolean;
   dataTutorial?: string;
   children: ReactNode;
}) {
   return (
      <button
         type="button"
         title={label}
         aria-label={label}
         disabled={disabled}
         data-tutorial={dataTutorial}
         onMouseDown={(event) => event.preventDefault()}
         onClick={onClick}
         className="grid h-7 w-7 place-items-center rounded text-foreground hover:bg-muted cursor-pointer disabled:cursor-default disabled:opacity-60"
      >
         {children}
      </button>
   );
}

/** A thin separator between toolbar groups. */
function ToolbarDivider() {
   return <span className="mx-1 h-5 w-px self-center bg-border" />;
}

const MODE_META: { key: NoteMode; icon: typeof BookOpen; label: string }[] = [
   { key: 'reading', icon: BookOpen, label: 'NoteView.mode.reading' },
   { key: 'live', icon: PenLine, label: 'NoteView.mode.live' },
   { key: 'source', icon: Code, label: 'NoteView.mode.source' },
];

/*
 * The mode toggle: a 3-segment control (Reading / Live / Source) when it fits, or a single CYCLING button
 * (Reading -> Live -> Source -> Reading) when the row is tight. One is always active; theme-token chrome.
 */
function ModeToggle({ mode, onChange, compact }: { mode: NoteMode; onChange: (mode: NoteMode) => void; compact: boolean }) {
   const { t } = useTranslation();

   if (compact) {
      const current = MODE_META.find((m) => m.key === mode) ?? MODE_META[0];
      const Icon = current.icon;
      const next = () => {
         const idx = MODE_META.findIndex((m) => m.key === mode);
         onChange(MODE_META[(idx + 1) % MODE_META.length].key);
      };
      return (
         <button
            type="button"
            onClick={next}
            title={t(current.label)}
            aria-label={t(current.label)}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm text-foreground hover:bg-muted cursor-pointer"
         >
            <Icon className="h-4 w-4" />
            <span>{t(current.label)}</span>
         </button>
      );
   }

   const segment = (active: boolean) =>
      cn(
         'flex items-center gap-1.5 rounded px-2.5 py-1 text-sm cursor-pointer',
         active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
      );
   return (
      <div className="inline-flex shrink-0 items-center rounded-md border border-border p-0.5">
         {MODE_META.map(({ key, icon: Icon, label }) => (
            <button key={key} type="button" onClick={() => onChange(key)} aria-pressed={mode === key} className={segment(mode === key)}>
               <Icon className="h-4 w-4" />
               <span className="hidden sm:inline">{t(label)}</span>
            </button>
         ))}
      </div>
   );
}

/*
 * The cover control: an "Add cover" button when the note has none, or a "Cover" menu (Change / Remove) when
 * one exists. The resize handle + aspect controls stay ON the image (the Live hover overlay); this toolbar
 * entry only handles add / swap / remove. Theme-token chrome.
 */
function CoverButton({
   hasCover,
   isProcessing,
   onAdd,
   onChange,
   onRemove,
}: {
   hasCover: boolean;
   isProcessing: boolean;
   onAdd: () => void;
   onChange: () => void;
   onRemove: () => void;
}) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);
   const triggerClass =
      'flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-sm font-medium text-foreground hover:bg-muted cursor-pointer disabled:cursor-default disabled:opacity-60';

   if (!hasCover) {
      return (
         <button type="button" data-tutorial="note-cover-button" onClick={onAdd} disabled={isProcessing} className={triggerClass} title={t('NoteView.cover.add')}>
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
            <span className="hidden md:inline">{t('NoteView.cover.add')}</span>
         </button>
      );
   }

   const run = (action: () => void) => {
      setOpen(false);
      action();
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <button type="button" data-tutorial="note-cover-button" disabled={isProcessing} className={triggerClass} title={t('NoteView.cover.label')}>
               {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
               <span className="hidden md:inline">{t('NoteView.cover.label')}</span>
               <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
         </PopoverTrigger>
         <PopoverContent align="start" sideOffset={6} className="flex w-auto flex-col gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md">
            <CoverMenuRow icon={<Image className="h-4 w-4" />} label={t('NoteView.cover.change')} onClick={() => run(onChange)} />
            <CoverMenuRow icon={<Trash2 className="h-4 w-4" />} label={t('NoteView.cover.remove')} onClick={() => run(onRemove)} destructive />
         </PopoverContent>
      </Popover>
   );
}

/** A labelled action row in the cover menu (icon + text), on the popover's token vocabulary. */
function CoverMenuRow({ icon, label, onClick, destructive }: { icon: ReactNode; label: string; onClick: () => void; destructive?: boolean }) {
   return (
      <button
         type="button"
         onClick={onClick}
         className={`flex items-center gap-2 rounded p-1 text-left cursor-pointer ${destructive ? 'text-destructive hover:bg-destructive/10' : 'text-popover-foreground hover:bg-muted'}`}
      >
         {icon}
         <span className="whitespace-nowrap text-sm">{label}</span>
      </button>
   );
}

/*
 * The link inserter: a trigger button that opens the unified search-first picker (same-note sections + saved
 * drawer elements + URL auto-detect). Controlled `open` so the command palette can open the SAME picker. The
 * picker snapshots the editor's selection (the label source) + buffer (the section list) on open and splices
 * the built `[label](href)` back through the granular editor-handle path, so undo stays clean.
 */
function LinkButton({
   getEditor,
   open,
   onOpenChange,
   editSeed,
}: {
   getEditor: () => NoteEditorHandle | null;
   open: boolean;
   onOpenChange: (open: boolean) => void;
   editSeed: LinkEditSeed | null;
}) {
   const { t } = useTranslation();
   return (
      <Popover open={open} onOpenChange={onOpenChange}>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={t('NoteView.toolbar.insertLink')}
               aria-label={t('NoteView.toolbar.insertLink')}
               data-tutorial="note-link-button"
               onMouseDown={(event) => event.preventDefault()}
               className="grid h-7 w-7 place-items-center rounded text-foreground hover:bg-muted cursor-pointer"
            >
               <Link className="h-4 w-4" />
            </button>
         </PopoverTrigger>
         <PopoverContent align="start" sideOffset={6} className="w-auto rounded-lg border border-border bg-popover p-0 shadow-md">
            {open && <NoteLinkPicker getEditor={getEditor} onClose={() => onOpenChange(false)} editSeed={editSeed ?? undefined} />}
         </PopoverContent>
      </Popover>
   );
}

/*
 * The table generator: a trigger button that opens a hover grid; hovering a cell previews an R x C selection,
 * clicking inserts a valid GFM table of that size at the caret.
 */
function TableButton({ onInsert }: { onInsert: (rows: number, cols: number) => void }) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);
   const [hover, setHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
   const MAX = 6;

   const choose = (r: number, c: number) => {
      setOpen(false);
      setHover({ r: 0, c: 0 });
      onInsert(r, c);
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={t('NoteView.toolbar.insertTable')}
               aria-label={t('NoteView.toolbar.insertTable')}
               onMouseDown={(event) => event.preventDefault()}
               className="grid h-7 w-7 place-items-center rounded text-foreground hover:bg-muted cursor-pointer"
            >
               <Table className="h-4 w-4" />
            </button>
         </PopoverTrigger>
         <PopoverContent align="start" sideOffset={6} className="w-auto rounded-lg border border-border bg-popover p-2 shadow-md">
            <div className="mb-1.5 text-center text-xs text-muted-foreground">
               {hover.r > 0 ? `${hover.r} × ${hover.c}` : t('NoteView.toolbar.tableSize')}
            </div>
            <div className="grid grid-cols-6 gap-0.5 coarse:gap-1" onMouseLeave={() => setHover({ r: 0, c: 0 })}>
               {Array.from({ length: MAX * MAX }, (_, i) => {
                  const r = Math.floor(i / MAX) + 1;
                  const c = (i % MAX) + 1;
                  const active = r <= hover.r && c <= hover.c;
                  return (
                     <button
                        key={i}
                        type="button"
                        aria-label={`${r} × ${c}`}
                        onMouseEnter={() => setHover({ r, c })}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(r, c)}
                        className={cn('h-4 w-4 coarse:size-7 rounded-[2px] border border-border cursor-pointer', active ? 'bg-primary' : 'bg-background')}
                     />
                  );
               })}
            </div>
         </PopoverContent>
      </Popover>
   );
}
