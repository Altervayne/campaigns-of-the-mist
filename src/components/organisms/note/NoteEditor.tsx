// -- React Imports --
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// -- CodeMirror Imports --
import { EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { Strikethrough, Table } from '@lezer/markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// -- Live-Preview Imports --
import { liveInlineDecorations } from './live/liveDecorations';
import { imageWidgetField, imageControllerFacet } from './live/imageWidgetField';
import { tableWidgetField } from './live/tableWidgetField';
import { coverStateExtension, coverGutterVisual, initialCover, setCoverEffect, getNoteCover, coverInsetLineCount } from './live/coverGutter';
import { titleStateExtension, initialTitle, setTitleEffect, getNoteTitle } from './live/titleField';
import { tableRegionAt } from './live/tableRegions';
import { listIndentKeymap } from './live/listKeymap';
import { formatToolbar } from './live/formatToolbar';
import { linkEditToolbar } from './live/linkEditToolbar';
import { linkNodeAt } from './live/linkNode';
import { findImageTokens } from '@/lib/notes/noteImageHint';

// -- Table Ops (position-resolved, for the mobile sheet) --
import { buildTableActions, readTableModelAt } from './live/tableWidget';

// -- Image Ops (position-resolved, for the mobile sheet) --
import { readImageHintAt, setImageAlignAt, setImageWidthAt, removeImageAt } from './live/assetImageWidget';

// -- Type Imports --
import type { CoverController } from './live/coverGutter';
import type { FormatController } from './live/formatToolbar';
import type { LinkEditController } from './live/linkEditToolbar';
import type { TableController, TableContextRequest } from './live/tableWidget';
import type { ImageController, ImageRequest } from './live/assetImageWidget';
import type { NoteImageAlign } from '@/lib/notes/noteImageHint';
import type { NoteCover } from '@/lib/types/board';

/*
 * The Notes editor: a CodeMirror 6 surface over the flat markdown `body`. The CM6 document IS the buffer -
 * there is NO parse/serialise round-trip, so `noteImageHint`/`noteAssets`/export/GC/print keep reading the
 * exact string. `value` seeds the doc and reconciles EXTERNAL changes (a store undo, an image-insert splice,
 * a mode flip); every doc edit fires `onChange` with `doc.toString()` verbatim - no line-separator override,
 * no trim, no normalisation (Ada's byte-honesty contract).
 *
 * Phase 1 is SOURCE mode: markdown text with syntax highlighting, decorations OFF. Live Preview (inline
 * widgets + off-cursor syntax hiding) is a later phase; it layers a decoration extension onto this same view.
 *
 * Structural edits (image insertion, future hint/align rewrites) come in through the imperative {@link
 * NoteEditorHandle}: a caller dispatches a CM6 `changes` at real byte offsets, keeping undo granular and the
 * rest of the doc byte-identical - never a whole-doc replace.
 */

/** The imperative handle a caller (e.g. image insertion, the permanent toolbar) uses to drive the CM6 doc. */
export interface NoteEditorHandle {
   /** The current caret offset (selection head), or the doc end when unfocused. */
   getCaret: () => number;
   /** The current selection range (`from`/`to`, `from === to` when collapsed). */
   getSelection: () => { from: number; to: number };
   /**
    * A safe body-image insertion offset: the caret, UNLESS it sits within the cover's inset lines (the first N
    * lines beside the cover), in which case the start of the first line PAST the cover region - so an inserted
    * image lands below the cover, never squeezed into its gutter. Falls back to the caret when there's no cover.
    */
   getInsertionPos: () => number;
   /** The current document text, verbatim. */
   getValue: () => string;
   /** Replaces `[from, to)` with `insert`, optionally placing the caret at `selectAt`. Focuses the editor. */
   splice: (from: number, to: number, insert: string, selectAt?: number) => void;
   /** Scrolls a document offset to the top of the viewport and lands the caret there (outline navigation). */
   scrollToPos: (pos: number) => void;
   /** Focuses the editor without changing the selection (mobile first-run autofocus on a just-created note). */
   focus: () => void;
   /** Sets the note title in CM6 state (history-captured), WITHOUT stealing focus from the title input. */
   setTitle: (title: string) => void;
   /** Sets a fresh cover (history-captured). */
   setCover: (cover: NoteCover) => void;
   /** Patches the current cover's box width/aspect (history-captured). No-op with no cover. */
   updateCover: (patch: Partial<Pick<NoteCover, 'width' | 'aspect'>>) => void;
   /** Clears the cover (history-captured). */
   clearCover: () => void;
   /** Undoes the latest change in the shared timeline (body OR title OR cover). Returns whether it fired. */
   undo: () => boolean;
   /** Redoes the latest reverted change in the shared timeline. Returns whether it fired. */
   redo: () => boolean;
   /** Whether the CM6 editor currently holds DOM focus (so a window shortcut doesn't double-handle its keymap). */
   hasFocus: () => boolean;
   /**
    * Builds a table request for the mobile slide-up sheet: the caret cell's actions plus a `resolveFor`/`getDims`
    * anchored to `tablePos`, so the sheet stays live across ops and walks the target. Null if no view yet.
    */
   buildTableRequest: (tablePos: number, row: number, col: number) => TableContextRequest | null;
   /**
    * Builds an image request for the mobile options sheet: getters/setters anchored to the token's start `index`,
    * so the sheet re-reads the hint and drives align/width/remove without moving focus. Null if no view yet.
    */
   buildImageRequest: (index: number) => ImageRequest | null;
}

interface NoteEditorProps {
   value: string;
   onChange: (next: string) => void;
   /** The note title, seeded into CM6 state so it shares the undo timeline. Seed-only (read once per view build). */
   title: string;
   /** Fires when the CM6 title changes (a mirror commit or an undo/redo), so the store + input can follow it. */
   onTitleChange: (title: string) => void;
   /** Fires when the CM6 cover changes (a cover edit or an undo/redo), so the store can persist it. */
   onCoverChange: (cover: NoteCover | null) => void;
   /** Fires when the undo/redo availability changes, so the toolbar buttons enable/disable. */
   onHistoryChange: (state: { canUndo: boolean; canRedo: boolean }) => void;
   placeholder?: string;
   /** LIVE preview (inline syntax hide/reveal + mention pills + inline image widgets) vs SOURCE (plain markdown). */
   live: boolean;
   /** The note-level cover; seeded into CM6 state. Rendered top-left (Live) with the opening lines inset beside it. */
   cover?: NoteCover;
   /** The cover controls' callbacks (Change/Remove + box commits). Bound into the Live cover gutter. */
   coverController: CoverController;
   /** The floating format bar's callbacks (Insert image + labels). Bound into Live and Source. */
   formatController: FormatController;
   /** The caret link-edit bar's callbacks (Open / Change target + labels). Bound into Live and Source. */
   linkEditController: LinkEditController;
   /** The live table controller (opens the right-click context menu at a screen point with the cell's actions). */
   tableController: TableController;
   /** The image controller. Mobile supplies `onTap` (image -> options sheet); desktop omits it (hover chrome). */
   imageController?: ImageController;
   /** Native paste/drop handler for images (returns true when it consumed the event). Wired into CM6 dom events. */
   onImageEvent?: (event: ClipboardEvent | DragEvent) => boolean;
   /** Resolves an internal/external link on Ctrl/Cmd-click (plain click still edits). Host-agnostic: the renderer closes over its host. */
   onLinkActivate?: (href: string) => void;
   /** The localized "target not found" tooltip for a dead Live chip (the imperative widget has no i18n of its own). */
   deadLinkTooltip: string;
}

/*
 * The paper document palette drives every visible token. All colours are `currentColor`-translucent so they
 * inherit `--paper-foreground` - which means a custom theme's `--paper-*` reaches the editor for free, exactly
 * like `docMarkdownComponents`. Headings/emphasis carry weight/slant; punctuation stays quiet.
 */
const paperHighlight = HighlightStyle.define([
   // Heading SIZE comes only from the `.cm-md-h*` line classes (matching `docMarkdownComponents`); setting it
   // here too would compound the `em` against the already-sized line and blow headings up ~1.9x. Weight only.
   { tag: tags.heading1, fontWeight: 'bold' },
   { tag: tags.heading2, fontWeight: 'bold' },
   { tag: tags.heading3, fontWeight: '600' },
   { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '600' },
   { tag: tags.strong, fontWeight: 'bold' },
   { tag: tags.emphasis, fontStyle: 'italic' },
   { tag: tags.strikethrough, textDecoration: 'line-through' },
   { tag: [tags.link, tags.url], color: 'currentColor', textDecoration: 'underline' },
   { tag: [tags.monospace], fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
   { tag: [tags.processingInstruction, tags.meta], opacity: '0.5' },
   { tag: tags.quote, fontStyle: 'italic', opacity: '0.9' },
]);

/* Strips CM6's default editor look so the parchment sheet is the only frame. Chrome would read as "text box". */
const paperTheme = EditorView.theme({
   '&': {
      backgroundColor: 'transparent',
      color: 'var(--paper-foreground)',
   },
   '&.cm-focused': { outline: 'none' },
   '.cm-scroller': {
      fontFamily: 'inherit',
      lineHeight: '1.625',
      overflow: 'visible',
      // Anchors the absolute cover overlay (`.cm-note-cover`), which lives in the scroller so a CM6 content
      // redraw never wipes it.
      position: 'relative',
   },
   '.cm-content': {
      padding: '0',
      caretColor: 'var(--paper-foreground)',
      // The reading measure, centred - matching NoteDocument's 68ch cap on the wider paper sheet.
      maxWidth: '68ch',
      marginInline: 'auto',
   },
   '.cm-line': { padding: '0' },
   '&.cm-editor .cm-cursor': { borderLeftColor: 'var(--paper-foreground)' },
   // Ink-on-parchment selection wash, never browser blue.
   '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--paper-foreground) 16%, transparent)',
   },
   '.cm-activeLine': { backgroundColor: 'transparent' },
   '.cm-placeholder': { color: 'var(--paper-foreground)', opacity: '0.4' },

   // ==================
   //  Live-Preview decoration classes (parity with docMarkdownComponents)
   // ==================
   // Heading lines: size + weight matching the doc map's h1..h4. H1 & H2 carry an UNDERLINE rule (a setext
   // heading's identity is its underline; Reading can't tell setext from ATX so both underline h1/h2, GitHub
   // convention) on the paper-border token so it's palette-adaptive. h3/h4 get no rule.
   '.cm-md-h1': { fontSize: '1.875em', fontWeight: 'bold', lineHeight: '1.2', borderBottom: '1px solid var(--paper-border)', paddingBottom: '0.25rem' },
   '.cm-md-h2': { fontSize: '1.5em', fontWeight: 'bold', lineHeight: '1.25', borderBottom: '1px solid var(--paper-border)', paddingBottom: '0.25rem' },
   '.cm-md-h3': { fontSize: '1.25em', fontWeight: '600' },
   '.cm-md-h4': { fontSize: '1.125em', fontWeight: '600' },
   // Inline marks: always-on styling for the content (the "live" in Live Preview).
   '.cm-md-strong': { fontWeight: 'bold' },
   '.cm-md-em': { fontStyle: 'italic' },
   '.cm-md-strike': { textDecoration: 'line-through', opacity: '0.8' },
   '.cm-md-code': { backgroundColor: 'color-mix(in srgb, currentColor 10%, transparent)', borderRadius: '0.25rem', padding: '0.1em 0.375em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.9em' },
   // Blockquote as a callout BLOCK (left bar + subtle tint + padding), matching the Reading blockquote. Each
   // quote line takes this class; contiguous lines form one continuous block (border + tint run together).
   '.cm-md-quote-line': { borderLeft: '4px solid color-mix(in srgb, currentColor 40%, transparent)', backgroundColor: 'color-mix(in srgb, currentColor 5%, transparent)', paddingLeft: '1rem', paddingRight: '0.75rem', fontStyle: 'italic', opacity: '0.9' },
   // A rendered horizontal rule (replaces `---` off the cursor line), matching the Reading `<hr>`.
   '.cm-md-hr': { display: 'inline-block', width: '100%', height: '0', verticalAlign: 'middle', borderTop: '2px solid color-mix(in srgb, currentColor 25%, transparent)' },
   // List items: a DEPTH-AWARE indent (`--li-indent` per nesting level, matching Reading's nested `pl-6`) as the
   // line padding, then a FIXED-WIDTH marker slot holding the glyph. Both the rendered bullet/number widget (off
   // the caret's line) and the raw marker (on it) carry `cm-md-li-marker`, so content sits at the same x either
   // way (depth padding + one slot) and only the glyph differs.
   '.cm-md-li': { paddingLeft: 'var(--li-indent, 0rem)' },
   '.cm-md-li-marker': { display: 'inline-block', width: '1.5rem' },
   // Syntax markers are COLLAPSED off-line via a zero-width replace (no class - no space, no cursor slot);
   // on the caret's line they render raw. So there is no marker opacity/reveal CSS here anymore.

   // ==================
   //  Inline image widget chrome (theme tokens; the image itself is content on paper)
   // ==================
   '.cm-note-image-selected': { outline: '2px solid var(--ring)', outlineOffset: '2px', borderRadius: '0.375rem' },
   '.cm-note-image-handle': { position: 'absolute', height: '0.75rem', width: '0.75rem', borderRadius: '0.125rem', backgroundColor: 'var(--primary)', border: '2px solid var(--primary-foreground)', boxShadow: '0 1px 2px rgb(0 0 0 / 0.2)', zIndex: '3' },
   // Single bottom-right handle (the only corner kept, mirroring the Board's resize handle).
   '.cm-note-image-handle-br': { bottom: '-0.375rem', right: '-0.375rem', cursor: 'nwse-resize' },
   '.cm-note-image-bar': { position: 'absolute', top: '-2.5rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '0.125rem', padding: '0.25rem', borderRadius: '0.375rem', backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', zIndex: '4' },
   '.cm-note-image-align': { display: 'grid', placeItems: 'center', height: '1.75rem', width: '1.75rem', borderRadius: '0.25rem', cursor: 'pointer', color: 'inherit', background: 'transparent', border: 'none' },
   '.cm-note-image-align:hover': { backgroundColor: 'var(--muted)' },
   '.cm-note-image-align-active': { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' },
   '.cm-note-image-readout': { position: 'absolute', top: '0.25rem', right: '0.25rem', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', fontSize: '0.75rem', boxShadow: '0 1px 2px rgb(0 0 0 / 0.2)', zIndex: '5' },

   // ==================
   //  Cover box + hover controls (theme tokens; the cover image itself is content on paper)
   // ==================
   // The controls layer fades in on hover over the cover box; absolute, so it never shifts the document.
   '.cm-note-cover-controls': { position: 'absolute', inset: '0', opacity: '0', transition: 'opacity 120ms ease' },
   '.cm-note-cover:hover .cm-note-cover-controls': { opacity: '1' },
   '.cm-note-cover-bar': { position: 'absolute', top: '0.5rem', left: '0.5rem', display: 'flex', gap: '0.125rem', padding: '0.25rem', borderRadius: '0.375rem', backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' },
   '.cm-note-cover-btn': { display: 'grid', placeItems: 'center', height: '1.75rem', width: '1.75rem', borderRadius: '0.25rem', cursor: 'pointer', color: 'inherit', background: 'transparent', border: 'none' },
   '.cm-note-cover-btn:hover': { backgroundColor: 'var(--muted)' },
   // The cover "remove" reads as the destructive action it is (matching the app's delete convention).
   '.cm-note-cover-remove': { color: 'var(--destructive)' },
   '.cm-note-cover-remove:hover': { backgroundColor: 'color-mix(in srgb, var(--destructive) 20%, transparent)' },
   // The bottom-right box-width resize handle.
   '.cm-note-cover-handle': { position: 'absolute', bottom: '-0.375rem', right: '-0.375rem', height: '0.75rem', width: '0.75rem', borderRadius: '0.125rem', backgroundColor: 'var(--primary)', border: '2px solid var(--primary-foreground)', boxShadow: '0 1px 2px rgb(0 0 0 / 0.2)', cursor: 'nwse-resize' },

   // ==================
   //  Floating selection bar (theme tokens): Bold/Italic/Strike, shown on a non-empty selection.
   // ==================
   '.cm-note-format-bar': { position: 'absolute', zIndex: '7', display: 'flex', alignItems: 'center', gap: '0.125rem', padding: '0.25rem', borderRadius: '0.375rem', backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' },
   '.cm-note-format-btn': { display: 'grid', placeItems: 'center', height: '1.75rem', width: '1.75rem', borderRadius: '0.25rem', cursor: 'pointer', color: 'inherit', background: 'transparent', border: 'none' },
   '.cm-note-format-btn:hover': { backgroundColor: 'var(--muted)' },
   '.cm-note-format-sep': { alignSelf: 'stretch', width: '1px', margin: '0.125rem 0.125rem', backgroundColor: 'var(--border)' },

   // ==================
   //  Editable table grid - CLEAN cells (paper palette, parity with docMarkdownComponents). Insert-at-position,
   //  delete, and align live in the right-click menu; two full-edge hover "+" bars add a row / column.
   // ==================
   // Vertical spacing is top/bottom PADDING (not margin) so CM6's block-widget height-map counts it - else
   // lines below the table map a line high and the cursor is dishonest (the same fix the block image needed).
   // NO horizontal padding: the grid is FULL content width. The edge "+" bars are true overlays on the table's
   // own edges (they reserve no width), so the table equals the content column width.
   // `min-width: 0` lets the wrap shrink below the grid's intrinsic width so a wide table can't force the whole
   // block (and `.cm-content` with it) past the reading column; the scroller inside does the actual scrolling.
   '.cm-note-table': { position: 'relative', padding: '0.75rem 0', minWidth: '0', maxWidth: '100%' },
   // A too-wide table (more columns than the paper column fits) scrolls sideways WITHIN this container instead of
   // clipping out of the sheet. Wraps only the grid; the edge "+" bars sit outside it (siblings on .cm-note-table).
   // `contain: inline-size` is load-bearing: it makes the scroller's WIDTH independent of the grid inside, so the
   // 1000px+ grid can't propagate its intrinsic width up through `.cm-content` (which would snap to its 68ch max
   // and spill past the sheet). The column stays at the sheet's inner width and the grid scrolls inside it.
   '.cm-note-table-scroll': { width: '100%', maxWidth: '100%', minWidth: '0', overflowX: 'auto', contain: 'inline-size' },
   '.cm-note-table-grid': { width: '100%', borderCollapse: 'collapse', fontSize: '0.95em' },
   '.cm-note-table-grid th, .cm-note-table-grid td': { border: '1px solid color-mix(in srgb, currentColor 30%, transparent)', padding: '0.375rem 0.625rem', verticalAlign: 'top' },
   '.cm-note-table-grid th': { fontWeight: '600' },
   // Editable cells: no outline until focused, then a theme-ring so the active cell reads. `<br>` line breaks
   // render as real breaks (block display + pre-wrap).
   '.cm-note-table-cell': { display: 'block', minWidth: '2rem', minHeight: '1.25em', outline: 'none', cursor: 'text', whiteSpace: 'pre-wrap' },
   '.cm-note-table-cell:focus': { outline: '2px solid var(--ring)', outlineOffset: '-1px', borderRadius: '0.125rem' },
   // Full-edge add bars (theme tokens), subtle until hover - TRUE OVERLAYS on the table's own edges (reserve no
   // width). Bottom bar overlays the table's bottom edge, full table width (add row); right bar overlays the
   // right edge, full table height (add column). Sit within the top/bottom padding band so nothing overflows.
   // Full-edge add bars sit just OUTSIDE the table's own edges (they reserve no width, so the table stays full
   // column width). Bottom bar (add row) hugs the table's bottom border and extends down into the padding band;
   // right bar (add column) hugs the right border and overflows just past it. Their outer corners are rounded and
   // they carry a soft paper-derived fill so they read as tabs attached to the table, not part of the parchment.
   '.cm-note-table-add-row-bar': { position: 'absolute', left: '0', right: '0', bottom: '-0.125rem', height: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '0 0 0.3125rem 0.3125rem', backgroundColor: 'color-mix(in srgb, var(--paper-border) 28%, var(--paper-background))', color: 'var(--paper-foreground)', cursor: 'pointer', opacity: '0', transition: 'opacity 120ms ease, background-color 120ms ease' },
   '.cm-note-table-add-col-bar': { position: 'absolute', top: '0.75rem', bottom: '0.75rem', right: '-0.875rem', width: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '0 0.3125rem 0.3125rem 0', backgroundColor: 'color-mix(in srgb, var(--paper-border) 28%, var(--paper-background))', color: 'var(--paper-foreground)', cursor: 'pointer', opacity: '0', transition: 'opacity 120ms ease, background-color 120ms ease' },
   '.cm-note-table:hover .cm-note-table-add-row-bar, .cm-note-table:hover .cm-note-table-add-col-bar': { opacity: '0.9' },
   '.cm-note-table-add-row-bar:hover, .cm-note-table-add-col-bar:hover': { opacity: '1', backgroundColor: 'color-mix(in srgb, var(--paper-border) 44%, var(--paper-background))', color: 'var(--paper-foreground)' },
   '.cm-note-table-add-plus': { display: 'block', fontSize: '0.8rem', fontWeight: '700', lineHeight: '1', textAlign: 'center' },
}, { dark: false });

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
   { value, onChange, title, onTitleChange, onCoverChange, onHistoryChange, placeholder, live, cover, coverController, formatController, linkEditController, tableController, imageController, onImageEvent, onLinkActivate, deadLinkTooltip },
   ref,
) {
   const hostRef = useRef<HTMLDivElement>(null);
   const viewRef = useRef<EditorView | null>(null);
   // Latest-refs so the CM6 handlers (created once) always call the current closures.
   const onChangeRef = useRef(onChange);
   onChangeRef.current = onChange;
   const onTitleChangeRef = useRef(onTitleChange);
   onTitleChangeRef.current = onTitleChange;
   const onCoverChangeRef = useRef(onCoverChange);
   onCoverChangeRef.current = onCoverChange;
   const onHistoryChangeRef = useRef(onHistoryChange);
   onHistoryChangeRef.current = onHistoryChange;
   const onImageEventRef = useRef(onImageEvent);
   onImageEventRef.current = onImageEvent;
   const onLinkActivateRef = useRef(onLinkActivate);
   onLinkActivateRef.current = onLinkActivate;
   // The dead-chip tooltip, read at view build (seed-only, like `placeholder`); a rebuild on the next Live flip
   // picks up a language change.
   const deadLinkTooltipRef = useRef(deadLinkTooltip);
   deadLinkTooltipRef.current = deadLinkTooltip;
   // The current doc, so a `live` flip can re-seed the rebuilt view with the latest buffer (not the stale prop).
   const valueRef = useRef(value);
   valueRef.current = value;
   // The current title, to seed a rebuilt view's title field (Live flip / mount) from the latest value.
   const titleRef = useRef(title);
   titleRef.current = title;
   // The current cover, to seed a rebuilt view's cover field (Live flip / mount) from the latest value.
   const coverRef = useRef(cover);
   coverRef.current = cover;
   // A latest-ref for the controller, wrapped in a STABLE controller so the gutter (built once) always calls
   // the current callbacks - a re-render swaps the closures without rebuilding the view.
   const controllerRef = useRef(coverController);
   controllerRef.current = coverController;
   const stableController = useRef<CoverController>({
      get editable() { return controllerRef.current.editable; },
      get labels() { return controllerRef.current.labels; },
      onChange: () => controllerRef.current.onChange(),
      onRemove: () => controllerRef.current.onRemove(),
      onResizeBox: (w, a) => controllerRef.current.onResizeBox(w, a),
      onSetAspect: (a) => controllerRef.current.onSetAspect(a),
      // Presence is fixed per surface (desktop never taps, mobile always does), so read it at build time - the
      // gutter checks `onTap` to pick tap-target vs hover controls, and a static delegate would force taps everywhere.
      onTap: coverController.onTap ? () => controllerRef.current.onTap?.() : undefined,
   }).current;
   // Same stable-ref pattern for the format bar controller (the view is built once; a re-render swaps closures).
   const formatControllerRef = useRef(formatController);
   formatControllerRef.current = formatController;
   const stableFormatController = useRef<FormatController>({
      get editable() { return formatControllerRef.current.editable; },
      get labels() { return formatControllerRef.current.labels; },
      onInsertLink: () => formatControllerRef.current.onInsertLink(),
   }).current;
   // Same stable-ref pattern for the caret link-edit bar controller (the view is built once; a re-render swaps closures).
   const linkEditControllerRef = useRef(linkEditController);
   linkEditControllerRef.current = linkEditController;
   const stableLinkEditController = useRef<LinkEditController>({
      get editable() { return linkEditControllerRef.current.editable; },
      get labels() { return linkEditControllerRef.current.labels; },
      onOpen: (href) => linkEditControllerRef.current.onOpen(href),
      onChangeTarget: (seed) => linkEditControllerRef.current.onChangeTarget(seed),
   }).current;
   // The table controller, captured stably so the field (built once) always calls the current opener - a
   // re-render swaps the closure without rebuilding the view.
   const tableControllerRef = useRef(tableController);
   tableControllerRef.current = tableController;
   const stableTableController = useRef<TableController>({
      openContextMenu: (request) => tableControllerRef.current.openContextMenu(request),
      onCaretCell: (ctx) => tableControllerRef.current.onCaretCell?.(ctx),
      get labels() { return tableControllerRef.current.labels; },
   }).current;
   // The image controller, captured stably so the field (built once) always calls the current callback. Like the
   // cover's `onTap`, presence is fixed per surface (desktop never taps), so it's resolved at build time - a static
   // delegate would make every desktop image a tap-target with no hover chrome.
   const imageControllerRef = useRef(imageController);
   imageControllerRef.current = imageController;
   const stableImageController = useRef<ImageController>({
      onTap: imageController?.onTap ? (ctx) => imageControllerRef.current?.onTap?.(ctx) : undefined,
   }).current;

   // Rebuild the view when `live` flips (the extension set differs: Live adds the decoration engine + image
   // widgets). Seeded from the LIVE buffer so no edit is lost across the flip. Not rebuilt per keystroke.
   useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const view = new EditorView({
         state: EditorState.create({
            doc: valueRef.current,
            extensions: [
               history(),
               // Title + cover live in CM6 state so they share the ONE undo timeline with the body. Both are
               // seeded via facets (no dispatch = no history entry on load); the cover STATE (not its Live
               // visuals) is loaded in both modes so a toolbar cover edit is undoable in Source too.
               initialTitle.of(titleRef.current),
               titleStateExtension,
               initialCover.of(coverRef.current ?? null),
               coverStateExtension,
               // List Tab/Shift+Tab indent BEFORE the default keymap so it intercepts Tab on list lines only
               // (it falls through elsewhere, leaving Tab's normal behaviour intact).
               listIndentKeymap,
               keymap.of([...defaultKeymap, ...historyKeymap]),
               // GFM Strikethrough + Table so the Lezer tree yields their nodes - the base CommonMark parser
               // doesn't, so `~~text~~` never styles and a table block never renders as a grid in Live.
               markdown({ extensions: [Strikethrough, Table] }),
               syntaxHighlighting(paperHighlight),
               EditorView.lineWrapping,
               paperTheme,
               placeholder ? cmPlaceholder(placeholder) : [],
               // The floating format bar (Bold/Italic/Strike over a selection + Insert image at the caret) - in
               // both Live and Source, since both are editing surfaces.
               formatToolbar(stableFormatController),
               // The caret link-edit bar (Open / Change target / Edit label / Remove) - shown when the caret sits
               // inside a link with a collapsed selection; mutually exclusive with the format bar by selection state.
               linkEditToolbar(stableLinkEditController),
               // LIVE mode: the Lezer inline decoration engine + the StateField image/table widgets + the cover VISUALS.
               ...(live ? [liveInlineDecorations(deadLinkTooltipRef.current), imageWidgetField, imageControllerFacet.of(stableImageController), tableWidgetField(stableTableController), coverGutterVisual(stableController)] : []),
               EditorView.updateListener.of((update) => {
                  const { state, startState } = update;
                  if (update.docChanged) onChangeRef.current(state.doc.toString());
                  // Mirror title/cover field changes (a real edit OR an undo/redo) up to the store + inputs.
                  const title = getNoteTitle(state);
                  if (title !== getNoteTitle(startState)) onTitleChangeRef.current(title);
                  const coverNow = getNoteCover(state);
                  if (coverNow !== getNoteCover(startState)) onCoverChangeRef.current(coverNow);
                  // Notify undo/redo availability so the toolbar buttons enable/disable.
                  if (undoDepth(state) !== undoDepth(startState) || redoDepth(state) !== redoDepth(startState)) {
                     onHistoryChangeRef.current({ canUndo: undoDepth(state) > 0, canRedo: redoDepth(state) > 0 });
                  }
               }),
               // Route image paste/drop to the shared insertion pipeline; a non-image event falls through
               // to CM6's own paste/drop (plain text). `return true` means we consumed it.
               EditorView.domEventHandlers({
                  paste: (event) => onImageEventRef.current?.(event) ?? false,
                  drop: (event) => onImageEventRef.current?.(event) ?? false,
                  // Ctrl/Cmd-click a link follows it (plain click edits); else a click on an image widget
                  // selects it. Link mod-click runs first (only fires with the modifier), so it never steals a
                  // plain image click.
                  mousedown: (event, view) => activateLinkOnModClick(event, view, onLinkActivateRef.current) || selectImageOnClick(event, view),
               }),
            ],
         }),
         parent: host,
      });
      viewRef.current = view;

      // Push the initial undo/redo availability (a rebuild resets the stack) so the toolbar buttons start correct.
      onHistoryChangeRef.current({ canUndo: undoDepth(view.state) > 0, canRedo: redoDepth(view.state) > 0 });

      return () => {
         // Commit-on-unmount: a tab switch unmounts with no blur, so flush the final buffer before destroy
         // (the debounced store write may not have fired). Idempotent - the parent's guard also flushes.
         onChangeRef.current(view.state.doc.toString());
         view.destroy();
         viewRef.current = null;
      };
      // `value`/`placeholder` are seed-only (read via the ref); external `value` changes flow through the
      // reconcile effect. Only `live` forces a rebuild.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [live]);

   // Reconcile an EXTERNAL value change (store undo/redo, an insertion splice from a stale render, a mode
   // flip) into the doc. Skipped for the common case (the change originated here, so value already matches).
   useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (value === current) return;
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
   }, [value]);

   // Cover is CM6 state now (seeded via the `initialCover` facet at view build, then owned by the field): a
   // cover edit originates in CM6 and flows OUT to the store via `onCoverChange`, so there is no store->CM6
   // cover reconcile (that would loop and, worse, log a redundant history entry). `cover` stays a seed-only prop.

   useImperativeHandle(ref, (): NoteEditorHandle => ({
      getCaret: () => viewRef.current?.state.selection.main.head ?? 0,
      getSelection: () => {
         const range = viewRef.current?.state.selection.main;
         return { from: range?.from ?? 0, to: range?.to ?? 0 };
      },
      getInsertionPos: () => {
         const view = viewRef.current;
         if (!view) return 0;
         const { state } = view;
         const caret = state.selection.main.head;

         // A body image must never land inside a TABLE cell (renders as a broken blob). If the caret is in a
         // table block, redirect to the start of the first line PAST the table (or doc end).
         const table = tableRegionAt(state, caret);
         if (table) {
            const tableEndLine = state.doc.lineAt(table.to).number;
            return tableEndLine >= state.doc.lines ? state.doc.length : state.doc.line(tableEndLine + 1).from;
         }

         // Nor in the COVER gutter (the first N inset lines beside the cover).
         const insetLines = coverInsetLineCount(state);
         if (insetLines <= 0) return caret;
         const caretLine = state.doc.lineAt(caret).number;
         if (caretLine > insetLines) return caret; // caret is already past the cover region
         // Push the insertion to the start of the first line after the cover (or doc end if the cover covers all).
         if (insetLines >= state.doc.lines) return state.doc.length;
         return state.doc.line(insetLines + 1).from;
      },
      getValue: () => viewRef.current?.state.doc.toString() ?? '',
      splice: (from, to, insert, selectAt) => {
         const view = viewRef.current;
         if (!view) return;
         view.dispatch({
            changes: { from, to, insert },
            ...(selectAt !== undefined ? { selection: { anchor: selectAt } } : {}),
         });
         view.focus();
      },
      scrollToPos: (pos) => {
         const view = viewRef.current;
         if (!view) return;
         const clamped = Math.max(0, Math.min(pos, view.state.doc.length));
         view.dispatch({ selection: { anchor: clamped } });
         // The CM6 `.cm-scroller` is `overflow: visible` (the DESK scrolls, not the editor), so CM6's own
         // scrollIntoView is a no-op. Scroll the nearest real scroll ancestor to the line's top via the HEIGHT
         // MAP (`lineBlockAt`) - valid even for an off-screen position, and synchronous (a selection-only
         // dispatch changes no layout), so it doesn't depend on a rAF tick.
         const scroller = findScrollableAncestor(view.contentDOM);
         if (scroller) {
            const lineTop = view.contentDOM.getBoundingClientRect().top + view.lineBlockAt(clamped).top;
            scroller.scrollBy({ top: lineTop - scroller.getBoundingClientRect().top - 16 });
         }
         view.focus();
      },
      focus: () => viewRef.current?.focus(),
      setTitle: (nextTitle) => {
         const view = viewRef.current;
         if (!view || getNoteTitle(view.state) === nextTitle) return;
         // No `view.focus()`: the title input owns focus while the caret is in it.
         view.dispatch({ effects: setTitleEffect.of(nextTitle), annotations: Transaction.userEvent.of('note.title') });
      },
      setCover: (nextCover) => {
         viewRef.current?.dispatch({ effects: setCoverEffect.of(nextCover), annotations: Transaction.userEvent.of('note.cover') });
      },
      updateCover: (patch) => {
         const view = viewRef.current;
         if (!view) return;
         const current = getNoteCover(view.state);
         if (!current) return;
         view.dispatch({ effects: setCoverEffect.of({ ...current, ...patch }), annotations: Transaction.userEvent.of('note.cover') });
      },
      clearCover: () => {
         const view = viewRef.current;
         if (!view || !getNoteCover(view.state)) return;
         view.dispatch({ effects: setCoverEffect.of(null), annotations: Transaction.userEvent.of('note.cover') });
      },
      undo: () => (viewRef.current ? undo(viewRef.current) : false),
      redo: () => (viewRef.current ? redo(viewRef.current) : false),
      hasFocus: () => viewRef.current?.hasFocus ?? false,
      buildTableRequest: (tablePos, row, col) => {
         const view = viewRef.current;
         if (!view) return null;
         return {
            x: 0,
            y: 0,
            row,
            col,
            tablePos,
            actions: buildTableActions(view, tablePos, row, col),
            resolveFor: (r, c) => buildTableActions(view, tablePos, r, c),
            getDims: () => {
               const m = readTableModelAt(view, tablePos);
               return m ? { bodyRows: m.rows.length, cols: m.header.length } : null;
            },
         };
      },
      buildImageRequest: (index) => {
         const view = viewRef.current;
         if (!view) return null;
         return {
            index,
            getHint: () => readImageHintAt(view, index),
            setAlign: (align: NoteImageAlign) => setImageAlignAt(view, index, align),
            setWidth: (widthPct: number) => setImageWidthAt(view, index, widthPct),
            remove: () => removeImageAt(view, index),
         };
      },
   }), []);

   return <div ref={hostRef} className="note-editor text-base" />;
});

/** The nearest scrollable ancestor of `el` (the note DESK, since `.cm-scroller` is overflow:visible here). */
function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
   for (let node = el.parentElement; node; node = node.parentElement) {
      const overflowY = getComputedStyle(node).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
   }
   return null;
}

