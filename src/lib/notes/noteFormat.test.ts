import { describe, it, expect } from 'vitest';

import {
   computeWrapToggle,
   computePrefixToggle,
   computeHeadingCycle,
   buildTable,
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
   separateTablesFromText,
   findTableBlocks,
   FORMAT_MARKERS,
} from './noteFormat';

/*
 * The format bar's wrap toggle is a pure markdown transform (the buffer stays literal markdown). These pin the
 * three cases the editor relies on: add markers, strip inner markers, strip outer markers - so a round-trip
 * (wrap then wrap again) returns the original text.
 */

const bold = FORMAT_MARKERS.bold;

/** Applies a resolved edit to a body string, for round-trip assertions. */
function apply(body: string, edit: { from: number; to: number; insert: string } | null): string {
   if (!edit) return body;
   return body.slice(0, edit.from) + edit.insert + body.slice(edit.to);
}

describe('computeWrapToggle', () => {
   it('adds markers around an unwrapped selection', () => {
      const body = 'the Baron rules';
      const edit = computeWrapToggle(body, 4, 9, bold); // "Baron"
      expect(apply(body, edit)).toBe('the **Baron** rules');
      expect(edit?.selection).toEqual({ anchor: 4, head: 13 });
   });

   it('strips markers when the selection includes them (inner)', () => {
      const body = 'the **Baron** rules';
      const edit = computeWrapToggle(body, 4, 13, bold); // "**Baron**"
      expect(apply(body, edit)).toBe('the Baron rules');
   });

   it('strips markers when they hug the selection (outer)', () => {
      const body = 'the **Baron** rules';
      const edit = computeWrapToggle(body, 6, 11, bold); // "Baron" between the markers
      expect(apply(body, edit)).toBe('the Baron rules');
   });

   it('round-trips: wrap then wrap again returns the original', () => {
      const body = 'a whispered aside';
      const wrapped = computeWrapToggle(body, 2, 11, FORMAT_MARKERS.italic); // "whispered"
      const once = apply(body, wrapped);
      expect(once).toBe('a *whispered* aside');
      // Re-toggle over the same text (now the markers hug it): outer-strip returns the original.
      const unwrapped = computeWrapToggle(once, 3, 12, FORMAT_MARKERS.italic);
      expect(apply(once, unwrapped)).toBe(body);
   });

   it('is a no-op on an empty selection', () => {
      expect(computeWrapToggle('text', 2, 2, bold)).toBeNull();
   });

   it('handles strikethrough (a two-char marker)', () => {
      const body = 'cut this';
      const edit = computeWrapToggle(body, 4, 8, FORMAT_MARKERS.strikethrough); // "this"
      expect(apply(body, edit)).toBe('cut ~~this~~');
   });
});

/** Applies a LineEdit's whole-block replacement to a body, for assertions. */
function applyLine(body: string, edit: { from: number; to: number; insert: string }): string {
   return body.slice(0, edit.from) + edit.insert + body.slice(edit.to);
}

