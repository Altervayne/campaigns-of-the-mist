// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { buildSheetLayout, resolveSheetLayout, resolveSheetItems, appendSheetLayoutEntry, removeSheetLayoutEntry, reorderSheetLayoutEntries } from './sheetLayout';

// -- Type Imports --
import type { Character, Card } from '@/lib/types/character';
import type { Journal } from '@/lib/types/board';

/*
 * The sheet layout manifest: build/append/splice/reorder plus the self-healing read resolver (the
 * seatbelt for a desync between the manifest and its content arrays).
 */

const card = (id: string): Card => ({ id, title: '', isFlipped: false, cardType: 'CHARACTER_THEME', details: { game: 'LEGENDS' } } as unknown as Card);
const journal = (id: string): Journal => ({ id, title: '', pages: [], bookmarks: [] });

const character = (cards: Card[], journals: Journal[], sheetLayout: Character['sheetLayout']): Pick<Character, 'cards' | 'journals' | 'sheetLayout'> =>
   ({ cards, journals, sheetLayout });

describe('buildSheetLayout', () => {
   it('emits every card in order, then every journal (behavior-preserving default)', () => {
      const result = buildSheetLayout({ cards: [card('c1'), card('c2')], journals: [journal('j1')] });
      expect(result).toEqual([
         { kind: 'card', id: 'c1' },
         { kind: 'card', id: 'c2' },
         { kind: 'journal', id: 'j1' },
      ]);
   });
});

describe('resolveSheetLayout (self-healing)', () => {
   it('passes a complete, valid manifest through unchanged', () => {
      const layout = [{ kind: 'card', id: 'c1' }, { kind: 'journal', id: 'j1' }] as Character['sheetLayout'];
      const result = resolveSheetLayout(character([card('c1')], [journal('j1')], layout));
      expect(result).toEqual(layout);
   });

   it('drops entries pointing at no live card/journal (an orphan)', () => {
      const layout = [{ kind: 'card', id: 'c1' }, { kind: 'card', id: 'gone' }] as Character['sheetLayout'];
      const result = resolveSheetLayout(character([card('c1')], [], layout));
      expect(result).toEqual([{ kind: 'card', id: 'c1' }]);
   });

   it('appends content the manifest never listed (cards before journals)', () => {
      const layout = [{ kind: 'journal', id: 'j1' }] as Character['sheetLayout'];
      const result = resolveSheetLayout(character([card('c1')], [journal('j1')], layout));
      // The listed journal keeps its slot; the missing card is appended after it.
      expect(result).toEqual([
         { kind: 'journal', id: 'j1' },
         { kind: 'card', id: 'c1' },
      ]);
   });

   it('de-dupes a manifest that lists the same id twice', () => {
      const layout = [{ kind: 'card', id: 'c1' }, { kind: 'card', id: 'c1' }] as Character['sheetLayout'];
      const result = resolveSheetLayout(character([card('c1')], [], layout));
      expect(result).toEqual([{ kind: 'card', id: 'c1' }]);
   });

   it('yields a permutation-with-completeness even from an empty manifest', () => {
      const result = resolveSheetLayout(character([card('c1'), card('c2')], [journal('j1')], []));
      expect(result).toEqual([
         { kind: 'card', id: 'c1' },
         { kind: 'card', id: 'c2' },
         { kind: 'journal', id: 'j1' },
      ]);
   });
});

