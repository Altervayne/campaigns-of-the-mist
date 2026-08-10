// -- React Imports --
import type { RefObject } from 'react';

// -- CodeMirror Imports --
import { Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';

// -- Live-Preview Imports --
import { tableRegionAt } from './tableRegions';
import { coverInsetLineCount, getNoteCover, setCoverEffect } from './coverGutter';
import { getNoteTitle, setTitleEffect } from './titleField';
import { buildTableActions, readTableModelAt } from './tableWidget';
import { readImageHintAt, setImageAlignAt, setImageWidthAt, removeImageAt } from './assetImageWidget';
import { editLinkLabel, removeCaretLink } from './linkEditToolbar';

// -- Type Imports --
import type { TableContextRequest } from './tableWidget';
import type { ImageRequest } from './assetImageWidget';
import type { NoteImageAlign } from '@/lib/notes/noteImageHint';
import type { NoteCover } from '@/lib/types/board';

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
   /** Selects the caret link's label so typing replaces it (re-focuses the editor). No-op with no caret link. */
   editLinkLabel: () => void;
   /** Unwraps the caret link to its plain label text. No-op with no caret link. */
   removeLink: () => void;
}

/** The nearest scrollable ancestor of `el` (the note DESK, since `.cm-scroller` is overflow:visible here). */
function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
   for (let node = el.parentElement; node; node = node.parentElement) {
      const overflowY = getComputedStyle(node).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
   }
   return null;
}

/**
 * Builds the {@link NoteEditorHandle} over a live view ref. Every method reads `viewRef.current` at call time,
 * so the handle stays valid across a `live`-flip view rebuild (the ref is repointed, the handle identity kept).
 */
export function createNoteEditorHandle(viewRef: RefObject<EditorView | null>): NoteEditorHandle {
   return {
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
      editLinkLabel: () => {
         const view = viewRef.current;
         if (view) editLinkLabel(view);
      },
      removeLink: () => {
         const view = viewRef.current;
         if (view) removeCaretLink(view);
      },
   };
}
