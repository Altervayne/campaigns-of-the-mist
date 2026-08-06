// -- CodeMirror Imports --
import { EditorView, WidgetType } from '@codemirror/view';

// -- Markdown Helpers --
import {
   parseTable,
   rebuildTable,
   addTableRow,
   removeTableRow,
   addTableColumn,
   removeTableColumn,
   setTableColumnAlign,
   moveTableRow,
   moveTableColumn,
   setTableCell,
} from '@/lib/notes/noteFormat';

// -- Type Imports --
import type { TableModel, ColumnAlign } from '@/lib/notes/noteFormat';

/*
 * The Live-editor TABLE widget: a GFM table block renders as a CLEAN editable grid - just the cells, nothing
 * else. It mirrors the image widget's bridge decision - IMPERATIVE DOM, no React root, sourced from a
 * StateField (block + atomic). The markdown table in the buffer is the source of truth: every cell/structure/
 * alignment edit rebuilds the block via the PURE `noteFormat` table helpers and dispatches it at the block's
 * LIVE offsets (found via `posAtDOM`), so undo stays granular and the buffer stays literal markdown. Reading
 * keeps its react-markdown `<table>` - same data, two render paths.
 *
 * All structural/alignment actions live in a RIGHT-CLICK context menu (no hover-button clutter). Right-click
 * on a cell fires the injected controller with the cell's (row, col) + screen position + a bag of pre-bound
 * actions (each closes over this widget's `view` + live offsets); the React host renders the actual menu at
 * that point (see `NoteView`). Cell text is edited inline; Tab/Enter navigate.
 */

const CSS_ALIGN: Record<ColumnAlign, string> = { none: 'left', left: 'left', center: 'center', right: 'right' };

/** The bag of table actions a menu invokes; each is pre-bound to a target cell (right-clicked on desktop,
 *  the caret's cell on mobile). Move ops apply to the target's row/column; the caret follows the moved cell. */
export interface TableActions {
   insertRowAbove: () => void;
   insertRowBelow: () => void;
   insertColumnLeft: () => void;
   insertColumnRight: () => void;
   moveRowUp: () => void;
   moveRowDown: () => void;
   moveColumnLeft: () => void;
   moveColumnRight: () => void;
   deleteRow: () => void;
   deleteColumn: () => void;
   alignColumn: (align: ColumnAlign) => void;
   deleteTable: () => void;
   /** Whether delete-row / delete-column are allowed (false when it's the last row/column). */
   canDeleteRow: boolean;
   canDeleteColumn: boolean;
   /** Whether each move is allowed (false at the corresponding edge, or on the header row for row moves). */
   canMoveRowUp: boolean;
   canMoveRowDown: boolean;
   canMoveColumnLeft: boolean;
   canMoveColumnRight: boolean;
}

/** A menu/sheet request for a target cell. Desktop uses `x`/`y`/`actions` (one-shot menu at the click point).
 *  Mobile drives a STICKY sheet: it keeps `tablePos` (the table block's stable `from` offset) and re-resolves
 *  actions for a walking target via `resolveFor`, and reads live dims via `getDims` to clamp after a delete. */
export interface TableContextRequest {
   x: number;
   y: number;
   actions: TableActions;
   /** The target cell (header row = -1) the request opened on. */
   row: number;
   col: number;
   /** The table block's stable `from` offset; anchors every re-resolved op (never goes stale on edits in place). */
   tablePos: number;
   /** Resolves a fresh action bag for an arbitrary cell of the same table (the sheet's walking target). */
   resolveFor: (row: number, col: number) => TableActions;
   /** The table's current dimensions, or null if the block is gone (deleted table). */
   getDims: () => { bodyRows: number; cols: number } | null;
}

/** Injected once from the React host: opens the context menu/sheet + supplies i18n labels for the edge "+" bars. */
export interface TableController {
   openContextMenu: (request: TableContextRequest) => void;
   /** Reports the caret's table cell (or null when it leaves any cell) so a mobile chip can arm/disarm. Desktop
    *  omits it. */
   onCaretCell?: (ctx: { tablePos: number; row: number; col: number } | null) => void;
   labels: { addRow: string; addColumn: string };
}

