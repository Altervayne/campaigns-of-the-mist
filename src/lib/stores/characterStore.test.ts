// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { createCharacterStore } from './characterStore';
import { DEFAULT_IMAGE_CARD_SIZE, MAX_CARD_HEIGHT_PX, MAX_CARD_PX, MIN_CARD_PX } from '@/lib/constants/imageCard';

// -- Type Imports --
import type { Card } from '@/lib/types/character';

/*
 * Unit tests for the portrait/IMAGE_CARD store logic: the addPortrait singleton, the
 * setCardImage set/clear, and the addImportedCard reject-vs-replace guard. The render
 * path (ImageCard), the object-URL hook, and the upload pipeline rely on canvas /
 * object URLs and are browser-verified, not unit-tested here.
 */

/** A fresh store with a brand-new Legends character (which starts with one CHARACTER_CARD). */
function makeStore() {
   const store = createCharacterStore();
   store.getState().actions.createCharacter('LEGENDS');
   return store;
}

/** Builds an importable IMAGE_CARD with the given asset hash. */
function makeImageCard(assetId: string | null = 'hash-1'): Card {
   return {
      id: 'import-img',
      title: 'Portrait',
      order: 0,
      isFlipped: false,
      cardType: 'IMAGE_CARD',
      details: { game: 'LEGENDS', assetId, fit: 'cover' },
   } as unknown as Card;
}

const imageCards = (store: ReturnType<typeof makeStore>) =>
   store.getState().character!.cards.filter((c) => c.cardType === 'IMAGE_CARD');

describe('addPortrait', () => {
   it('appends exactly one empty IMAGE_CARD', () => {
      const store = makeStore();
      store.getState().actions.addPortrait();

      const portraits = imageCards(store);
      expect(portraits).toHaveLength(1);
      expect(portraits[0].details).toMatchObject({
         assetId: null,
         fit: 'cover',
         game: 'NEUTRAL', // game-agnostic, regardless of the character's game
         width: DEFAULT_IMAGE_CARD_SIZE.width,
         height: DEFAULT_IMAGE_CARD_SIZE.height,
      });
   });

   it('no-ops when a portrait already exists', () => {
      const store = makeStore();
      store.getState().actions.addPortrait();
      store.getState().actions.addPortrait();

      expect(imageCards(store)).toHaveLength(1);
   });
});

describe('setCardImage', () => {
   it('sets and clears a portrait\'s asset id', () => {
      const store = makeStore();
      store.getState().actions.addPortrait();
      const portraitId = imageCards(store)[0].id;

      store.getState().actions.setCardImage(portraitId, 'hash-abc');
      expect(imageCards(store)[0].details).toMatchObject({ assetId: 'hash-abc' });

      store.getState().actions.setCardImage(portraitId, null);
      expect(imageCards(store)[0].details).toMatchObject({ assetId: null });
   });
});

describe('addImportedCard portrait guard', () => {
   it('accepts the first imported portrait and returns true', () => {
      const store = makeStore();
      const added = store.getState().actions.addImportedCard(makeImageCard('hash-1'));

      expect(added).toBe(true);
      expect(imageCards(store)).toHaveLength(1);
   });

   it('rejects a second imported portrait (returns false, no mutation)', () => {
      const store = makeStore();
      store.getState().actions.addImportedCard(makeImageCard('hash-1'));
      const before = store.getState().character!.cards;

      const added = store.getState().actions.addImportedCard(makeImageCard('hash-2'));

      expect(added).toBe(false);
      expect(imageCards(store)).toHaveLength(1);
      expect(imageCards(store)[0].details).toMatchObject({ assetId: 'hash-1' }); // unchanged
      expect(store.getState().character!.cards).toBe(before); // no mutation
   });

   it('leaves CHARACTER_CARD replace behavior unchanged', () => {
      const store = makeStore();
      const characterCardImport = {
         id: 'import-hero',
         title: 'Imported Hero',
         order: 0,
         isFlipped: false,
         cardType: 'CHARACTER_CARD',
         details: { game: 'LEGENDS', characterName: 'Imported' },
      } as unknown as Card;

      const added = store.getState().actions.addImportedCard(characterCardImport);

      expect(added).toBe(true);
      // Still exactly one character card (replaced, not appended).
      expect(store.getState().character!.cards.filter((c) => c.cardType === 'CHARACTER_CARD')).toHaveLength(1);
   });
});

