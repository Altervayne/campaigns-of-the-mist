// -- React Imports --
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { AArrowDown, AArrowUp, AlignCenter, AlignLeft, AlignRight, Bold, Check, ChevronDown, Italic, Underline } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { pushRecentColor, readRecentColors } from '@/lib/recentColors';
import { MAX_TEXT_SIZE, MIN_TEXT_SIZE, TEXT_FONT_FAMILIES, TEXT_FONT_LABELS, TEXT_FONT_STACKS, TEXT_SIZE_PRESETS, steppedTextSize, textStyleToCss } from '@/lib/board/textStyle';

// -- Component Imports --
import { ColorPickerPopover } from '@/components/molecules/color/ColorPickerPopover';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// -- Hook Imports --
import { useCommitOnUnmount } from '@/hooks/useCommitOnUnmount';

// -- Type Imports --
import type { BoardItem, BoardItemContent, TextBoardContent, TextFontFamily, TextStyle } from '@/lib/types/board';

/*
 * A bare TEXT board element: plain, uniformly-styled text painted straight on the canvas - no card or
 * paper chrome (only the box's selection ring). The box auto-hugs the rendered text on both axes (see
 * `FIT_BOTH_KINDS` in BoardItemBox): a static sizer holds the text so the box grows and shrinks as you
 * type, with an absolutely-positioned textarea overlaying it while editing. An empty element PERSISTS,
 * showing a muted placeholder so it stays findable/selectable - it is never nuked on blur; the user
 * deletes an unwanted empty text explicitly (the Delete key / the toolbar).
 *
 * Edit lifecycle mirrors the post-it: a local buffer, blur-commit `updateItemContent` (not coalescible,
 * so per-keystroke commits would flood undo), the adjust-state-during-render resync on undo/redo, and
 * `useCommitOnUnmount` (a tab switch fires no blur). The style controls portal into the selection
 * toolbar - each edit is one undoable command, folding in any in-flight buffer text so it is never lost.
 */