/**
 * The contiguous table block `[from, to)` around a doc offset (walks table-ish lines both directions). Standalone
 * so position-resolved ops can find the block from a stable anchor, not the widget's DOM.
 */
export function tableBlockRangeAt(view: EditorView, pos: number): { from: number; to: number } {
   const doc = view.state.doc;
   const startLine = doc.lineAt(pos);
   let from = startLine.from;
   let to = startLine.to;
   let n = startLine.number;
   while (n <= doc.lines) {
      const line = doc.line(n);
      if (line.text.trim() === '' || !line.text.includes('|')) break;
      to = line.to;
      n++;
   }
   let m = startLine.number - 1;
   while (m >= 1) {
      const line = doc.line(m);
      if (line.text.trim() === '' || !line.text.includes('|')) break;
      from = line.from;
      m--;
   }
   return { from, to };
}

/** Parses the table model at the block anchored at `tablePos`. */
export function readTableModelAt(view: EditorView, tablePos: number): TableModel | null {
   const range = tableBlockRangeAt(view, tablePos);
   return parseTable(view.state.doc.sliceString(range.from, range.to));
}

/** Rebuilds the table from `next` and dispatches it at the block anchored at `tablePos` (no-op if unchanged). */
export function commitTableAt(view: EditorView, tablePos: number, next: TableModel): void {
   const range = tableBlockRangeAt(view, tablePos);
   const markdown = rebuildTable(next);
   if (markdown === view.state.doc.sliceString(range.from, range.to)) return;
   view.dispatch({ changes: { from: range.from, to: range.to, insert: markdown } });
}

/** Removes the whole table block anchored at `tablePos`. */
export function deleteTableAt(view: EditorView, tablePos: number): void {
   const range = tableBlockRangeAt(view, tablePos);
   view.dispatch({ changes: { from: range.from, to: range.to, insert: '' } });
}

/**
 * Builds the action bag for a target cell of the table anchored at `tablePos`. Every op re-reads the LIVE model
 * at that anchor and commits back to it, so a sticky sheet re-resolving after each edit always targets the right
 * table in a multi-table note. Header row = -1.
 */
export function buildTableActions(view: EditorView, tablePos: number, row: number, col: number): TableActions {
   const model = readTableModelAt(view, tablePos) ?? { header: [], rows: [], aligns: [] };
   const run = (transform: (m: TableModel) => TableModel) => () => {
      const live = readTableModelAt(view, tablePos);
      if (live) commitTableAt(view, tablePos, transform(live));
   };
   // Body-row index for row ops: the header (row -1) shares the topmost body row's neighbourhood.
   const bodyRow = Math.max(0, row);
   return {
      insertRowAbove: run((m) => addTableRow(m, bodyRow - 1)),
      insertRowBelow: run((m) => addTableRow(m, row < 0 ? -1 : row)),
      insertColumnLeft: run((m) => addTableColumn(m, col - 1)),
      insertColumnRight: run((m) => addTableColumn(m, col)),
      moveRowUp: run((m) => moveTableRow(m, row, row - 1)),
      moveRowDown: run((m) => moveTableRow(m, row, row + 1)),
      moveColumnLeft: run((m) => moveTableColumn(m, col, col - 1)),
      moveColumnRight: run((m) => moveTableColumn(m, col, col + 1)),
      deleteRow: run((m) => removeTableRow(m, bodyRow)),
      deleteColumn: run((m) => removeTableColumn(m, col)),
      alignColumn: (align) => run((m) => setTableColumnAlign(m, col, align))(),
      deleteTable: () => deleteTableAt(view, tablePos),
      canDeleteRow: row >= 0 && model.rows.length > 1,
      canDeleteColumn: model.header.length > 1,
      // Row moves apply to body rows only (never the header); column moves apply to any target cell.
      canMoveRowUp: row >= 1,
      canMoveRowDown: row >= 0 && row < model.rows.length - 1,
      canMoveColumnLeft: col >= 1,
      canMoveColumnRight: col < model.header.length - 1,
   };
}

export class NoteTableWidget extends WidgetType {
   /** The raw markdown of this table block (the widget's identity) + its block offsets at build time. */
   readonly markdown: string;
   readonly from: number;
   readonly to: number;
   private readonly controller: TableController;