describe('setCardSize', () => {
   it('sets a portrait card\'s display size', () => {
      const store = makeStore();
      store.getState().actions.addPortrait();
      const portraitId = imageCards(store)[0].id;

      store.getState().actions.setCardSize(portraitId, 320, 240);

      expect(imageCards(store)[0].details).toMatchObject({ width: 320, height: 240 });
   });

   it('clamps width and height to the card bounds', () => {
      const store = makeStore();
      store.getState().actions.addPortrait();
      const portraitId = imageCards(store)[0].id;

      store.getState().actions.setCardSize(portraitId, 10_000, 5);

      expect(imageCards(store)[0].details).toMatchObject({ width: MAX_CARD_PX, height: MIN_CARD_PX });
   });

   it('caps height at a standard card\'s height (below the width cap)', () => {
      const store = makeStore();
      store.getState().actions.addPortrait();
      const portraitId = imageCards(store)[0].id;

      store.getState().actions.setCardSize(portraitId, 300, 10_000);

      expect(imageCards(store)[0].details).toMatchObject({ width: 300, height: MAX_CARD_HEIGHT_PX });
   });
});

describe('addJournal', () => {
   it('appends a bare, empty Journal with a generated id', () => {
      const store = makeStore();
      store.getState().actions.addJournal();

      const journals = store.getState().character!.journals;
      expect(journals).toHaveLength(1);
      expect(typeof journals[0].id).toBe('string');
      expect(journals[0].id).not.toBe('');
      expect(journals[0].pages).toEqual([]);
      expect(journals[0].bookmarks).toEqual([]);
   });

   it('appends (never replaces): each call adds a distinct journal', () => {
      const store = makeStore();
      store.getState().actions.addJournal();
      store.getState().actions.addJournal();

      const journals = store.getState().character!.journals;
      expect(journals).toHaveLength(2);
      expect(journals[0].id).not.toBe(journals[1].id);
   });

   it('is undoable: undo removes the added journal', () => {
      const store = makeStore();
      store.getState().actions.addJournal();
      expect(store.getState().character!.journals).toHaveLength(1);

      store.temporal.getState().undo();

      expect(store.getState().character!.journals).toHaveLength(0);
   });

   it('returns the new journal id, resolvable in journals and the manifest', () => {
      const store = makeStore();
      const id = store.getState().actions.addJournal();

      expect(typeof id).toBe('string');
      expect(id).not.toBe('');
      const character = store.getState().character!;
      expect(character.journals.map((j) => j.id)).toContain(id);
      expect(character.sheetLayout).toContainEqual({ kind: 'journal', id });
   });
});

describe('updateJournal', () => {
   it('replaces the matching journal with the edited aggregate', () => {
      const store = makeStore();
      store.getState().actions.addJournal();
      const id = store.getState().character!.journals[0].id;

      const edited = { id, title: '', pages: [{ id: 'p1', text: 'hello' }], bookmarks: [{ id: 'b1', pageId: 'p1', label: '' }] };
      store.getState().actions.updateJournal(id, edited);

      const journals = store.getState().character!.journals;
      expect(journals).toHaveLength(1);
      expect(journals[0]).toEqual(edited);
   });

   it('leaves other journals untouched', () => {
      const store = makeStore();
      store.getState().actions.addJournal();
      store.getState().actions.addJournal();
      const [first, second] = store.getState().character!.journals;

      store.getState().actions.updateJournal(second.id, { ...second, pages: [{ id: 'p', text: 'x' }] });

      const journals = store.getState().character!.journals;
      expect(journals[0]).toEqual(first);
      expect(journals[1].pages).toEqual([{ id: 'p', text: 'x' }]);
   });
});

describe('removeJournal', () => {
   it('removes only the matching journal', () => {
      const store = makeStore();
      store.getState().actions.addJournal();
      store.getState().actions.addJournal();
      const [first, second] = store.getState().character!.journals;

      store.getState().actions.removeJournal(first.id);

      const journals = store.getState().character!.journals;
      expect(journals).toHaveLength(1);
      expect(journals[0].id).toBe(second.id);
   });
});

