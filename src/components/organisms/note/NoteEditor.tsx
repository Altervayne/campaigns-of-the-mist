// -- React Imports --
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// -- CodeMirror Imports --
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, undoDepth, redoDepth } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { Strikethrough, Table } from '@lezer/markdown';
import { syntaxHighlighting } from '@codemirror/language';

// -- Live-Preview Imports --
import { paperHighlight, paperTheme } from './live/noteEditorTheme';
import { liveInlineDecorations } from './live/liveDecorations';
import { imageWidgetField, imageControllerFacet } from './live/imageWidgetField';
import { tableWidgetField } from './live/tableWidgetField';
import { coverStateExtension, coverGutterVisual, initialCover, getNoteCover } from './live/coverGutter';
import { titleStateExtension, initialTitle, getNoteTitle } from './live/titleField';
import { listIndentKeymap } from './live/listKeymap';
import { formatToolbar } from './live/formatToolbar';
import { linkEditToolbar } from './live/linkEditToolbar';
import { createNoteEditorHandle } from './live/noteEditorHandle';
import { useStableNoteControllers } from './live/useStableNoteControllers';
import { selectImageOnClick, activateLinkOnModClick } from './live/noteEditorClicks';

// -- Type Imports --
import type { NoteEditorHandle } from './live/noteEditorHandle';
import type { CoverController } from './live/coverGutter';
import type { FormatController } from './live/formatToolbar';
import type { LinkEditController } from './live/linkEditToolbar';
import type { TableController } from './live/tableWidget';
import type { ImageController } from './live/assetImageWidget';
import type { NoteCover } from '@/lib/types/board';

// Re-export so callers keep importing the handle type from the NoteEditor entry point.
export type { NoteEditorHandle } from './live/noteEditorHandle';

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
   // Each controller wrapped in a STABLE delegate (identity fixed) so the CM6 extensions - built once per view -
   // always call the CURRENT callbacks; a re-render swaps closures without rebuilding the view.
   const { stableController, stableFormatController, stableLinkEditController, stableTableController, stableImageController } =
      useStableNoteControllers({ coverController, formatController, linkEditController, tableController, imageController });

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
               // CM draws the caret + selection (the paper theme already styles `.cm-cursor` /
               // `.cm-selectionBackground`). Without it the native caret is used, which sits half a line high
               // over the empty-doc placeholder (an `inline-block` widget) until the first keypress.
               drawSelection(),
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

   useImperativeHandle(ref, () => createNoteEditorHandle(viewRef), []);

   return <div ref={hostRef} className="note-editor text-base" />;
});
