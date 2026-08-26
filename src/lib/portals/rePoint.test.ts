// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Units Under Test --
import { rePointNoteBody, countNoteBodyLinks, rePointableTargetId, rePointBoardItemContent, rePointBoardTarget } from './rePoint';

// -- Type Imports --
import type { LinkInsertTarget } from './buildLinkToken';
import type { LinkTarget } from './linkTarget';
import type { Board, BoardItem, BoardItemContent } from '@/lib/types/board';

/*
 * Exhaustive tests for the re-point primitives - the riskiest code in the epic, since a note-body bug corrupts
 * user prose. The note-body suite proves the rewrite is SURGICAL: only matched link url spans change, everything
 * else is byte-identical, and a `cotm://` occurrence in code (or a non-matching link) is never touched.
 */

const OLD = 'oldTargetId';
const NEW_PDF: LinkInsertTarget = { kind: 'entity', entity: 'pdf', id: 'newPdfId' };
const NEW_NOTE: LinkInsertTarget = { kind: 'entity', entity: 'note', id: 'newNoteId' };
const NEW_BOARD: LinkInsertTarget = { kind: 'entity', entity: 'board', id: 'newBoardId' };
const NEW_ELEMENT: LinkInsertTarget = { kind: 'element', drawerItemId: 'newItemId' };

describe('rePointNoteBody - single match', () => {
   it('rewrites a matching link url, leaving the label and surrounding prose byte-identical', () => {
      const body = 'Before the [rulebook](cotm://pdf/oldTargetId) after.';
      const result = rePointNoteBody(body, OLD, NEW_PDF);
      expect(result).toBe('Before the [rulebook](cotm://pdf/newPdfId) after.');
   });

   it('re-points an element link by its drawer-item id', () => {
      const body = 'See [the goblin](cotm://item/oldTargetId).';
      expect(rePointNoteBody(body, OLD, NEW_ELEMENT)).toBe('See [the goblin](cotm://item/newItemId).');
   });
});

describe('rePointNoteBody - multiple matches (right-to-left splice)', () => {
   it('rewrites every matching link in one body, keeping later offsets valid', () => {
      const body = 'One [a](cotm://pdf/oldTargetId) two [b](cotm://pdf/oldTargetId) three [c](cotm://pdf/oldTargetId).';
      const result = rePointNoteBody(body, OLD, NEW_NOTE);
      expect(result).toBe('One [a](cotm://note/newNoteId) two [b](cotm://note/newNoteId) three [c](cotm://note/newNoteId).');
   });

   it('rewrites matches of differing label lengths without drift', () => {
      const body = '[short](cotm://pdf/oldTargetId) and [a much longer label here](cotm://pdf/oldTargetId)';
      const result = rePointNoteBody(body, OLD, NEW_PDF);
      expect(result).toBe('[short](cotm://pdf/newPdfId) and [a much longer label here](cotm://pdf/newPdfId)');
   });
});

describe('rePointNoteBody - code is never touched', () => {
   it('leaves a cotm token inside inline code and a fenced code block untouched, rewriting only the real link', () => {
      const body = [
         'A real [link](cotm://pdf/oldTargetId) here.',
         '',
         'Inline `[x](cotm://pdf/oldTargetId)` and bare `cotm://pdf/oldTargetId`.',
         '',
         '```',
         '[y](cotm://pdf/oldTargetId)',
         'cotm://pdf/oldTargetId',
         '```',
      ].join('\n');
      const result = rePointNoteBody(body, OLD, NEW_PDF);
      const expected = [
         'A real [link](cotm://pdf/newPdfId) here.',
         '',
         'Inline `[x](cotm://pdf/oldTargetId)` and bare `cotm://pdf/oldTargetId`.',
         '',
         '```',
         '[y](cotm://pdf/oldTargetId)',
         'cotm://pdf/oldTargetId',
         '```',
      ].join('\n');
      expect(result).toBe(expected);
   });
});

describe('rePointNoteBody - images and titled links', () => {
   it('never touches an image embed (an image node, not a link)', () => {
      const body = 'An ![alt](cotm://pdf/oldTargetId) image and a [link](cotm://pdf/oldTargetId).';
      // Only the link rewrites; the image url is left as-is.
      expect(rePointNoteBody(body, OLD, NEW_PDF)).toBe('An ![alt](cotm://pdf/oldTargetId) image and a [link](cotm://pdf/newPdfId).');
   });

   it('rewrites only the url, keeping a trailing link title intact', () => {
      const body = '[x](cotm://pdf/oldTargetId "a title")';
      expect(rePointNoteBody(body, OLD, NEW_PDF)).toBe('[x](cotm://pdf/newPdfId "a title")');
   });
});