/** Curated ink quick-picks. A pick from here is not a "custom" color, so it never joins recents. */
const TEXT_PALETTE = ['#0f172a', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#78716c'] as const;

interface BoardTextItemProps {
   item: BoardItem;
   content: TextBoardContent;
   isSelected: boolean;
   /** Editing sub-state: the focused textarea engages only while editing; a merely-selected element (incl.
    *  a multi-selection) stays a plain box (text + ring, no keyboard grab), so a group Delete removes it. */
   isEditing: boolean;
   /** The selection toolbar's action slot; the style controls portal here. */
   toolbarSlot: HTMLElement | null;
   onContentChange: (content: BoardItemContent) => void;
}

export function BoardTextItem({ content, isSelected, isEditing, toolbarSlot, onContentChange }: BoardTextItemProps) {
   const { t } = useTranslation();
   const { style } = content;
   const [text, setText] = useState(content.text);
   // Re-sync from the store on an external change (undo/redo) via the adjust-state-during-render pattern.
   // While typing the stored text is unchanged (commit is on blur), so this never clobbers in-progress edits.
   const [syncedText, setSyncedText] = useState(content.text);
   if (content.text !== syncedText) {
      setSyncedText(content.text);
      setText(content.text);
   }

   // The in-progress color while the picker is open, so the text previews live before the single undoable
   // commit. `color: null` previews a removal back to the adaptive default.
   const [pending, setPending] = useState<{ color: string | null } | null>(null);
   const effectiveStyle: TextStyle = pending ? { ...style, color: pending.color } : style;
   const css = textStyleToCss(effectiveStyle);
   const placeholder = t('BoardView.textPlaceholder');

   // The commit reads from refs so it is correct whether it fires from a blur, an unmount, or the picker
   // close - unaffected by stale closures.
   const pendingRef = useRef<{ color: string | null } | null>(null);
   const contentRef = useRef(content);
   const textRef = useRef(text);
   const textareaRef = useRef<HTMLTextAreaElement>(null);
   useEffect(() => { contentRef.current = content; textRef.current = text; });

   // Commit the buffered text on blur / unmount. An empty element is NEVER deleted - it PERSISTS showing its
   // placeholder (so changing the size, clicking out, or a tab switch before typing can't nuke it); the user
   // removes an unwanted empty text explicitly (the Delete key / the toolbar). Only a real change writes.
   const commitText = useCallback(() => {
      const value = textRef.current;
      const current = contentRef.current;
      if (value !== current.text) onContentChange({ ...current, text: value });
   }, [onContentChange]);

   // Applies a style patch as one undoable command, folding in the live buffer text so an in-flight edit
   // is preserved (a toolbar click can land before a blur commits the text).
   const applyStyle = useCallback((patch: Partial<TextStyle>) => {
      const current = contentRef.current;
      onContentChange({ ...current, text: textRef.current, style: { ...current.style, ...patch } });
   }, [onContentChange]);

   const commitPendingColor = useCallback(() => {
      const change = pendingRef.current;
      if (!change) return;
      const next = change.color;
      const current = contentRef.current;
      if (next !== current.style.color) {
         onContentChange({ ...current, text: textRef.current, style: { ...current.style, color: next } });
         // Only colors picked from the full picker (not a curated swatch) join recents.
         if (next && !TEXT_PALETTE.includes(next as (typeof TEXT_PALETTE)[number])) pushRecentColor(next);
      }
      pendingRef.current = null;
      setPending(null);
   }, [onContentChange]);

   // Clicking the canvas to dismiss the popover also deselects the element (unmounting the control);
   // commit any pending color here so the pick is never lost to that race.
   useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- commit (and clear) a pending color after the deselect render
      if (!isSelected) commitPendingColor();
   }, [isSelected, commitPendingColor]);

   // Entering editing focuses the field on the next frame - deferred past the promoting click's own focus
   // handling, which lands on the box body and would otherwise blur the freshly mounted textarea, forcing a
   // second click. Fires on the enter-editing transition and on a fresh drop (which mounts already editing).
   useEffect(() => {
      if (!isEditing) return;
      const raf = requestAnimationFrame(() => {
         const el = textareaRef.current;
         if (!el) return;
         el.focus();
         // Caret to the END of the text, not the start - the natural place to keep typing.
         const end = el.value.length;
         el.setSelectionRange(end, end);
      });
      return () => cancelAnimationFrame(raf);
   }, [isEditing]);

   // Leaving editing removes the textarea in place (no unmount, and React fires no blur on that swap), so
   // flush the buffer on the editing->false edge. Dirty-guarded, so a normal blur-then-exit no-ops.
   const wasEditing = useRef(isEditing);
   useEffect(() => {
      const was = wasEditing.current;
      wasEditing.current = isEditing;
      if (was && !isEditing) commitText();
   });

   // A tab switch unmounts the board without a blur; flush the text (and any pending color) so nothing is lost.
   useCommitOnUnmount(commitText);
   useCommitOnUnmount(commitPendingColor);

   // The sizer text: the buffer plus a zero-width guard so a trailing newline still gives the box a line of
   // height; an empty buffer sizes to the placeholder so the caret has room and an empty element stays visible.
   const sizerText = text ? text + '\u200b' : placeholder;

   return (
      <div className="relative select-none" style={css}>
         {/* Sizer: the in-flow element that gives the box its auto-hug size (the box's w-max wrapper reads
             its widest line). Never wraps (`whitespace-pre`) so the box grows wide with the line rather than
             wrapping. Editing hides it (the textarea overlays it exactly); at rest - including while merely
             selected - it shows the text, or a muted placeholder for an empty element. */}
         <div
            aria-hidden={isEditing}
            className={cn('whitespace-pre', isEditing && 'invisible', !text && 'opacity-40')}
         >
            {sizerText}
         </div>

         {/* The textarea engages only while editing; a merely-selected element (incl. a multi-selection)
             stays a plain box (no textarea) so it can't grab the keyboard or clobber the set. */}
         {isEditing && (
            <textarea
               ref={textareaRef}
               value={text}
               onChange={(event) => setText(event.target.value)}
               onBlur={commitText}
               onPointerDown={(event) => event.stopPropagation()}
               placeholder={placeholder}
               spellCheck={false}
               // `wrap="off"` matches the non-wrapping sizer exactly, so the caret and text align pixel-for-pixel.
               wrap="off"
               // Editing -> the board's wheel listener skips this so the wheel scrolls the field, not zoom.
               data-board-wheel-scroll
               style={css}
               className="absolute inset-0 resize-none overflow-hidden whitespace-pre border-0 bg-transparent p-0 outline-none placeholder:opacity-40 cursor-text"
            />
         )}

         {isSelected && toolbarSlot && createPortal(
            <TextStyleControls
               style={style}
               previewColor={effectiveStyle.color}
               onApplyStyle={applyStyle}
               onPreviewColor={(color) => { pendingRef.current = { color }; setPending({ color }); }}
               onCommitColor={commitPendingColor}
            />,
            toolbarSlot,
         )}
      </div>
   );
}

/**
 * The text element's selection-toolbar controls: color (the shared picker, adaptive default), font (a
 * popover picker of the bundled faces), size (a preset stepper), the bold/italic/underline toggles, and
 * align. Each control commits one undoable style edit; the discrete buttons keep the textarea focused
 * (`preventDefault`) so styling never blurs a mid-edit buffer, while the color popover follows the post-it
 * preview-then-commit-on-close pattern.
 */