/**
 * Clicking a rendered image widget selects it: place the caret inside that image token's span so the image
 * StateField marks it selected (ring + handles + align bar appear). A click on the handle / align button is
 * ignored here (they stop propagation and own their gesture). Returns false so CM6 keeps its normal handling.
 */
function selectImageOnClick(event: MouseEvent, view: EditorView): boolean {
   const target = event.target as HTMLElement | null;
   if (!target) return false;
   if (target.closest('.cm-note-image-handle, .cm-note-image-align')) return false;
   const figure = target.closest('[data-note-image]') as HTMLElement | null;
   if (!figure) return false;
   const pos = view.posAtDOM(figure);
   const token = findImageTokens(view.state.doc.toString()).find((tk) => pos >= tk.index && pos <= tk.index + tk.length);
   if (!token) return false;
   event.preventDefault();
   view.dispatch({ selection: { anchor: token.index + 1 } });
   view.focus();
   return true;
}

/**
 * Ctrl/Cmd-click follows the link under the pointer: hit-test the enclosing Lezer `Link` node, extract its
 * destination, and hand it to `onLinkActivate` (the renderer resolves it against its host). Plain click is left
 * alone so it edits (caret). Returns whether it handled the event.
 */
function activateLinkOnModClick(event: MouseEvent, view: EditorView, onLinkActivate?: (href: string) => void): boolean {
   if (!onLinkActivate || !(event.ctrlKey || event.metaKey)) return false;
   const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
   if (pos == null) return false;
   const href = linkNodeAt(view.state, pos)?.href;
   if (!href) return false;
   event.preventDefault();
   onLinkActivate(href);
   return true;
}