describe('computePrefixToggle', () => {
   it('adds a bullet prefix to a single line', () => {
      const body = 'one';
      expect(applyLine(body, computePrefixToggle(body, 1, 1, 'bullet'))).toBe('- one');
   });

   it('strips the bullet when every spanned line already has one', () => {
      const body = '- one\n- two';
      expect(applyLine(body, computePrefixToggle(body, 0, body.length, 'bullet'))).toBe('one\ntwo');
   });

   it('numbers a multi-line selection sequentially', () => {
      const body = 'one\ntwo\nthree';
      expect(applyLine(body, computePrefixToggle(body, 0, body.length, 'numbered'))).toBe('1. one\n2. two\n3. three');
   });

   it('leaves blank lines untouched and prefixes the rest', () => {
      const body = 'one\n\ntwo';
      expect(applyLine(body, computePrefixToggle(body, 0, body.length, 'bullet'))).toBe('- one\n\n- two');
   });

   it('prefixes an EMPTY line so a list can start on a blank line', () => {
      // Caret alone on an empty line (start of an empty doc): bullet + numbered both prefix it.
      expect(applyLine('', computePrefixToggle('', 0, 0, 'bullet'))).toBe('- ');
      expect(applyLine('', computePrefixToggle('', 0, 0, 'numbered'))).toBe('1. ');
      // An empty line between paragraphs: caret on it -> prefixed.
      const body = 'a\n\nb';
      expect(applyLine(body, computePrefixToggle(body, 2, 2, 'bullet'))).toBe('a\n- \nb');
   });

   it('toggles quote on then off (round-trip)', () => {
      const body = 'a note';
      const on = applyLine(body, computePrefixToggle(body, 0, body.length, 'quote'));
      expect(on).toBe('> a note');
      expect(applyLine(on, computePrefixToggle(on, 0, on.length, 'quote'))).toBe(body);
   });

   it('replaces a bullet with numbered rather than stacking', () => {
      const body = '- one';
      expect(applyLine(body, computePrefixToggle(body, 0, body.length, 'numbered'))).toBe('1. one');
   });
});

describe('computeHeadingCycle', () => {
   it('cycles plain -> H1 -> H2 -> H3 -> plain', () => {
      let body = 'Title';
      body = applyLine(body, computeHeadingCycle(body, 0));
      expect(body).toBe('# Title');
      body = applyLine(body, computeHeadingCycle(body, 0));
      expect(body).toBe('## Title');
      body = applyLine(body, computeHeadingCycle(body, 0));
      expect(body).toBe('### Title');
      body = applyLine(body, computeHeadingCycle(body, 0));
      expect(body).toBe('Title');
   });

   it('replaces a list prefix with the heading marker', () => {
      const body = '- Title';
      expect(applyLine(body, computeHeadingCycle(body, 0))).toBe('# Title');
   });

   it('cycles only the caret line in a multi-line doc', () => {
      const body = 'first\nsecond';
      const caret = body.indexOf('second');
      expect(applyLine(body, computeHeadingCycle(body, caret))).toBe('first\n# second');
   });
});

describe('buildTable', () => {
   it('builds a valid GFM table (header + separator + body rows)', () => {
      const table = buildTable(2, 3);
      const lines = table.split('\n');
      expect(lines).toHaveLength(4); // header + divider + 2 body rows
      expect(lines[0]).toBe('| Column 1 | Column 2 | Column 3 |');
      expect(lines[1]).toBe('| --- | --- | --- |');
      expect(lines[2]).toBe('|  |  |  |'); // empty cells, canonical spacing
   });

   it('clamps to at least 1x1', () => {
      const table = buildTable(0, 0);
      expect(table.split('\n')).toHaveLength(3); // header + divider + 1 body row
   });
});

