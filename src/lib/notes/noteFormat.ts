/*
 * Markdown transforms for the Note editor's toolbars. Pure - the buffer stays literal markdown, so every edit
 * round-trips and stays readable in Source, export, and Reading. The CM6/React toolbars resolve an edit here
 * and dispatch it at real offsets; the grammar has no editor knowledge.
 *
 *  - Inline wrap toggles (bold/italic/strike) for the floating selection bar.
 *  - Line-prefix toggles (bullet/numbered list, quote) + heading cycle for the permanent toolbar.
 *  - A GFM table generator for the permanent toolbar's table picker.
 */

/** The markdown delimiter each inline format wraps a selection in (toggled off if already applied). */
export const FORMAT_MARKERS = { bold: '**', italic: '*', strikethrough: '~~' } as const;
export type FormatKind = keyof typeof FORMAT_MARKERS;

/** A resolved wrap toggle: the whole-body change range + text and the resulting selection. */
export interface WrapEdit {
   from: number;
   to: number;
   insert: string;
   /** The selection to keep over the now-(un)wrapped text after the edit. */
   selection: { anchor: number; head: number };
}

/**
 * Resolves toggling `marker` around `[from, to)` in `body`. Strips the markers if the selection is already
 * wrapped inside (markers within the range) or outside (markers hugging the range); otherwise adds them.
 * Returns `null` on an empty selection.
 */
export function computeWrapToggle(body: string, from: number, to: number, marker: string): WrapEdit | null {
   if (from >= to) return null;
   const selected = body.slice(from, to);

   // Already wrapped INSIDE the selection: strip the inner markers.
   if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
      const inner = selected.slice(marker.length, selected.length - marker.length);
      return { from, to, insert: inner, selection: { anchor: from, head: from + inner.length } };
   }

   // Already wrapped OUTSIDE the selection (markers hug the range): strip the surrounding markers.
   const before = body.slice(Math.max(0, from - marker.length), from);
   const after = body.slice(to, to + marker.length);
   if (before === marker && after === marker) {
      return {
         from: from - marker.length,
         to: to + marker.length,
         insert: selected,
         selection: { anchor: from - marker.length, head: to - marker.length },
      };
   }

   // Not wrapped: add the markers around the selection.
   return {
      from,
      to,
      insert: `${marker}${selected}${marker}`,
      selection: { anchor: from, head: to + marker.length * 2 },
   };
}

/** A resolved whole-line(s) edit: the byte range replaced, its text, and the caret to leave. */
export interface LineEdit {
   from: number;
   to: number;
   insert: string;
   /** Where to leave the caret after the edit (a collapsed selection). */
   selectAt: number;
}

/** Finds the [start, end) byte range of the block of full lines that `[from, to)` touches, in `body`. */
function lineBlockRange(body: string, from: number, to: number): { start: number; end: number } {
   const start = body.lastIndexOf('\n', from - 1) + 1; // char after the previous newline (or 0)
   let end = body.indexOf('\n', to);
   if (end === -1) end = body.length;
   // A collapsed caret sitting AT a line break belongs to the line it ends, not the next empty slice.
   if (to > from && to === end && body[to - 1] === '\n') end = to - 1;
   return { start, end };
}

/** The block-prefix each line-toggle applies. `numbered` renumbers; the others are a fixed literal. */
export type LinePrefixKind = 'bullet' | 'numbered' | 'quote';

/** Matches an existing bullet / numbered / quote prefix on a line (indent captured in group 1). */
const PREFIX_RE: Record<LinePrefixKind, RegExp> = {
   bullet: /^(\s*)([-*+] )/,
   numbered: /^(\s*)(\d+\. )/,
   quote: /^(\s*)(> )/,
};

/** Matches ANY block prefix (bullet / numbered / quote), so a toggle replaces rather than stacks. */
const ANY_PREFIX_RE = /^(\s*)(?:[-*+] |\d+\. |> )/;

/**
 * Toggles a line prefix (`- `, `1. `, `> `) across every line the selection spans. If EVERY non-blank line
 * already carries the prefix, they are all stripped; otherwise the prefix is added to each (numbered lists are
 * renumbered 1..n). Blank lines in a MIXED selection are left untouched - but a wholly-blank target (the caret
 * on an empty line) IS prefixed, so a user can start a list on a blank line and type into it.
 */