function TextStyleControls({
   style,
   previewColor,
   onApplyStyle,
   onPreviewColor,
   onCommitColor,
}: {
   style: TextStyle;
   previewColor: string | null;
   onApplyStyle: (patch: Partial<TextStyle>) => void;
   onPreviewColor: (color: string | null) => void;
   onCommitColor: () => void;
}) {
   const { t } = useTranslation();
   const AlignIcon = style.align === 'center' ? AlignCenter : style.align === 'right' ? AlignRight : AlignLeft;
   const nextAlign: TextStyle['align'] = style.align === 'left' ? 'center' : style.align === 'center' ? 'right' : 'left';

   return (
      <div className="flex items-center gap-0.5">
         <TextColorControl previewColor={previewColor} onPreview={onPreviewColor} onCommit={onCommitColor} />

         <TextFontControl value={style.fontFamily} onSelect={(fontFamily) => onApplyStyle({ fontFamily })} label={t('BoardView.textFont')} />

         {/* Size: a Word-style combo - a typeable field + a preset dropdown, with grow/shrink to its right. */}
         <TextSizeControl size={style.size} onApplyStyle={onApplyStyle} />

         <StyleButton title={t('BoardView.textBold')} active={style.weight === 'bold'} onClick={() => onApplyStyle({ weight: style.weight === 'bold' ? 'normal' : 'bold' })}>
            <Bold className="h-4 w-4" />
         </StyleButton>
         <StyleButton title={t('BoardView.textItalic')} active={style.italic} onClick={() => onApplyStyle({ italic: !style.italic })}>
            <Italic className="h-4 w-4" />
         </StyleButton>
         <StyleButton title={t('BoardView.textUnderline')} active={style.underline} onClick={() => onApplyStyle({ underline: !style.underline })}>
            <Underline className="h-4 w-4" />
         </StyleButton>

         <StyleButton title={t('BoardView.textAlign')} onClick={() => onApplyStyle({ align: nextAlign })}>
            <AlignIcon className="h-4 w-4" />
         </StyleButton>
      </div>
   );
}

/**
 * The font-size control: a Word-style combo - a typeable numeric field (Enter/blur commits, clamped to the
 * bounds), a dropdown of the size presets, and the grow/shrink steppers to its right. Each change is one
 * undoable style edit. The draft re-syncs whenever the size moves elsewhere (a preset, the steppers, undo).
 */
function TextSizeControl({ size, onApplyStyle }: { size: number; onApplyStyle: (patch: Partial<TextStyle>) => void }) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);
   const rounded = Math.round(size);
   const [draft, setDraft] = useState(String(rounded));
   const [syncedSize, setSyncedSize] = useState(rounded);
   if (rounded !== syncedSize) {
      setSyncedSize(rounded);
      setDraft(String(rounded));
   }

   const commitDraft = () => {
      const parsed = Number.parseInt(draft, 10);
      if (Number.isFinite(parsed)) {
         const clamped = Math.max(MIN_TEXT_SIZE, Math.min(MAX_TEXT_SIZE, parsed));
         if (clamped !== rounded) onApplyStyle({ size: clamped });
         setDraft(String(clamped));
      } else {
         setDraft(String(rounded)); // empty / invalid -> revert to the current size
      }
   };

   return (
      <div className="flex items-center gap-0.5">
         <div className="flex h-6 items-center rounded border border-border">
            <input
               value={draft}
               inputMode="numeric"
               aria-label={t('BoardView.textSize')}
               onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
               onFocus={(event) => event.target.select()}
               onKeyDown={(event) => {
                  if (event.key === 'Enter') { commitDraft(); event.currentTarget.blur(); }
                  else if (event.key === 'Escape') { setDraft(String(rounded)); event.currentTarget.blur(); }
               }}
               onBlur={commitDraft}
               onPointerDown={(event) => event.stopPropagation()}
               className="w-10 bg-transparent px-1 text-center text-xs tabular-nums text-popover-foreground outline-none"
            />
            <Popover open={open} onOpenChange={setOpen}>
               <PopoverTrigger asChild>
                  <button
                     type="button"
                     title={t('BoardView.textSizePresets')}
                     aria-label={t('BoardView.textSizePresets')}
                     onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                     className="flex h-6 w-4 items-center justify-center rounded-r text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                  >
                     <ChevronDown className="h-3 w-3" />
                  </button>
               </PopoverTrigger>
               <PopoverContent
                  align="start"
                  sideOffset={4}
                  // Portaled, so a press inside still bubbles the React tree to the item's pointer handler
                  // and deselects it (the size then applies to nothing) - stop it at the content root.
                  onPointerDown={(event) => event.stopPropagation()}
                  className="w-16 rounded-md border border-border bg-popover p-1 shadow-md"
               >
                  <div className="max-h-56 overflow-y-auto">
                     {TEXT_SIZE_PRESETS.map((preset) => (
                        <button
                           key={preset}
                           type="button"
                           onClick={() => { onApplyStyle({ size: preset }); setOpen(false); }}
                           className={cn(
                              'flex w-full items-center justify-center rounded px-2 py-1 text-xs tabular-nums text-popover-foreground hover:bg-muted cursor-pointer',
                              preset === rounded && 'bg-muted font-medium',
                           )}
                        >
                           {preset}
                        </button>
                     ))}
                  </div>
               </PopoverContent>
            </Popover>
         </div>

         <StyleButton title={t('BoardView.textSizeDecrease')} onClick={() => onApplyStyle({ size: steppedTextSize(size, -1) })}>
            <AArrowDown className="h-4 w-4" />
         </StyleButton>
         <StyleButton title={t('BoardView.textSizeIncrease')} onClick={() => onApplyStyle({ size: steppedTextSize(size, 1) })}>
            <AArrowUp className="h-4 w-4" />
         </StyleButton>
      </div>
   );
}

