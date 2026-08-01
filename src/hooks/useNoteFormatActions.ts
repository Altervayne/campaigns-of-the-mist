// -- React Imports --
import { useCallback } from 'react';

// -- Markdown Helpers --
import { computeWrapToggle, computePrefixToggle, computeHeadingCycle, buildTable, FORMAT_MARKERS } from '@/lib/notes/noteFormat';

// -- Type Imports --
import type { NoteEditorHandle } from '@/components/organisms/note/NoteEditor';
import type { LinePrefixKind, FormatKind } from '@/lib/notes/noteFormat';

/*
 * The Notes editor's markdown format/insert actions, shared by the desktop toolbar and the mobile editing bar.
 * Every action drives the CM6 doc through the editor handle at real byte offsets (the buffer stays literal
 * markdown); the grammar lives in `noteFormat`. Given a stable `getEditor` accessor, the callbacks stay stable.
 */
export function useNoteFormatActions(getEditor: () => NoteEditorHandle | null) {
   /** Applies a whole-line(s) edit computed from the current buffer + selection, at real offsets. */
   const applyLineEdit = useCallback(
      (compute: (body: string, from: number, to: number) => { from: number; to: number; insert: string; selectAt: number }) => {
         const editor = getEditor();
         if (!editor) return;
         const { from, to } = editor.getSelection();
         const edit = compute(editor.getValue(), from, to);
         editor.splice(edit.from, edit.to, edit.insert, edit.selectAt);
      },
      [getEditor],
   );

   const toggleList = useCallback((kind: LinePrefixKind) => applyLineEdit((body, from, to) => computePrefixToggle(body, from, to, kind)), [applyLineEdit]);
   const cycleHeading = useCallback(() => applyLineEdit((body, from) => computeHeadingCycle(body, from)), [applyLineEdit]);

   /** Toggles an inline wrap (bold/italic/strike) on the current selection. A no-op on a collapsed caret. */
   const toggleFormat = useCallback((kind: FormatKind) => {
      const editor = getEditor();
      if (!editor) return;
      const { from, to } = editor.getSelection();
      const edit = computeWrapToggle(editor.getValue(), from, to, FORMAT_MARKERS[kind]);
      if (!edit) return;
      editor.splice(edit.from, edit.to, edit.insert, edit.selection.head);
   }, [getEditor]);

   /** Inserts a block snippet at the guarded caret with blank-line spacing (used by table + horizontal rule). */
   const insertBlock = useCallback((snippet: string) => {
      const editor = getEditor();
      if (!editor) return;
      const from = editor.getInsertionPos();
      const body = editor.getValue();
      const before = body.slice(0, from);
      const after = body.slice(from);
      // Pad each side to a blank line unless it's already a paragraph boundary - the snippet reads as its own block.
      const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
      const trail = after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
      editor.splice(from, from, `${lead}${snippet}${trail}`, from + lead.length);
   }, [getEditor]);

   const insertTable = useCallback((rows: number, cols: number) => insertBlock(buildTable(rows, cols)), [insertBlock]);

   /**
    * Inserts a horizontal rule GUARANTEEING a blank line before + after (collapsing any adjacent blank so it
    * doesn't stack). `text` directly above `---` is a SETEXT heading underline (an invisible rule); the blank
    * line forces a real thematic break regardless of the caret's line having text.
    */
   const insertHorizontalRule = useCallback(() => {
      const editor = getEditor();
      if (!editor) return;
      const from = editor.getInsertionPos();
      const body = editor.getValue();
      const before = body.slice(0, from).replace(/[ \t\n]+$/, ''); // strip trailing whitespace/newlines
      const after = body.slice(from).replace(/^[ \t\n]+/, '');       // strip leading whitespace/newlines
      const lead = before === '' ? '' : '\n\n';
      const insert = `${lead}---\n\n`; // always a blank line after too, leaving a fresh line to type on
      editor.splice(before.length, body.length - after.length, insert, before.length + insert.length);
   }, [getEditor]);

   return { toggleFormat, cycleHeading, toggleList, insertBlock, insertTable, insertHorizontalRule };
}