export function computePrefixToggle(body: string, from: number, to: number, kind: LinePrefixKind): LineEdit {
   const { start, end } = lineBlockRange(body, from, to);
   const block = body.slice(start, end);
   const lines = block.split('\n');
   const re = PREFIX_RE[kind];
   const nonBlank = lines.filter((l) => l.trim() !== '');
   const allPrefixed = nonBlank.length > 0 && nonBlank.every((l) => re.test(l));
   // A block with NO non-blank lines is the "start a list on an empty line" case - prefix the blank line(s).
   const onlyBlank = nonBlank.length === 0;

   let counter = 0;
   const next = lines.map((line) => {
      if (line.trim() === '' && !onlyBlank) return line; // leave blank lines alone in a mixed selection
      if (allPrefixed) return line.replace(re, '$1'); // strip: keep the leading indent, drop the marker
      const stripped = line.replace(ANY_PREFIX_RE, '$1'); // drop ANY existing prefix first, keep indent
      const indent = /^(\s*)/.exec(stripped)?.[1] ?? '';
      const bare = stripped.slice(indent.length);
      counter += 1;
      const marker = kind === 'bullet' ? '- ' : kind === 'numbered' ? `${counter}. ` : '> ';
      return `${indent}${marker}${bare}`;
   });

   const insert = next.join('\n');
   return { from: start, to: end, insert, selectAt: start + insert.length };
}

/** Heading markers the cycle steps through by level: 1 -> '# ', 2 -> '## ', 3 -> '### '; level 0/>3 -> plain. */
const HEADING_MARKER = ['', '# ', '## ', '### '];
const HEADING_RE = /^#{1,6} /;

/**
 * Cycles the current line's heading level (the line holding `caret`): plain -> H1 -> H2 -> H3 -> plain. Any
 * existing block prefix (list/quote) on the line is replaced by the heading marker. Operates on one line.
 */
export function computeHeadingCycle(body: string, caret: number): LineEdit {
   const start = body.lastIndexOf('\n', caret - 1) + 1;
   let end = body.indexOf('\n', caret);
   if (end === -1) end = body.length;
   const line = body.slice(start, end);
   const indent = /^(\s*)/.exec(line)?.[1] ?? '';
   const withoutIndent = line.slice(indent.length);

   const current = HEADING_RE.exec(withoutIndent);
   const level = current ? current[0].trim().length : 0; // count of '#', 0 when none
   const bare = current
      ? withoutIndent.replace(HEADING_RE, '')
      : withoutIndent.replace(/^([-*+] |\d+\. |> )/, ''); // strip a list/quote prefix so heading replaces it

   const nextLevel = level >= 3 ? 0 : level + 1;
   const insert = `${indent}${HEADING_MARKER[nextLevel]}${bare}`;
   return { from: start, to: end, insert, selectAt: start + insert.length };
}

// ==================
//  GFM table model - PURE parse/rebuild/structure/alignment for the live-editable table widget.
// ==================

/** A column's GFM alignment (from the separator row `:--` / `:-:` / `--:` / `---`). */
export type ColumnAlign = 'none' | 'left' | 'center' | 'right';

/** A parsed GFM table: `header` cells + `rows` of body cells (each row padded to the column count) + `aligns`. */
export interface TableModel {
   header: string[];
   rows: string[][];
   aligns: ColumnAlign[];
}