describe('rePointNoteBody - non-matching links untouched', () => {
   it('leaves a different-id cotm link, an external link, and a section link alone', () => {
      const body = 'A [other](cotm://pdf/differentId), an [ext](https://example.com/oldTargetId), a [sec](#oldTargetId).';
      expect(rePointNoteBody(body, OLD, NEW_PDF)).toBe(body);
   });
});

describe('rePointNoteBody - #page fragment', () => {
   it('preserves the page on pdf -> pdf', () => {
      const body = '[see p.3](cotm://pdf/oldTargetId#3)';
      expect(rePointNoteBody(body, OLD, NEW_PDF)).toBe('[see p.3](cotm://pdf/newPdfId#3)');
   });

   it('drops the page on pdf -> note', () => {
      const body = '[see p.3](cotm://pdf/oldTargetId#3)';
      expect(rePointNoteBody(body, OLD, NEW_NOTE)).toBe('[see p.3](cotm://note/newNoteId)');
   });

   it('drops the page on pdf -> board', () => {
      const body = '[see p.7](cotm://pdf/oldTargetId#7)';
      expect(rePointNoteBody(body, OLD, NEW_BOARD)).toBe('[see p.7](cotm://board/newBoardId)');
   });

   it('lets an explicitly picked new page win over the old page', () => {
      const body = '[see p.3](cotm://pdf/oldTargetId#3)';
      const newAtPage9: LinkInsertTarget = { kind: 'entity', entity: 'pdf', id: 'newPdfId', page: 9 };
      expect(rePointNoteBody(body, OLD, newAtPage9)).toBe('[see p.3](cotm://pdf/newPdfId#9)');
   });
});

describe('rePointNoteBody - no matches', () => {
   it('returns the body byte-identical when nothing matches', () => {
      const body = 'Just prose with a [dead-looking](https://oldTargetId.example) link and `code`.';
      expect(rePointNoteBody(body, OLD, NEW_PDF)).toBe(body);
   });

   it('returns an empty body unchanged', () => {
      expect(rePointNoteBody('', OLD, NEW_PDF)).toBe('');
   });
});

describe('rePointNoteBody - labels are never mistaken for the href', () => {
   it('leaves a label that contains parens untouched, changing only the href', () => {
      const body = '[a label (with parens)](cotm://pdf/oldTargetId)';
      expect(rePointNoteBody(body, OLD, NEW_PDF)).toBe('[a label (with parens)](cotm://pdf/newPdfId)');
   });

   it('leaves a label that literally contains the old id string untouched', () => {
      const body = '[oldTargetId](cotm://pdf/oldTargetId)';
      expect(rePointNoteBody(body, OLD, NEW_PDF)).toBe('[oldTargetId](cotm://pdf/newPdfId)');
   });

   it('leaves a label that contains a cotm-looking token untouched', () => {
      const body = '[cotm://pdf/oldTargetId](cotm://pdf/oldTargetId)';
      expect(rePointNoteBody(body, OLD, NEW_NOTE)).toBe('[cotm://pdf/oldTargetId](cotm://note/newNoteId)');
   });
});

describe('countNoteBodyLinks', () => {
   it('counts only the matching links, ignoring code and non-matching links', () => {
      const body = [
         '[a](cotm://pdf/oldTargetId) [b](cotm://pdf/oldTargetId) [c](cotm://pdf/differentId)',
         '`[d](cotm://pdf/oldTargetId)`',
      ].join('\n');
      expect(countNoteBodyLinks(body, OLD)).toBe(2);
   });

   it('is zero for a body with no matches', () => {
      expect(countNoteBodyLinks('no links here', OLD)).toBe(0);
   });
});

describe('rePointableTargetId', () => {
   it('reads an entity target by its id', () => {
      const target: LinkTarget = { kind: 'entity', entity: 'pdf', id: 'p1' };
      expect(rePointableTargetId(target)).toBe('p1');
   });

   it('reads an element target by its drawer-item id', () => {
      const target: LinkTarget = { kind: 'element', drawerItemId: 'i1' };
      expect(rePointableTargetId(target)).toBe('i1');
   });

   it('is undefined for a section/external/unknown target (not re-pointable)', () => {
      expect(rePointableTargetId({ kind: 'section', slug: 's' })).toBeUndefined();
      expect(rePointableTargetId({ kind: 'external', href: 'https://example.com' })).toBeUndefined();
      expect(rePointableTargetId({ kind: 'unknown', href: 'cotm://weird' })).toBeUndefined();
   });
});