/**
 * A frosted toggle/action button in the text toolbar. `preventDefault` on pointer-down keeps the textarea
 * focused so a style edit never blurs (and commits) the buffer mid-typing; `active` marks a pressed toggle.
 */
function StyleButton({ title, active = false, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: ReactNode }) {
   return (
      <button
         type="button"
         title={title}
         aria-label={title}
         aria-pressed={active}
         onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
         onClick={onClick}
         className={cn(
            'flex h-6 min-w-6 items-center justify-center rounded px-1 text-popover-foreground hover:bg-muted',
            active && 'bg-muted text-foreground ring-1 ring-primary/40',
         )}
      >
         {children}
      </button>
   );
}

/**
 * The text color control: a filled swatch that opens the shared color popover (portaled above the canvas).
 * The swatch shows the current ink color, or the adaptive default (the theme foreground) when unset - the
 * same trigger the post-it and other board color controls use. A pick previews live on the element; any
 * close (Escape, outside click, a discrete swatch/remove) commits the single undoable change. Remove
 * returns to the adaptive default (`null` -> currentColor).
 */
function TextColorControl({ previewColor, onPreview, onCommit }: { previewColor: string | null; onPreview: (color: string | null) => void; onCommit: () => void }) {
   const { t } = useTranslation();
   const [open, setOpen] = useState(false);

   return (
      <ColorPickerPopover
         open={open}
         onOpenChange={(next) => { if (!next) onCommit(); setOpen(next); }}
         activeColor={previewColor ?? undefined}
         palette={TEXT_PALETTE}
         recent={readRecentColors()}
         recentLabel={t('BoardView.recentColors')}
         removeLabel={t('BoardView.removeColor')}
         onApply={(color) => onPreview(color ?? null)}
         trigger={
            <button
               type="button"
               title={t('BoardView.textColor')}
               aria-label={t('BoardView.textColor')}
               onPointerDown={(event) => event.stopPropagation()}
               className="flex h-6 w-6 items-center justify-center rounded border border-border"
               style={{ backgroundColor: previewColor ?? 'var(--foreground)' }}
            />
         }
      />
   );
}

/**
 * The font control: a compact "Aa" trigger (in the current face) opening a popover list of the bundled
 * fonts, each row rendered in its own face with the active one checked. Picking applies one undoable style
 * edit and closes. Modal like the color popover, so the dismissing outside click is consumed by the popover
 * rather than deselecting the element out from under it.
 */
function TextFontControl({ value, onSelect, label }: { value: TextFontFamily; onSelect: (font: TextFontFamily) => void; label: string }) {
   const [open, setOpen] = useState(false);

   return (
      <Popover open={open} modal onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={label}
               aria-label={label}
               onPointerDown={(event) => event.stopPropagation()}
               className="flex h-6 min-w-6 items-center justify-center rounded px-1 text-popover-foreground hover:bg-muted"
            >
               <span className="text-[13px] font-semibold leading-none" style={{ fontFamily: TEXT_FONT_STACKS[value] }}>Aa</span>
            </button>
         </PopoverTrigger>
         <PopoverContent align="center" sideOffset={6} className="w-44 p-1">
            <div className="flex flex-col">
               {TEXT_FONT_FAMILIES.map((font) => (
                  <button
                     key={font}
                     type="button"
                     onPointerDown={(event) => event.stopPropagation()}
                     onClick={() => { onSelect(font); setOpen(false); }}
                     className={cn(
                        'flex items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-muted',
                        font === value && 'bg-muted',
                     )}
                  >
                     <span className="text-lg leading-none" style={{ fontFamily: TEXT_FONT_STACKS[font] }}>{TEXT_FONT_LABELS[font]}</span>
                     {font === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
               ))}
            </div>
         </PopoverContent>
      </Popover>
   );
}