/** Splits one GFM table line into trimmed cells, tolerating optional leading/trailing pipes; unescapes `\|`. */
function splitRow(line: string): string[] {
   let s = line.trim();
   if (s.startsWith('|')) s = s.slice(1);
   if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
   // A single-column row with no inner pipe still yields one cell; split on UNescaped pipes, then unescape.
   return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** Reads a separator cell (`:---`, `:--:`, `---:`, `---`) into its alignment. */
function alignFromSeparator(cell: string): ColumnAlign {
   const s = cell.trim();
   const left = s.startsWith(':');
   const right = s.endsWith(':');
   if (left && right) return 'center';
   if (right) return 'right';
   if (left) return 'left';
   return 'none';
}

/** The separator cell markdown for an alignment (min 3 dashes, GFM-canonical). */
function separatorFor(align: ColumnAlign): string {
   switch (align) {
      case 'left': return ':---';
      case 'center': return ':--:';
      case 'right': return '---:';
      default: return '---';
   }
}

/** True if a line looks like a GFM separator row (only pipes, dashes, colons, spaces, with a dash). */
function isSeparatorLine(line: string): boolean {
   return /-/.test(line) && /^[\s|:-]+$/.test(line);
}

/**
 * Finds every GFM table block's byte range by LINE SCAN (parser-independent) - a `|` line immediately followed
 * by a separator row, then the contiguous `|` lines. Robust where the Lezer/remark parser mis-groups a table
 * (e.g. a `---` setext underline below the table setext-ifies the whole block, hiding the `Table` node), so the
 * Live editor can always isolate + grid the table regardless of what follows it. Byte-exact ranges.
 */
export function findTableBlocks(body: string): { from: number; to: number }[] {
   const lines = body.split('\n');
   const starts: number[] = [];
   let off = 0;
   for (const l of lines) { starts.push(off); off += l.length + 1; }

   const blocks: { from: number; to: number }[] = [];
   let i = 0;
   while (i < lines.length) {
      const next = i + 1 < lines.length ? lines[i + 1] : undefined;
      if (lines[i].includes('|') && next !== undefined && isSeparatorLine(next)) {
         const from = starts[i];
         let j = i;
         while (j < lines.length && lines[j].includes('|')) j++; // header + separator + contiguous `|` rows
         blocks.push({ from, to: starts[j - 1] + lines[j - 1].length });
         i = j;
      } else {
         i++;
      }
   }
   return blocks;
}

/**
 * Display-only pre-process for the READING renderer: inserts a blank line between a GFM table and an
 * immediately-following non-blank line - text, a `===`/`---` setext underline, a `---` rule, or a `- ` list -
 * so the following construct can never absorb or setext-ify the table. GFM else reads `table\ntext` as a
 * spurious single-cell row, and `table\ntext\n---` setext-ifies the WHOLE block into one heading. Pure - the
 * buffer is untouched (this only shapes what react-markdown sees), so Reading matches the Live table isolation.
 */
export function separateTablesFromText(body: string): string {
   const lines = body.split('\n');
   const out: string[] = [];
   let inTable = false;
   for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const next = i + 1 < lines.length ? lines[i + 1] : undefined;
      // A table starts at a `|` line immediately followed by a separator row.
      if (!inTable && line.includes('|') && next !== undefined && isSeparatorLine(next)) inTable = true;
      out.push(line);
      if (inTable && !(next !== undefined && next.includes('|'))) {
         inTable = false;
         // The table ends here; if the next line is non-blank text, inject a blank line to break the grid.
         if (next !== undefined && next.trim() !== '') out.push('');
      }
   }
   return out.join('\n');
}

/**
 * Parses a GFM table block (header line, separator line, zero+ body lines) into a {@link TableModel}, or
 * `null` if it isn't a well-formed table. Body rows are padded/truncated to the header's column count so the
 * matrix is rectangular; alignments come from the separator row.
 */
export function parseTable(md: string): TableModel | null {
   const lines = md.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
   if (lines.length < 2 || !isSeparatorLine(lines[1])) return null;
   const header = splitRow(lines[0]);
   const cols = header.length;
   if (cols === 0) return null;
   const aligns = padCells(splitRow(lines[1]), cols).map(alignFromSeparator);
   const rows = lines.slice(2).map((line) => padCells(splitRow(line), cols));
   return { header, rows, aligns };
}

/** Pads (or truncates) a cell array to exactly `cols` entries. */
function padCells(cells: string[], cols: number): string[] {
   const out = cells.slice(0, cols);
   while (out.length < cols) out.push('');
   return out;
}