// -- Board fixtures --

function makeBoard(items: BoardItem[]): Board {
   return { id: 'board1', name: 'B', viewport: { x: 0, y: 0, zoom: 1 }, nextLayerSeq: 1, items };
}

function makeItem(id: string, content: BoardItemContent): BoardItem {
   return { id, kind: content.kind, x: 0, y: 0, width: 100, height: 100, z: 0, content };
}

describe('rePointBoardItemContent', () => {
   it('re-points a portal whose entity target matches', () => {
      const content: BoardItemContent = {
         kind: 'portal',
         target: { kind: 'entity', entity: 'pdf', id: OLD },
         style: { visual: null, label: 'Go', align: 'bottom', background: true },
      };
      const next = rePointBoardItemContent(content, OLD, NEW_NOTE);
      expect(next).toEqual({ ...content, target: { kind: 'entity', entity: 'note', id: 'newNoteId' } });
   });

   it('re-points a portal whose element target matches', () => {
      const content: BoardItemContent = {
         kind: 'portal',
         target: { kind: 'element', drawerItemId: OLD },
         style: { visual: null, label: 'Go', align: 'bottom', background: true },
      };
      const next = rePointBoardItemContent(content, OLD, NEW_ELEMENT);
      expect(next).toMatchObject({ target: { kind: 'element', drawerItemId: 'newItemId' } });
   });

   it('preserves the old pdf page on a portal pdf -> pdf swap', () => {
      const content: BoardItemContent = {
         kind: 'portal',
         target: { kind: 'entity', entity: 'pdf', id: OLD, page: 4 },
         style: { visual: null, label: 'Go', align: 'bottom', background: true },
      };
      const next = rePointBoardItemContent(content, OLD, NEW_PDF);
      expect(next).toMatchObject({ target: { kind: 'entity', entity: 'pdf', id: 'newPdfId', page: 4 } });
   });

   it('re-points a note-embed reference to a new note', () => {
      const content: BoardItemContent = { kind: 'note', mode: 'reference', noteId: OLD, sourceDrawerItemId: 'srcOld' };
      const next = rePointBoardItemContent(content, OLD, NEW_NOTE);
      expect(next).toEqual({ kind: 'note', mode: 'reference', noteId: 'newNoteId' });
   });

   it('leaves a note-embed untouched when the new target is not a note', () => {
      const content: BoardItemContent = { kind: 'note', mode: 'reference', noteId: OLD };
      expect(rePointBoardItemContent(content, OLD, NEW_PDF)).toBeNull();
   });

   it('returns null for a non-matching portal and a non-portal item', () => {
      const otherPortal: BoardItemContent = {
         kind: 'portal',
         target: { kind: 'entity', entity: 'pdf', id: 'someoneElse' },
         style: { visual: null, label: 'Go', align: 'bottom', background: true },
      };
      expect(rePointBoardItemContent(otherPortal, OLD, NEW_NOTE)).toBeNull();
      expect(rePointBoardItemContent({ kind: 'pin', color: '#fff' }, OLD, NEW_NOTE)).toBeNull();
   });
});

describe('rePointBoardTarget', () => {
   it('re-points matching items and leaves every other item identical (by reference)', () => {
      const portal = makeItem('p1', {
         kind: 'portal',
         target: { kind: 'entity', entity: 'pdf', id: OLD },
         style: { visual: null, label: 'Go', align: 'bottom', background: true },
      });
      const embed = makeItem('n1', { kind: 'note', mode: 'reference', noteId: OLD });
      const untouched = makeItem('x1', { kind: 'pin', color: '#abc' });
      const board = makeBoard([portal, embed, untouched]);

      const next = rePointBoardTarget(board, OLD, NEW_NOTE);
      expect(next).not.toBe(board);
      expect(next.items[0].content).toMatchObject({ target: { kind: 'entity', entity: 'note', id: 'newNoteId' } });
      expect(next.items[1].content).toEqual({ kind: 'note', mode: 'reference', noteId: 'newNoteId' });
      // The non-matching item is kept by reference (untouched).
      expect(next.items[2]).toBe(untouched);
   });

   it('returns the same board reference when nothing matches', () => {
      const board = makeBoard([makeItem('x1', { kind: 'pin', color: '#abc' })]);
      expect(rePointBoardTarget(board, OLD, NEW_NOTE)).toBe(board);
   });
});