   constructor(markdown: string, from: number, to: number, controller: TableController) {
      super();
      this.markdown = markdown;
      this.from = from;
      this.to = to;
      this.controller = controller;
   }

   /** Shorthand for the injected edge-bar labels. */
   private get labels() {
      return this.controller.labels;
   }

   // Rebuild the DOM only when the table markdown changed (offsets shift freely; the DOM tracks live via posAtDOM).
   eq(other: NoteTableWidget): boolean {
      return other.markdown === this.markdown;
   }

   // A definite estimated height keeps CM6's line-map honest before the grid lays out (like the image widget).
   get estimatedHeight(): number {
      const rows = this.markdown.split('\n').filter((l) => l.trim() !== '').length; // header + separator + body
      return Math.max(60, (rows - 1) * 34 + 16);
   }

   toDOM(view: EditorView): HTMLElement {
      const wrap = document.createElement('div');
      wrap.className = 'cm-note-table';
      wrap.dataset.noteTable = 'true';
      wrap.contentEditable = 'false'; // the wrapper isn't editable; individual cells opt in

      const model = parseTable(this.markdown);
      if (!model) {
         // Not a well-formed table (shouldn't happen - the field only wraps Table nodes) - show the raw text.
         wrap.textContent = this.markdown;
         return wrap;
      }
      this.renderGrid(view, wrap, model);
      // The grid's real height isn't known until the browser lays out the <table>; force CM6 to re-read it into
      // its height-map so lines BELOW the table map to the right Y (else clicks below land a line high).
      requestAnimationFrame(() => view.requestMeasure());
      return wrap;
   }