/** Escapes a cell's content so a literal `|` or newline can't break the table row. */
function escapeCell(value: string): string {
   return value.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

/** Rebuilds canonical GFM markdown from a {@link TableModel} (header + separator from aligns + body rows). */
export function rebuildTable(model: TableModel): string {
   const cols = model.header.length;
   const line = (cells: string[]) => `| ${padCells(cells, cols).map(escapeCell).join(' | ')} |`;
   const separator = `| ${model.aligns.slice(0, cols).map(separatorFor).join(' | ')} |`;
   const alignsLine = model.aligns.length >= cols ? separator : `| ${Array.from({ length: cols }, (_, i) => separatorFor(model.aligns[i] ?? 'none')).join(' | ')} |`;
   return [line(model.header), alignsLine, ...model.rows.map(line)].join('\n');
}

/** Returns a copy of `model` with an empty body row inserted after index `at` (default: appended at the end). */
export function addTableRow(model: TableModel, at?: number): TableModel {
   const empty = Array.from({ length: model.header.length }, () => '');
   const rows = model.rows.slice();
   const idx = at === undefined ? rows.length : Math.max(0, Math.min(at + 1, rows.length));
   rows.splice(idx, 0, empty);
   return { ...model, rows };
}

/** Returns a copy of `model` with body row `at` removed (never removes the header; no-op if it's the last row). */
export function removeTableRow(model: TableModel, at: number): TableModel {
   if (model.rows.length <= 1 || at < 0 || at >= model.rows.length) return model;
   const rows = model.rows.slice();
   rows.splice(at, 1);
   return { ...model, rows };
}

/** Returns a copy of `model` with a new empty column inserted after index `at` (default: appended). */
export function addTableColumn(model: TableModel, at?: number): TableModel {
   const cols = model.header.length;
   const idx = at === undefined ? cols : Math.max(0, Math.min(at + 1, cols));
   const insert = <T,>(arr: T[], value: T) => { const a = arr.slice(); a.splice(idx, 0, value); return a; };
   return {
      header: insert(model.header, ''),
      rows: model.rows.map((r) => insert(padCells(r, cols), '')),
      aligns: insert(padCells2(model.aligns, cols, 'none'), 'none'),
   };
}

/** Returns a copy of `model` with column `at` removed (no-op if it's the last column). */
export function removeTableColumn(model: TableModel, at: number): TableModel {
   const cols = model.header.length;
   if (cols <= 1 || at < 0 || at >= cols) return model;
   const drop = <T,>(arr: T[]) => arr.filter((_, i) => i !== at);
   return {
      header: drop(model.header),
      rows: model.rows.map((r) => drop(padCells(r, cols))),
      aligns: drop(padCells2(model.aligns, cols, 'none')),
   };
}

/** Returns a copy of `model` with column `at`'s alignment set (out-of-range is a no-op). */
export function setTableColumnAlign(model: TableModel, at: number, align: ColumnAlign): TableModel {
   if (at < 0 || at >= model.header.length) return model;
   const aligns = padCells2(model.aligns, model.header.length, 'none');
   aligns[at] = align;
   return { ...model, aligns };
}

/** Returns a copy of `model` with body row `from` moved to destination index `to` (both body-row indices).
 *  No-op if either index is out of range or they're equal; the header never moves. */
export function moveTableRow(model: TableModel, from: number, to: number): TableModel {
   const n = model.rows.length;
   if (from < 0 || from >= n || to < 0 || to >= n || from === to) return model;
   const rows = model.rows.slice();
   const [moved] = rows.splice(from, 1);
   rows.splice(to, 0, moved);
   return { ...model, rows };
}

/** Returns a copy of `model` with column `from` moved to destination index `to` (header cell, every body
 *  cell, and the column alignment move together). No-op if either index is out of range or they're equal. */
export function moveTableColumn(model: TableModel, from: number, to: number): TableModel {
   const cols = model.header.length;
   if (from < 0 || from >= cols || to < 0 || to >= cols || from === to) return model;
   const move = <T,>(arr: T[]): T[] => {
      const a = arr.slice();
      const [m] = a.splice(from, 1);
      a.splice(to, 0, m);
      return a;
   };
   return {
      header: move(model.header),
      rows: model.rows.map((r) => move(padCells(r, cols))),
      aligns: move(padCells2(model.aligns, cols, 'none')),
   };
}

/** Sets header cell `col` or body cell `[row][col]` (row -1 = header), returning a copy. Out-of-range is a no-op. */
export function setTableCell(model: TableModel, row: number, col: number, value: string): TableModel {
   const cols = model.header.length;
   if (col < 0 || col >= cols) return model;
   if (row < 0) {
      const header = model.header.slice();
      header[col] = value;
      return { ...model, header };
   }
   if (row >= model.rows.length) return model;
   const rows = model.rows.map((r, i) => {
      if (i !== row) return r;
      const cells = padCells(r, cols);
      cells[col] = value;
      return cells;
   });
   return { ...model, rows };
}

/** Pads a typed array to `cols` with `fill` (align arrays; separate from the string `padCells`). */
function padCells2<T>(arr: T[], cols: number, fill: T): T[] {
   const out = arr.slice(0, cols);
   while (out.length < cols) out.push(fill);
   return out;
}

/**
 * Builds a valid GFM markdown table with `rows` body rows and `cols` columns (header row + separator + body).
 * Cells are empty placeholders. Not a toggle - it is inserted at the caret as its own block by the caller.
 */
export function buildTable(rows: number, cols: number): string {
   const c = Math.max(1, cols);
   const r = Math.max(1, rows);
   return rebuildTable({
      header: Array.from({ length: c }, (_, i) => `Column ${i + 1}`),
      rows: Array.from({ length: r }, () => Array.from({ length: c }, () => '')),
      aligns: Array.from({ length: c }, () => 'none'),
   });
}
