// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Unit Under Test --
import { parseLinkHref, resolveLinkAction } from './linkTarget';
import type { NoteHostContext } from './linkTarget';

const TAB_HOST: NoteHostContext = { kind: 'tab', noteId: 'note-1' };
const BOARD_HOST: NoteHostContext = { kind: 'board-embed', boardId: 'board-1', itemId: 'item-1', noteId: 'note-1' };

describe('parseLinkHref', () => {
   it('classifies a same-note section', () => {
      expect(parseLinkHref('#the-baron')).toEqual({ kind: 'section', slug: 'the-baron' });
   });

   it('decodes a percent-encoded section slug', () => {
      expect(parseLinkHref('#caf%C3%A9')).toEqual({ kind: 'section', slug: 'café' });
   });

   it('classifies each entity type carrying its entity id', () => {
      expect(parseLinkHref('cotm://note/abc123')).toEqual({ kind: 'entity', entity: 'note', id: 'abc123' });
      expect(parseLinkHref('cotm://board/brd9')).toEqual({ kind: 'entity', entity: 'board', id: 'brd9' });
      expect(parseLinkHref('cotm://character/chr7')).toEqual({ kind: 'entity', entity: 'character', id: 'chr7' });
   });

   it('classifies a tabless element by its drawer item id (any non-entity cotm type)', () => {
      expect(parseLinkHref('cotm://item/drw5')).toEqual({ kind: 'element', drawerItemId: 'drw5' });
      expect(parseLinkHref('cotm://card/drw5')).toEqual({ kind: 'element', drawerItemId: 'drw5' });
   });

   it('drops a deferred cross-note section fragment, keeping the entity id', () => {
      expect(parseLinkHref('cotm://note/abc123#some-heading')).toEqual({ kind: 'entity', entity: 'note', id: 'abc123' });
   });

   it('reads a pdf fragment back as the page, and a bare pdf link as page 1 (no page field)', () => {
      expect(parseLinkHref('cotm://pdf/x#42')).toEqual({ kind: 'entity', entity: 'pdf', id: 'x', page: 42 });
      expect(parseLinkHref('cotm://pdf/x')).toEqual({ kind: 'entity', entity: 'pdf', id: 'x' });
   });

   it('ignores a non-positive or non-numeric pdf fragment (opens at page 1)', () => {
      expect(parseLinkHref('cotm://pdf/x#0')).toEqual({ kind: 'entity', entity: 'pdf', id: 'x' });
      expect(parseLinkHref('cotm://pdf/x#abc')).toEqual({ kind: 'entity', entity: 'pdf', id: 'x' });
   });

   it('classifies http and https as external', () => {
      expect(parseLinkHref('https://example.com')).toEqual({ kind: 'external', href: 'https://example.com' });
      expect(parseLinkHref('http://example.com/x')).toEqual({ kind: 'external', href: 'http://example.com/x' });
   });

   it('falls back to unknown for anything unrecognised', () => {
      expect(parseLinkHref('mailto:x@y.z')).toEqual({ kind: 'unknown', href: 'mailto:x@y.z' });
      expect(parseLinkHref('cotm://note/')).toEqual({ kind: 'unknown', href: 'cotm://note/' });
      expect(parseLinkHref('cotm://note')).toEqual({ kind: 'unknown', href: 'cotm://note' });
      expect(parseLinkHref('')).toEqual({ kind: 'unknown', href: '' });
   });
});

describe('resolveLinkAction', () => {
   it('resolves a section to a scroll, host-independent', () => {
      expect(resolveLinkAction({ kind: 'section', slug: 's' }, TAB_HOST)).toEqual({ type: 'scroll-section', slug: 's' });
      expect(resolveLinkAction({ kind: 'section', slug: 's' }, BOARD_HOST)).toEqual({ type: 'scroll-section', slug: 's' });
   });

   it('resolves an entity to open-tab, host-independent', () => {
      expect(resolveLinkAction({ kind: 'entity', entity: 'board', id: 'b1' }, TAB_HOST)).toEqual({ type: 'open-tab', entity: 'board', id: 'b1' });
      expect(resolveLinkAction({ kind: 'entity', entity: 'note', id: 'n1' }, BOARD_HOST)).toEqual({ type: 'open-tab', entity: 'note', id: 'n1' });
   });

   it('carries a pdf page through to the open-tab action', () => {
      expect(resolveLinkAction({ kind: 'entity', entity: 'pdf', id: 'p1', page: 42 }, TAB_HOST)).toEqual({ type: 'open-tab', entity: 'pdf', id: 'p1', page: 42 });
   });

   it('splits an element by host: reveal-in-drawer in a tab, spawn-on-board on a board tile', () => {
      expect(resolveLinkAction({ kind: 'element', drawerItemId: 'd1' }, TAB_HOST)).toEqual({ type: 'reveal-in-drawer', drawerItemId: 'd1' });
      expect(resolveLinkAction({ kind: 'element', drawerItemId: 'd1' }, BOARD_HOST)).toEqual({
         type: 'spawn-on-board',
         drawerItemId: 'd1',
         host: BOARD_HOST,
      });
   });

   it('resolves external to open-external and unknown to noop', () => {
      expect(resolveLinkAction({ kind: 'external', href: 'https://x.y' }, TAB_HOST)).toEqual({ type: 'open-external', href: 'https://x.y' });
      expect(resolveLinkAction({ kind: 'unknown', href: 'zzz' }, TAB_HOST)).toEqual({ type: 'noop' });
   });
});
