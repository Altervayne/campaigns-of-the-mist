// -- CodeMirror Imports --
import { EditorView } from '@codemirror/view';
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/*
 * The paper document palette drives every visible token. All colours are `currentColor`-translucent so they
 * inherit `--paper-foreground` - which means a custom theme's `--paper-*` reaches the editor for free, exactly
 * like `docMarkdownComponents`. Headings/emphasis carry weight/slant; punctuation stays quiet.
 */
export const paperHighlight = HighlightStyle.define([
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
export const paperTheme = EditorView.theme({
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
   // A coarse pointer has no hover, so the controls stay visible - a tablet can reach Change/Remove/aspect/resize.
   '@media (pointer: coarse), (hover: none)': {
      '.cm-note-cover-controls': { opacity: '1' },
   },
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