describe('table model (parse / rebuild / structure / alignment)', () => {
   const SAMPLE = ['| Name | Might | Notes |', '| :--- | :-: | ---: |', '| Baron | 3 | rules |', '| Envoy | 1 | spy |'].join('\n');

   it('parses a GFM table into header / rows / aligns', () => {
      const m = parseTable(SAMPLE);
      expect(m).not.toBeNull();
      expect(m!.header).toEqual(['Name', 'Might', 'Notes']);
      expect(m!.rows).toEqual([['Baron', '3', 'rules'], ['Envoy', '1', 'spy']]);
      expect(m!.aligns).toEqual(['left', 'center', 'right']);
   });

   it('returns null for a non-table (no separator row)', () => {
      expect(parseTable('| a | b |\n| c | d |')).toBeNull();
      expect(parseTable('just prose')).toBeNull();
   });

   it('round-trips: parse -> rebuild preserves cells and alignment', () => {
      const m = parseTable(SAMPLE)!;
      const rebuilt = rebuildTable(m);
      // Re-parse the rebuild and compare models (canonical spacing may differ from the input's).
      expect(parseTable(rebuilt)).toEqual(m);
      expect(rebuilt).toContain('| :--- | :--: | ---: |'); // alignment survives (center canonicalizes to :--:)
   });

   it('pads a short body row to the column count', () => {
      const m = parseTable('| a | b | c |\n| --- | --- | --- |\n| x |')!;
      expect(m.rows[0]).toEqual(['x', '', '']);
   });

   it('adds and removes a row', () => {
      const m = parseTable(SAMPLE)!;
      const added = addTableRow(m);
      expect(added.rows).toHaveLength(3);
      expect(added.rows[2]).toEqual(['', '', '']);
      const removed = removeTableRow(added, 0);
      expect(removed.rows).toHaveLength(2);
      expect(removed.rows[0]).toEqual(['Envoy', '1', 'spy']);
   });

   it('never removes the last body row', () => {
      const one = parseTable('| a |\n| --- |\n| x |')!;
      expect(removeTableRow(one, 0).rows).toHaveLength(1);
   });

   it('adds a column (header, every row, and align all grow)', () => {
      const m = parseTable(SAMPLE)!;
      const added = addTableColumn(m, 0); // after column 0
      expect(added.header).toEqual(['Name', '', 'Might', 'Notes']);
      expect(added.rows[0]).toEqual(['Baron', '', '3', 'rules']);
      expect(added.aligns).toEqual(['left', 'none', 'center', 'right']);
   });

   it('removes a column but never the last', () => {
      const m = parseTable(SAMPLE)!;
      const removed = removeTableColumn(m, 1);
      expect(removed.header).toEqual(['Name', 'Notes']);
      expect(removed.aligns).toEqual(['left', 'right']);
      const one = parseTable('| a |\n| --- |\n| x |')!;
      expect(removeTableColumn(one, 0).header).toEqual(['a']);
   });

   it('sets a column alignment into the separator row', () => {
      const m = parseTable(SAMPLE)!;
      const centered = setTableColumnAlign(m, 0, 'center');
      expect(centered.aligns[0]).toBe('center');
      expect(rebuildTable(centered)).toContain('| :--: | :--: | ---: |');
   });

   it('moves a body row up and down (header stays put)', () => {
      const m = parseTable(SAMPLE)!; // rows: Baron, Envoy
      const down = moveTableRow(m, 0, 1); // Baron down past Envoy
      expect(down.rows).toEqual([['Envoy', '1', 'spy'], ['Baron', '3', 'rules']]);
      const up = moveTableRow(down, 1, 0); // Baron back up
      expect(up.rows).toEqual([['Baron', '3', 'rules'], ['Envoy', '1', 'spy']]);
   });

   it('no-ops a row move at the edges or onto itself', () => {
      const m = parseTable(SAMPLE)!;
      expect(moveTableRow(m, 0, -1)).toBe(m); // up from the top
      expect(moveTableRow(m, 1, 2)).toBe(m); // down from the bottom
      expect(moveTableRow(m, 0, 0)).toBe(m); // onto itself
   });

   it('moves a column with its header cell, body cells, and alignment', () => {
      const m = parseTable(SAMPLE)!; // cols: Name(left) Might(center) Notes(right)
      const moved = moveTableColumn(m, 0, 2); // Name to the end
      expect(moved.header).toEqual(['Might', 'Notes', 'Name']);
      expect(moved.rows[0]).toEqual(['3', 'rules', 'Baron']);
      expect(moved.aligns).toEqual(['center', 'right', 'left']);
   });

   it('no-ops a column move at the edges or onto itself', () => {
      const m = parseTable(SAMPLE)!;
      expect(moveTableColumn(m, 0, -1)).toBe(m);
      expect(moveTableColumn(m, 2, 3)).toBe(m);
      expect(moveTableColumn(m, 1, 1)).toBe(m);
   });

   it('sets a cell (header via row -1, body via index) and escapes pipes', () => {
      const m = parseTable(SAMPLE)!;
      expect(setTableCell(m, -1, 0, 'Who').header[0]).toBe('Who');
      expect(setTableCell(m, 0, 2, 'no rules').rows[0][2]).toBe('no rules');
      // A literal pipe in a cell survives rebuild as an escaped pipe (no row break).
      const piped = setTableCell(m, 0, 2, 'a | b');
      expect(rebuildTable(piped)).toContain('a \\| b');
      expect(parseTable(rebuildTable(piped))!.rows[0][2]).toBe('a | b');
   });

   it('preserves a cell `<br>` line break through parse -> rebuild', () => {
      const m = parseTable(SAMPLE)!;
      const withBreak = setTableCell(m, 0, 2, 'Foo<br>Bar');
      const rebuilt = rebuildTable(withBreak);
      expect(rebuilt).toContain('Foo<br>Bar'); // the token isn't mangled by escaping
      expect(parseTable(rebuilt)!.rows[0][2]).toBe('Foo<br>Bar'); // and round-trips verbatim
   });
});