describe('resolveSheetItems', () => {
   it('joins a journal-less character 1:1 with cards, in order', () => {
      const cards = [card('c1'), card('c2'), card('c3')];
      const items = resolveSheetItems(character(cards, [], buildSheetLayout({ cards, journals: [] })));

      // The mobile switch is a no-op with no journals: same ids, same order, all cards.
      expect(items.map((item) => item.id)).toEqual(['c1', 'c2', 'c3']);
      expect(items.every((item) => item.kind === 'card')).toBe(true);
      // Each item references the live card object, not a copy.
      items.forEach((item, index) => {
         if (item.kind === 'card') expect(item.card).toBe(cards[index]);
      });
   });

   it('joins the interleaved manifest to live card/journal objects in manifest order', () => {
      const c1 = card('c1');
      const j1 = journal('j1');
      const c2 = card('c2');
      const layout = [{ kind: 'journal', id: 'j1' }, { kind: 'card', id: 'c1' }, { kind: 'card', id: 'c2' }] as Character['sheetLayout'];

      const items = resolveSheetItems(character([c1, c2], [j1], layout));

      expect(items).toEqual([
         { kind: 'journal', id: 'j1', journal: j1 },
         { kind: 'card', id: 'c1', card: c1 },
         { kind: 'card', id: 'c2', card: c2 },
      ]);
   });

   it('self-heals through resolveSheetLayout (drops an orphan, appends the unlisted)', () => {
      const layout = [{ kind: 'card', id: 'gone' }, { kind: 'journal', id: 'j1' }] as Character['sheetLayout'];
      const items = resolveSheetItems(character([card('c1')], [journal('j1')], layout));

      // 'gone' is dropped; the unlisted c1 is appended (cards before journals in the append pass).
      expect(items.map((item) => `${item.kind}:${item.id}`)).toEqual(['journal:j1', 'card:c1']);
   });

   it('does not mutate the character content arrays', () => {
      const cards = [card('c1'), card('c2')];
      const journals = [journal('j1')];
      const layout = [{ kind: 'journal', id: 'j1' }, { kind: 'card', id: 'c1' }] as Character['sheetLayout'];

      resolveSheetItems(character(cards, journals, layout));

      expect(cards.map((c) => c.id)).toEqual(['c1', 'c2']);
      expect(journals.map((j) => j.id)).toEqual(['j1']);
   });

   it('a cards-only reorder by id matches the retired index-splice order', () => {
      // The old reorderCards(oldIndex,newIndex) spliced the cards array. With no journals the manifest
      // is cards 1:1, so the id-based reorderSheetLayout must produce the identical order.
      const cards = [card('c1'), card('c2'), card('c3')];
      const layout = buildSheetLayout({ cards, journals: [] });

      const indexSplice = Array.from(cards);
      const [moved] = indexSplice.splice(0, 1);
      indexSplice.splice(2, 0, moved);

      const byId = reorderSheetLayoutEntries(layout, cards[0].id, cards[2].id);

      expect(byId.map((entry) => entry.id)).toEqual(indexSplice.map((c) => c.id));
   });
});

describe('append / remove / reorder', () => {
   it('appendSheetLayoutEntry adds to the tail', () => {
      expect(appendSheetLayoutEntry([{ kind: 'card', id: 'c1' }], { kind: 'journal', id: 'j1' })).toEqual([
         { kind: 'card', id: 'c1' },
         { kind: 'journal', id: 'j1' },
      ]);
   });

   it('removeSheetLayoutEntry splices by id', () => {
      expect(removeSheetLayoutEntry([{ kind: 'card', id: 'c1' }, { kind: 'journal', id: 'j1' }], 'c1')).toEqual([
         { kind: 'journal', id: 'j1' },
      ]);
   });

   it('reorderSheetLayoutEntries moves fromId to toId\'s slot', () => {
      const layout = [{ kind: 'card', id: 'c1' }, { kind: 'journal', id: 'j1' }] as Character['sheetLayout'];
      expect(reorderSheetLayoutEntries(layout, 'j1', 'c1')).toEqual([
         { kind: 'journal', id: 'j1' },
         { kind: 'card', id: 'c1' },
      ]);
   });

   it('reorderSheetLayoutEntries is a no-op for a missing or identical id', () => {
      const layout = [{ kind: 'card', id: 'c1' }] as Character['sheetLayout'];
      expect(reorderSheetLayoutEntries(layout, 'c1', 'c1')).toBe(layout);
      expect(reorderSheetLayoutEntries(layout, 'nope', 'c1')).toBe(layout);
   });
});