   /**
    * Builds the clean editable `<table>` (cells only, alignment applied) plus two subtle-until-hover EDGE BARS
    * that add a row (bottom, full table width) / a column (right, full table height). Insert-at-position,
    * delete, and align stay in the right-click menu.
    */
   private renderGrid(view: EditorView, wrap: HTMLElement, model: TableModel): void {
      wrap.replaceChildren();
      // A too-wide table (many columns) scrolls sideways INSIDE its own container instead of clipping out of the
      // paper column. The scroller wraps only the `<table>`; the edge "+" bars stay siblings on `.cm-note-table`
      // so they keep positioning against the table wrapper, not the scroll viewport.
      const scroller = document.createElement('div');
      scroller.className = 'cm-note-table-scroll';
      const table = document.createElement('table');
      table.className = 'cm-note-table-grid';

      const thead = document.createElement('thead');
      const headTr = document.createElement('tr');
      model.header.forEach((cell, col) => {
         const th = document.createElement('th');
         th.style.textAlign = CSS_ALIGN[model.aligns[col] ?? 'none'];
         th.appendChild(this.buildCell(view, cell, -1, col, model));
         headTr.appendChild(th);
      });
      thead.appendChild(headTr);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      model.rows.forEach((row, r) => {
         const tr = document.createElement('tr');
         row.forEach((cell, col) => {
            const td = document.createElement('td');
            td.style.textAlign = CSS_ALIGN[model.aligns[col] ?? 'none'];
            td.appendChild(this.buildCell(view, cell, r, col, model));
            tr.appendChild(td);
         });
         tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      scroller.appendChild(table);
      wrap.appendChild(scroller);

      // Full-edge add affordances: bottom bar (add a row), right bar (add a column). Subtle until hover.
      wrap.appendChild(this.buildEdgeBar(view, 'row'));
      wrap.appendChild(this.buildEdgeBar(view, 'col'));
   }

   /** A full-edge "+" bar that adds a row (bottom, table-width) or a column (right, table-height) on click. */
   private buildEdgeBar(view: EditorView, kind: 'row' | 'col'): HTMLElement {
      const bar = document.createElement('button');
      bar.type = 'button';
      bar.className = kind === 'row' ? 'cm-note-table-add-row-bar' : 'cm-note-table-add-col-bar';
      bar.setAttribute('aria-label', kind === 'row' ? this.labels.addRow : this.labels.addColumn);
      bar.title = kind === 'row' ? this.labels.addRow : this.labels.addColumn;
      const plus = document.createElement('span');
      plus.className = 'cm-note-table-add-plus';
      plus.textContent = '+';
      bar.appendChild(plus);
      bar.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
      bar.onclick = (e) => {
         e.preventDefault();
         e.stopPropagation();
         const live = this.liveModel(view);
         if (live) this.commit(view, kind === 'row' ? addTableRow(live) : addTableColumn(live));
      };
      return bar;
   }

   /** An editable cell (contentEditable span). Commits on blur; Tab/Enter navigate; right-click opens the menu. */
   private buildCell(view: EditorView, value: string, row: number, col: number, model: TableModel): HTMLElement {
      const cell = document.createElement('span');
      cell.className = 'cm-note-table-cell';
      cell.contentEditable = 'true';
      // Render the cell's markdown into DOM, turning `<br>` tokens into real line breaks (GFM's in-cell break).
      renderCellValue(cell, value);
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      // Stop CM6 from treating clicks/keys in the cell as editor input; the widget owns them.
      cell.onmousedown = (e) => e.stopPropagation();
      // Report the caret's cell so a mobile chip can arm; clear on blur unless focus moved to another cell
      // (deferred + guarded so a cell-to-cell tap doesn't flicker through null).
      cell.onfocus = () => {
         const range = this.liveRange(view);
         this.controller.onCaretCell?.(range ? { tablePos: range.from, row, col } : null);
      };
      cell.onblur = () => {
         this.commitCell(view, cell, row, col);
         queueMicrotask(() => {
            if (!document.activeElement?.classList.contains('cm-note-table-cell')) this.controller.onCaretCell?.(null);
         });
      };
      cell.onkeydown = (e) => this.onCellKey(view, e, cell, row, col, model);
      cell.oncontextmenu = (e) => this.onContextMenu(view, e, row, col);
      return cell;
   }

   /** Right-click on a cell: commit any pending edit, then open the context menu bound to this table + cell. */
   private onContextMenu(view: EditorView, event: MouseEvent, row: number, col: number): void {
      event.preventDefault();
      event.stopPropagation();
      const range = this.liveRange(view);
      if (!range) return;
      const tablePos = range.from;
      this.controller.openContextMenu({
         x: event.clientX,
         y: event.clientY,
         row,
         col,
         tablePos,
         actions: buildTableActions(view, tablePos, row, col),
         resolveFor: (r, c) => buildTableActions(view, tablePos, r, c),
         getDims: () => {
            const m = readTableModelAt(view, tablePos);
            return m ? { bodyRows: m.rows.length, cols: m.header.length } : null;
         },
      });
   }

   /** Commits a cell's text back into the markdown block (no-op if unchanged). */
   private commitCell(view: EditorView, cell: HTMLElement, row: number, col: number): void {
      const model = this.liveModel(view);
      if (!model) return;
      // Serialize the cell DOM back to markdown: real line breaks -> `<br>` tokens (a stray `\n` would shatter
      // the row, so it also maps to `<br>`).
      const value = serializeCellValue(cell);
      const current = row < 0 ? model.header[col] : model.rows[row]?.[col];
      if (value === current) return;
      this.commit(view, setTableCell(model, row, col, value));
   }

   /** Inserts a line break at the caret inside a cell (renders now; committed as `<br>` on blur/nav). */
   private insertLineBreak(cell: HTMLElement): void {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) { cell.appendChild(document.createElement('br')); return; }
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const br = document.createElement('br');
      range.insertNode(br);
      // A trailing <br> needs a following node for the caret to land after it; add a zero-width guard once.
      if (!br.nextSibling) br.after(document.createTextNode('​'));
      range.setStartAfter(br);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
   }

   /**
    * Cell keymap:
    *  - Tab / Shift-Tab: next / previous cell.
    *  - Enter (no modifier): a line break INSIDE the cell (stored as `<br>` on commit).
    *  - Shift+Enter: new row (create/move to the next row; appends at the last row, Obsidian-style).
    *  - Shift+Ctrl/Cmd+Enter: new column.
    *  - Arrow keys (Excel/Obsidian model): Up/Down cross to the cell above/below (header <-> body included);
    *    Left/Right cross to the previous/next cell only at the caret's start/end edge (else the caret moves
    *    within the text). Up from the header exits above the table; Down in the LAST body row exits below;
    *    both edges create a fresh line if the table sits at the document edge. In a multi-line cell (`<br>`),
    *    Up/Down first move between the cell's own lines and only cross from its top/bottom line.
    *  - Escape: exit onto a usable line below the table (created if needed) - never trapped.
    */
   private onCellKey(view: EditorView, event: KeyboardEvent, cell: HTMLElement, row: number, col: number, model: TableModel): void {
      const cols = model.header.length;
      const bodyRows = model.rows.length;
      const visualRow = row + 1; // header (-1) -> 0, body r -> r+1
      const total = (bodyRows + 1) * cols; // cell count including the header row

      // Arrow navigation (no modifiers - Ctrl/Alt keep their native word/line semantics inside the cell).
      if ((event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.ctrlKey && !event.metaKey && !event.altKey) {
         if (event.key === 'ArrowUp') {
            if (!this.caretAtEdgeLine(cell, 'first')) return; // multi-line cell: move up within it first
            event.preventDefault();
            this.commitCell(view, cell, row, col);
            if (row < 0) this.exitAbove(view); // header: escape above the table
            else this.focusCell(view, row - 1, col); // body -> row above (row 0 -> header)
            return;
         }
         if (event.key === 'ArrowDown') {
            if (!this.caretAtEdgeLine(cell, 'last')) return; // multi-line cell: move down within it first
            event.preventDefault();
            this.commitCell(view, cell, row, col);
            if (row === bodyRows - 1) this.exitBelow(view); // last body row (or header-only): escape below
            else this.focusCell(view, row < 0 ? 0 : row + 1, col);
            return;
         }
         if (event.key === 'ArrowRight') {
            if (!this.caretAtTextEnd(cell)) return; // not at the end: move the caret within the text
            if (visualRow * cols + col + 1 >= total) return; // last cell: stop
            event.preventDefault();
            this.commitCell(view, cell, row, col);
            const next = visualRow * cols + col + 1;
            this.focusCell(view, Math.floor(next / cols) - 1, next % cols, true); // caret at the start
            return;
         }
         // ArrowLeft
         if (!this.caretAtTextStart(cell)) return; // not at the start: move the caret within the text
         if (visualRow * cols + col - 1 < 0) return; // first cell: stop
         event.preventDefault();
         this.commitCell(view, cell, row, col);
         const prev = visualRow * cols + col - 1;
         this.focusCell(view, Math.floor(prev / cols) - 1, prev % cols); // caret at the end
         return;
      }

      if (event.key === 'Tab') {
         event.preventDefault();
         this.commitCell(view, cell, row, col);
         const flat = (row < 0 ? 0 : row + 1) * cols + col + (event.shiftKey ? -1 : 1);
         const total = (bodyRows + 1) * cols;
         const clamped = Math.max(0, Math.min(flat, total - 1));
         const targetRow = Math.floor(clamped / cols) - 1; // -1 == header
         const targetCol = clamped % cols;
         this.focusCell(view, targetRow, targetCol);
         return;
      }
      if (event.key === 'Enter') {
         event.preventDefault();
         if (event.shiftKey && (event.ctrlKey || event.metaKey)) {
            // Shift+Ctrl+Enter: add a column after this one, focus the new header cell.
            this.commitCell(view, cell, row, col);
            this.commit(view, addTableColumn(this.liveModel(view) ?? model, col));
            this.focusCell(view, row, col + 1);
         } else if (event.shiftKey) {
            // Shift+Enter: new row (append at the last body row, else move to the next row's same column).
            this.commitCell(view, cell, row, col);
            if (row >= 0 && row === bodyRows - 1) {
               this.commit(view, addTableRow(this.liveModel(view) ?? model));
               this.focusCell(view, bodyRows, col);
            } else {
               this.focusCell(view, row < 0 ? 0 : row + 1, col);
            }
         } else {
            // Enter: a line break inside the cell (rendered now; serialized as `<br>` on the next commit).
            this.insertLineBreak(cell);
         }
         return;
      }
      if (event.key === 'Escape') {
         event.preventDefault();
         this.commitCell(view, cell, row, col);
         this.exitBelow(view);
      }
   }

   /**
    * Moves the CM6 caret onto a usable line immediately BELOW the table block, creating a fresh trailing line
    * first if the table is the last block (so from inside a table there is ALWAYS a reachable caret below it).
    * Dispatch-then-select is deferred a frame so any pending cell commit's rebuild settles first.
    */
   private exitBelow(view: EditorView): void {
      requestAnimationFrame(() => {
         const range = this.liveRange(view);
         if (!range) return;
         const doc = view.state.doc;
         if (range.to >= doc.length) {
            // Table is the last block: append a BLANK line + a fresh line, land the caret there - so typed text
            // becomes its OWN paragraph (a single `\n` lets GFM absorb the following text into the table).
            view.dispatch({ changes: { from: doc.length, insert: '\n\n' }, selection: { anchor: doc.length + 2 } });
         } else {
            // There is a line after the table: land the caret at the start of the first line past it.
            const nextLine = doc.lineAt(range.to + 1);
            view.dispatch({ selection: { anchor: nextLine.from } });
         }
         view.focus();
      });
   }

   /**
    * Moves the CM6 caret onto a usable line immediately ABOVE the table block (mirror of `exitBelow`), creating a
    * fresh leading line first if the table is the first block - so ArrowUp out of the header is never trapped.
    */
   private exitAbove(view: EditorView): void {
      requestAnimationFrame(() => {
         const range = this.liveRange(view);
         if (!range) return;
         const doc = view.state.doc;
         if (range.from <= 0) {
            // Table is the first block: prepend a fresh line + a BLANK line, land the caret at the top - so typed
            // text becomes its OWN paragraph above the table (the blank keeps GFM from absorbing it).
            view.dispatch({ changes: { from: 0, insert: '\n\n' }, selection: { anchor: 0 } });
         } else {
            // There is a line before the table: land the caret at the end of the last line before it.
            const prevLine = doc.lineAt(range.from - 1);
            view.dispatch({ selection: { anchor: prevLine.to } });
         }
         view.focus();
      });
   }

   /** True when the collapsed caret sits at the very START of the cell's text (no text before it). */
   private caretAtTextStart(cell: HTMLElement): boolean {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
      const caret = sel.getRangeAt(0);
      if (!cell.contains(caret.startContainer)) return false;
      const r = document.createRange();
      r.selectNodeContents(cell);
      r.setEnd(caret.startContainer, caret.startOffset);
      return r.toString().length === 0;
   }

   /** True when the collapsed caret sits at the very END of the cell's text (no text after it). */
   private caretAtTextEnd(cell: HTMLElement): boolean {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
      const caret = sel.getRangeAt(0);
      if (!cell.contains(caret.startContainer)) return false;
      const r = document.createRange();
      r.selectNodeContents(cell);
      r.setStart(caret.startContainer, caret.startOffset);
      return r.toString().length === 0;
   }

   /**
    * For a multi-line cell (`<br>` line breaks), reports whether the caret is on the cell's FIRST or LAST visual
    * line - so Up/Down move between the cell's own lines before crossing the table edge. A single-line cell (no
    * `<br>`) is always at both edges. Detected by whether any `<br>` lies before / after the caret.
    */
   private caretAtEdgeLine(cell: HTMLElement, which: 'first' | 'last'): boolean {
      const breaks = cell.querySelectorAll('br');
      if (breaks.length === 0) return true;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !cell.contains(sel.getRangeAt(0).startContainer)) return true;
      const caret = sel.getRangeAt(0);
      const span = document.createRange();
      if (which === 'first') {
         span.setStart(cell, 0);
         span.setEnd(caret.startContainer, caret.startOffset);
      } else {
         span.setStart(caret.startContainer, caret.startOffset);
         span.setEnd(cell, cell.childNodes.length);
      }
      return ![...breaks].some((br) => span.intersectsNode(br));
   }

   /** Focuses a cell by (row, col) after the DOM has been rebuilt from a dispatch. -1 row == header. The caret
    * lands at the END of the cell's text by default, or at the START when `caretAtStart` is set (right-cross). */
   private focusCell(view: EditorView, row: number, col: number, caretAtStart = false): void {
      // The dispatch rebuilds the widget async; wait a frame, then find the cell in the live DOM.
      requestAnimationFrame(() => {
         const wrap = this.findWrap(view);
         const cell = wrap?.querySelector<HTMLElement>(`.cm-note-table-cell[data-row="${row}"][data-col="${col}"]`);
         if (cell) {
            cell.focus();
            const range = document.createRange();
            range.selectNodeContents(cell);
            range.collapse(caretAtStart); // true -> start, false -> end
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
         }
      });
   }

   // ---- Buffer sync ----

   /** Parses the CURRENT table markdown from the live buffer at this block's offset (post-any-shift). */
   private liveModel(view: EditorView): TableModel | null {
      const range = this.liveRange(view);
      if (!range) return null;
      return parseTable(view.state.doc.sliceString(range.from, range.to));
   }

   /** This block's live `[from, to)` in the current doc, found from the widget's DOM position. */
   private liveRange(view: EditorView): { from: number; to: number } | null {
      const wrap = this.findWrap(view);
      if (!wrap) {
         // Fall back to the build-time offsets if the DOM isn't found (rare; e.g. off-screen).
         return { from: Math.min(this.from, view.state.doc.length), to: Math.min(this.to, view.state.doc.length) };
      }
      return tableBlockRangeAt(view, view.posAtDOM(wrap));
   }

   /** The live wrapper DOM whose block markdown equals this widget's (robust across multi-table notes). */
   private findWrap(view: EditorView): HTMLElement | null {
      const wraps = view.dom.querySelectorAll<HTMLElement>('[data-note-table]');
      let fallback: HTMLElement | null = null;
      for (const w of wraps) {
         const pos = view.posAtDOM(w);
         if (pos < 0) continue;
         fallback ??= w;
         const range = tableBlockRangeAt(view, pos);
         if (view.state.doc.sliceString(range.from, range.to) === this.markdown) return w;
      }
      return fallback;
   }

   /** Rebuilds the table markdown from `next` and dispatches it at the block's live offsets. */
   private commit(view: EditorView, next: TableModel): void {
      const range = this.liveRange(view);
      if (!range) return;
      const markdown = rebuildTable(next);
      if (markdown === view.state.doc.sliceString(range.from, range.to)) return;
      view.dispatch({ changes: { from: range.from, to: range.to, insert: markdown } });
   }

   // The widget owns all events inside it; the caret never enters (atomic). Let focus/keys through to cells.
   ignoreEvent(): boolean {
      return true;
   }
}

/** A `<br>` token in cell markdown, split-safe (case-insensitive, optional slash/space). */
const CELL_BR_RE = /<br\s*\/?>/gi;
/** The zero-width guard placed after a trailing `<br>` so the caret can land past it; stripped on serialize. */
const ZWSP = '​';

/**
 * Renders a cell's markdown into a contentEditable span, turning `<br>` tokens into real line breaks. Other
 * markdown (bold/etc.) stays literal in the raw cell text - the grid edits the source, like Source mode.
 */
function renderCellValue(cell: HTMLElement, value: string): void {
   cell.replaceChildren();
   const parts = value.split(CELL_BR_RE);
   parts.forEach((part, i) => {
      if (i > 0) cell.appendChild(document.createElement('br'));
      if (part) cell.appendChild(document.createTextNode(part));
   });
}

/**
 * Serializes a contentEditable cell back to markdown: `<br>` / `<div>` / `\n` boundaries become `<br>` tokens
 * (a stray newline would shatter the table row), the zero-width caret guard is stripped. `|` escaping is left
 * to `noteFormat`'s `setTableCell` -> `rebuildTable`.
 */
function serializeCellValue(cell: HTMLElement): string {
   let out = '';
   const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
         out += (node.textContent ?? '').replace(new RegExp(ZWSP, 'g'), '');
         return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName;
      if (tag === 'BR') { out += '<br>'; return; }
      // A contentEditable may wrap lines in <div>/<p> - treat each such block boundary as a break.
      if ((tag === 'DIV' || tag === 'P') && out !== '' && !out.endsWith('<br>')) out += '<br>';
      el.childNodes.forEach(visit);
   };
   cell.childNodes.forEach(visit);
   // Collapse any literal newlines that slipped in (paste), and trim edge breaks.
   return out.replace(/\n/g, '<br>').replace(/^(?:<br>)+|(?:<br>)+$/g, '').trim();
}