describe('separateTablesFromText', () => {
   it('injects a blank line between a table and a text line one newline below', () => {
      const body = '| a | b |\n| --- | --- |\n| c | d |\nsome text';
      expect(separateTablesFromText(body)).toBe('| a | b |\n| --- | --- |\n| c | d |\n\nsome text');
   });

   it('leaves a table already blank-line-separated untouched', () => {
      const body = '| a | b |\n| --- | --- |\n| c | d |\n\nsome text';
      expect(separateTablesFromText(body)).toBe(body);
   });

   it('leaves a table at end of doc untouched', () => {
      const body = '| a | b |\n| --- | --- |\n| c | d |';
      expect(separateTablesFromText(body)).toBe(body);
   });

   it('does not touch a lone `|` line that is not a table (no separator row)', () => {
      const body = 'a | b\nmore text';
      expect(separateTablesFromText(body)).toBe(body);
   });

   it('handles text both before and after the table', () => {
      const body = 'Intro.\n\n| a | b |\n| --- | --- |\n| c | d |\ntail';
      expect(separateTablesFromText(body)).toBe('Intro.\n\n| a | b |\n| --- | --- |\n| c | d |\n\ntail');
   });

   it('isolates a table from a setext-forming `text\\n---` below it (the whole-block-setext regression)', () => {
      const body = '| a | b |\n|---|---|\n| c | d |\nsome text\n---';
      expect(separateTablesFromText(body)).toBe('| a | b |\n|---|---|\n| c | d |\n\nsome text\n---');
   });
});

describe('findTableBlocks', () => {
   it('finds a table block regardless of what follows (parser-independent line scan)', () => {
      const body = '| a | b |\n|---|---|\n| c | d |\nsome text\n---';
      const blocks = findTableBlocks(body);
      expect(blocks).toHaveLength(1);
      // The block is exactly the header + separator + row, NOT the trailing text or `---`.
      expect(body.slice(blocks[0].from, blocks[0].to)).toBe('| a | b |\n|---|---|\n| c | d |');
   });

   it('finds a table that has a blank line after it', () => {
      const body = 'Intro.\n\n| a | b |\n| --- | --- |\n| c | d |\n\nAfter.';
      const blocks = findTableBlocks(body);
      expect(blocks).toHaveLength(1);
      expect(body.slice(blocks[0].from, blocks[0].to)).toBe('| a | b |\n| --- | --- |\n| c | d |');
   });

   it('finds multiple tables and ignores a `|` line that is not a table', () => {
      const body = '| a |\n| --- |\n| x |\n\nnot a | table\n\n| p |\n| --- |\n| q |';
      const blocks = findTableBlocks(body);
      expect(blocks).toHaveLength(2);
   });
});