describe('addImportedJournal', () => {
   const imported = {
      id: 'src-journal',
      title: '',
      pages: [{ id: 'p-a', text: 'One' }, { id: 'p-b', text: 'Two' }],
      bookmarks: [{ id: 'bm', pageId: 'p-b', label: 'Second' }],
   };

   it('appends a COPY with a fresh top-level id, pages + bookmarks preserved (no stranded bookmark)', () => {
      const store = makeStore();
      store.getState().actions.addImportedJournal(imported);

      const journals = store.getState().character!.journals;
      expect(journals).toHaveLength(1);
      const copy = journals[0];
      // Fresh top-level id...
      expect(copy.id).not.toBe('src-journal');
      // ...but page ids and the bookmark's pageId are untouched, so the bookmark still resolves.
      expect(copy.pages.map((p) => p.id)).toEqual(['p-a', 'p-b']);
      expect(copy.bookmarks[0].pageId).toBe('p-b');
      const pageIds = new Set(copy.pages.map((p) => p.id));
      expect(copy.bookmarks.every((b) => pageIds.has(b.pageId))).toBe(true);
   });

   it('appends a sheetLayout entry for the imported journal (so it can reorder)', () => {
      const store = makeStore();
      store.getState().actions.addImportedJournal(imported);

      const { journals, sheetLayout } = store.getState().character!;
      expect(sheetLayout).toContainEqual({ kind: 'journal', id: journals[0].id });
      // The manifest covers every card + journal exactly once.
      expect(sheetLayout).toHaveLength(store.getState().character!.cards.length + journals.length);
   });

   it('is a deep copy: editing the source after import never reaches the stored journal', () => {
      const store = makeStore();
      const source = structuredClone(imported);
      store.getState().actions.addImportedJournal(source);
      source.pages[0].text = 'edited';
      expect(store.getState().character!.journals[0].pages[0].text).toBe('One');
   });
});

describe('sheetLayout manifest cascade', () => {
   const layout = (store: ReturnType<typeof makeStore>) => store.getState().character!.sheetLayout;

   it('a new character starts with a manifest matching its starter card', () => {
      const store = makeStore(); // one CHARACTER_CARD
      const cards = store.getState().character!.cards;
      expect(layout(store)).toEqual([{ kind: 'card', id: cards[0].id }]);
   });

   it('addPortrait appends a card entry to the manifest', () => {
      const store = makeStore();
      store.getState().actions.addPortrait();
      const portraitId = imageCards(store)[0].id;
      expect(layout(store)).toContainEqual({ kind: 'card', id: portraitId });
      // Exactly one entry per content id (no dupes).
      expect(layout(store)).toHaveLength(store.getState().character!.cards.length);
   });

   it('addJournal appends a journal entry to the manifest', () => {
      const store = makeStore();
      store.getState().actions.addJournal();
      const journalId = store.getState().character!.journals[0].id;
      expect(layout(store)).toContainEqual({ kind: 'journal', id: journalId });
   });

   it('deleteCard splices the card entry (no stranded ghost slot)', () => {
      const store = makeStore();
      store.getState().actions.addPortrait();
      const portraitId = imageCards(store)[0].id;

      store.getState().actions.deleteCard(portraitId);

      expect(layout(store).some((entry) => entry.id === portraitId)).toBe(false);
      // The manifest still covers every remaining card + journal exactly once.
      const remaining = store.getState().character!;
      expect(layout(store)).toHaveLength(remaining.cards.length + remaining.journals.length);
   });

   it('removeJournal splices the journal entry', () => {
      const store = makeStore();
      store.getState().actions.addJournal();
      const journalId = store.getState().character!.journals[0].id;

      store.getState().actions.removeJournal(journalId);

      expect(layout(store).some((entry) => entry.id === journalId)).toBe(false);
   });
});

describe('reorderSheetLayout', () => {
   it('moves a journal ahead of the starter card (cards + journals share one ordered space)', () => {
      const store = makeStore();
      const cardId = store.getState().character!.cards[0].id;
      store.getState().actions.addJournal();
      const journalId = store.getState().character!.journals[0].id;

      // Manifest starts [card, journal]; move the journal onto the card's slot.
      store.getState().actions.reorderSheetLayout(journalId, cardId);

      expect(store.getState().character!.sheetLayout).toEqual([
         { kind: 'journal', id: journalId },
         { kind: 'card', id: cardId },
      ]);
   });

   it('leaves cards/journals content arrays untouched (order lives only in the manifest)', () => {
      const store = makeStore();
      const cardsBefore = store.getState().character!.cards;
      store.getState().actions.addJournal();
      const journalsBefore = store.getState().character!.journals;
      const [cardId] = store.getState().character!.cards.map((c) => c.id);
      const journalId = journalsBefore[0].id;

      store.getState().actions.reorderSheetLayout(journalId, cardId);

      expect(store.getState().character!.cards).toBe(cardsBefore);
      expect(store.getState().character!.journals).toBe(journalsBefore);
   });
});
