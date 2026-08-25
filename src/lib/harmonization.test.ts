// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { harmonizeData } from './harmonization';
import { LEGACY_IMAGE_CARD_SIZE } from './constants/imageCard';

// -- Type Imports --
import type { Character } from '@/lib/types/character';
import type { Drawer, DrawerItem } from '@/lib/types/drawer';

/*
 * Tests for the harmonization backfill of image-card sizes: cards created before the
 * resizable IMAGE_CARD gain the legacy 250x600 footprint so they keep their look,
 * while cards that already carry a size pass through untouched.
 */

/** A character holding one image card, with optional size fields on its details. */
function characterWithImageCard(size?: { width: number; height: number }): Character {
   return {
      id: 'char-1',
      name: 'Hero',
      game: 'LEGENDS',
      version: '2.0.0',
      cards: [
         {
            id: 'img-1',
            title: 'Portrait',
            order: 0,
            isFlipped: false,
            cardType: 'IMAGE_CARD',
            details: { game: 'LEGENDS', assetId: 'hash-a', fit: 'cover', ...size },
         },
      ],
      trackers: { statuses: [], storyTags: [], storyThemes: [] },
   } as unknown as Character;
}

const imageDetails = (character: Character) =>
   character.cards[0].details as unknown as { width?: number; height?: number; game?: string };

describe('harmonization: image-card normalization', () => {
   it('defaults a sizeless IMAGE_CARD to the legacy 250x600', () => {
      const harmonized = harmonizeData(characterWithImageCard(), 'FULL_CHARACTER_SHEET');

      expect(imageDetails(harmonized)).toMatchObject({
         width: LEGACY_IMAGE_CARD_SIZE.width,
         height: LEGACY_IMAGE_CARD_SIZE.height,
      });
   });

   it('normalizes a legacy image card\'s game to NEUTRAL', () => {
      // Carries a size already, so only the game needs normalizing (proves the
      // game fix is not gated behind the size backfill).
      const harmonized = harmonizeData(characterWithImageCard({ width: 320, height: 240 }), 'FULL_CHARACTER_SHEET');

      expect(imageDetails(harmonized)).toMatchObject({ game: 'NEUTRAL', width: 320, height: 240 });
   });

   it('backfills a standalone IMAGE_CARD drawer card', () => {
      const card = {
         id: 'img-1',
         title: 'Portrait',
         order: 0,
         isFlipped: false,
         cardType: 'IMAGE_CARD',
         details: { game: 'LEGENDS', assetId: 'hash-a', fit: 'cover' },
      };

      const harmonized = harmonizeData(card, 'IMAGE_CARD') as typeof card;

      expect(harmonized.details).toMatchObject({
         width: LEGACY_IMAGE_CARD_SIZE.width,
         height: LEGACY_IMAGE_CARD_SIZE.height,
      });
   });
});

describe('harmonization: sheet journals backfill', () => {
   /** A 1.x character sheet, predating `journals` (the field is absent). */
   function legacySheetWithoutJournals(): Character {
      return {
         id: 'char-1',
         name: 'Hero',
         game: 'LEGENDS',
         version: '2.0.0',
         cards: [],
         trackers: { statuses: [], storyTags: [], storyThemes: [] },
      } as unknown as Character;
   }

   it('backfills a missing journals field with an empty array', () => {
      const harmonized = harmonizeData(legacySheetWithoutJournals(), 'FULL_CHARACTER_SHEET');
      expect(harmonized.journals).toEqual([]);
   });

   it('is idempotent: a sheet that already has journals passes through unchanged', () => {
      const journals = [{ id: 'j1', title: '', pages: [{ id: 'p1', text: 'note' }], bookmarks: [] }];
      const sheet = { ...legacySheetWithoutJournals(), journals } as Character;

      const harmonized = harmonizeData(sheet, 'FULL_CHARACTER_SHEET');

      expect(harmonized.journals).toBe(journals);
      expect(harmonized.journals).toEqual(journals);
   });
});

describe('harmonization: sheet layout manifest', () => {
   /** A 1.x sheet with two cards and one journal but no manifest and stray `Card.order` fields. */
   function legacySheetWithoutManifest(): Character {
      return {
         id: 'char-1',
         name: 'Hero',
         game: 'LEGENDS',
         version: '2.0.0',
         journals: [{ id: 'j1', title: '', pages: [], bookmarks: [] }],
         cards: [
            { id: 'c1', title: 'A', order: 0, isFlipped: false, cardType: 'CHARACTER_THEME', details: { game: 'LEGENDS' } },
            { id: 'c2', title: 'B', order: 1, isFlipped: false, cardType: 'CHARACTER_THEME', details: { game: 'LEGENDS' } },
         ],
         trackers: { statuses: [], storyTags: [], storyThemes: [] },
      } as unknown as Character;
   }

   it('backfills a missing manifest: every card in order, then every journal', () => {
      const harmonized = harmonizeData(legacySheetWithoutManifest(), 'FULL_CHARACTER_SHEET');
      expect(harmonized.sheetLayout).toEqual([
         { kind: 'card', id: 'c1' },
         { kind: 'card', id: 'c2' },
         { kind: 'journal', id: 'j1' },
      ]);
   });

   it('drops the defunct Card.order in the same pass (first field removal)', () => {
      const harmonized = harmonizeData(legacySheetWithoutManifest(), 'FULL_CHARACTER_SHEET');
      harmonized.cards.forEach((card) => expect(card).not.toHaveProperty('order'));
   });

   it('is idempotent: a sheet that already has a valid manifest passes through', () => {
      const sheet = { ...legacySheetWithoutManifest(), sheetLayout: [{ kind: 'card', id: 'c2' }, { kind: 'journal', id: 'j1' }, { kind: 'card', id: 'c1' }] } as unknown as Character;
      const harmonized = harmonizeData(sheet, 'FULL_CHARACTER_SHEET');
      // The pre-existing (hand-sorted) manifest is preserved, not rebuilt to the default order.
      expect(harmonized.sheetLayout).toEqual([
         { kind: 'card', id: 'c2' },
         { kind: 'journal', id: 'j1' },
         { kind: 'card', id: 'c1' },
      ]);
   });
});

describe('harmonization: tracker game strip', () => {
   it('drops the defunct game from every tracker on a character', () => {
      const character = {
         id: 'char-1', name: 'Hero', game: 'CITY_OF_MIST', version: '2.0.0', cards: [],
         trackers: {
            statuses: [{ id: 's1', name: 'Hurt', game: 'CITY_OF_MIST', trackerType: 'STATUS', tiers: [false] }],
            storyTags: [{ id: 't1', name: 'Tag', game: 'CITY_OF_MIST', trackerType: 'STORY_TAG', isScratched: false }],
            storyThemes: [{ id: 'h1', name: 'Theme', game: 'CITY_OF_MIST', trackerType: 'STORY_THEME', mainTag: { id: 'm', name: '', isActive: false, isScratched: false }, powerTags: [], weaknessTags: [] }],
         },
      } as unknown as Character;

      const harmonized = harmonizeData(character, 'FULL_CHARACTER_SHEET');

      expect(harmonized.trackers.statuses[0]).not.toHaveProperty('game');
      expect(harmonized.trackers.storyTags[0]).not.toHaveProperty('game');
      expect(harmonized.trackers.storyThemes[0]).not.toHaveProperty('game');
      // The character's own game is untouched.
      expect(harmonized.game).toBe('CITY_OF_MIST');
   });

   it('drops game from a standalone tracker drawer item', () => {
      const tracker = { id: 's1', name: 'Hurt', game: 'LEGENDS', trackerType: 'STATUS', tiers: [false] };
      const harmonized = harmonizeData(tracker, 'STATUS_TRACKER') as typeof tracker;
      expect(harmonized).not.toHaveProperty('game');
      expect(harmonized).toMatchObject({ trackerType: 'STATUS', name: 'Hurt' });
   });
});

/*
 * Drawer-level harmonization: the file-import leg hands a whole Drawer / Folder / loose item to
 * `harmonizeData`, which must recurse the tree and migrate each item - content AND wrapper. These
 * cases were the test gap that let the import-wiring bug survive.
 */

/** A tracker drawer-item wrapper (its own `game`) around a tracker content (its own `game`). */
function statusTrackerItem(id: string): DrawerItem {
   return {
      id,
      game: 'LEGENDS',
      type: 'STATUS_TRACKER',
      name: 'Wounded',
      content: { id: `${id}-c`, name: 'Wounded', game: 'LEGENDS', trackerType: 'STATUS', tiers: [false] },
   } as unknown as DrawerItem;
}

/** A pre-1.3.0 LEGENDS character-card wrapper whose backpack is the old `BlandTag[]` shape. */
function legacyBackpackCharacterCardItem(id: string): DrawerItem {
   return {
      id,
      game: 'LEGENDS',
      type: 'FULL_CHARACTER_SHEET',
      name: 'Adventurer',
      content: {
         id: `${id}-c`,
         name: 'Adventurer',
         game: 'LEGENDS',
         trackers: { statuses: [], storyTags: [], storyThemes: [] },
         cards: [
            {
               id: `${id}-card`,
               title: 'Backpack',
               order: 0,
               isFlipped: false,
               cardType: 'CHARACTER_CARD',
               details: { game: 'LEGENDS', backpack: [{ id: 'b1', name: 'Rope' }, { id: 'b2', name: 'Torch' }] },
            },
         ],
      },
   } as unknown as DrawerItem;
}

const trackerContent = (item: DrawerItem) => item.content as unknown as Record<string, unknown>;

describe('harmonization: drawer-level walk', () => {
   it('strips tracker content game and neutralizes the tracker wrapper on a full drawer', () => {
      const drawer: Drawer = {
         version: '1.3.1',
         folders: [],
         rootItems: [statusTrackerItem('s1')],
      };

      const harmonized = harmonizeData(drawer, 'FULL_DRAWER') as Drawer;
      const item = harmonized.rootItems[0];

      // Wrapper game SET to NEUTRAL (never deleted - the preview label reads it).
      expect(item.game).toBe('NEUTRAL');
      expect(item).toHaveProperty('game');
      // Content game stripped.
      expect(trackerContent(item)).not.toHaveProperty('game');
      expect(trackerContent(item)).toMatchObject({ trackerType: 'STATUS', name: 'Wounded' });
   });

   it('upgrades a Hero backpack BlandTag[] to Tag[] through the drawer walk', () => {
      const drawer: Drawer = {
         version: '1.2.0',
         folders: [],
         rootItems: [legacyBackpackCharacterCardItem('h1')],
      };

      const harmonized = harmonizeData(drawer, 'FULL_DRAWER') as Drawer;
      const character = harmonized.rootItems[0].content as unknown as Character;
      const backpack = (character.cards[0].details as unknown as { backpack: Array<Record<string, unknown>> }).backpack;

      // BlandTag { id, name } becomes Tag { id, name, isActive, isScratched }.
      expect(backpack).toHaveLength(2);
      backpack.forEach((tag) => {
         expect(tag).toMatchObject({ isActive: false, isScratched: false });
         expect(typeof tag.name).toBe('string');
      });
      expect(backpack[0]).toMatchObject({ name: 'Rope' });
   });

   it('recurses into nested folders, migrating items at every depth', () => {
      const drawer: Drawer = {
         version: '1.3.1',
         folders: [
            {
               id: 'f1',
               name: 'Outer',
               items: [statusTrackerItem('nested-1')],
               folders: [
                  { id: 'f2', name: 'Inner', items: [statusTrackerItem('nested-2')], folders: [] },
               ],
            },
         ],
         rootItems: [],
      };

      const harmonized = harmonizeData(drawer, 'FULL_DRAWER') as Drawer;
      const outerItem = harmonized.folders[0].items[0];
      const innerItem = harmonized.folders[0].folders[0].items[0];

      for (const item of [outerItem, innerItem]) {
         expect(item.game).toBe('NEUTRAL');
         expect(trackerContent(item)).not.toHaveProperty('game');
      }
   });

   it('migrates a loose folder import (harmonizeData with FOLDER)', () => {
      const folder = {
         id: 'f1',
         name: 'Loose',
         items: [statusTrackerItem('loose-1')],
         folders: [],
      };

      const harmonized = harmonizeData(folder, 'FOLDER') as typeof folder;
      const item = harmonized.items[0];

      expect(item.game).toBe('NEUTRAL');
      expect(trackerContent(item)).not.toHaveProperty('game');
   });

   it('migrates a loose imported tracker (bare content, not wrapped)', () => {
      // The loose-item import path passes the bare content with its type, not a DrawerItem wrapper.
      const tracker = { id: 's1', name: 'Bleeding', game: 'CITY_OF_MIST', trackerType: 'STATUS', tiers: [false, false] };
      const harmonized = harmonizeData(tracker, 'STATUS_TRACKER') as typeof tracker;

      expect(harmonized).not.toHaveProperty('game');
      expect(harmonized).toMatchObject({ trackerType: 'STATUS', name: 'Bleeding' });
   });

   it('is idempotent: a second drawer walk changes nothing', () => {
      const drawer: Drawer = {
         version: '1.3.1',
         folders: [{ id: 'f1', name: 'F', items: [statusTrackerItem('s1')], folders: [] }],
         rootItems: [statusTrackerItem('s2')],
      };

      const once = harmonizeData(drawer, 'FULL_DRAWER') as Drawer;
      const twice = harmonizeData(structuredClone(once), 'FULL_DRAWER') as Drawer;
      expect(twice).toEqual(once);
   });
});

/*
 * Import-path guard: the drawer file-import must harmonize the parsed payload before persisting
 * (the wiring gap). This asserts the exact call the hook now makes - `harmonizeData(content,
 * 'FULL_DRAWER')` on a raw 1.x drawer - yields a fully-migrated payload, so an un-harmonized drawer
 * can no longer reach the store.
 */
describe('harmonization: drawer file-import path', () => {
   it('a raw 1.x FULL_DRAWER payload is fully migrated by the import harmonize call', () => {
      // Shape of `importedData.content` for a FULL_DRAWER file, verbatim from a 1.x export.
      const rawImportedContent: Drawer = {
         version: '1.3.1',
         folders: [{ id: 'f1', name: 'Party', items: [legacyBackpackCharacterCardItem('h1')], folders: [] }],
         rootItems: [statusTrackerItem('s1')],
      };

      // Exactly what useDrawerFileImport / useMobileMenuFileImport now do before importDrawerAsFolder.
      const migrated = harmonizeData(rawImportedContent, 'FULL_DRAWER') as Drawer;

      const looseTracker = migrated.rootItems[0];
      expect(looseTracker.game).toBe('NEUTRAL');
      expect(trackerContent(looseTracker)).not.toHaveProperty('game');

      const character = migrated.folders[0].items[0].content as unknown as Character;
      const backpack = (character.cards[0].details as unknown as { backpack: Array<Record<string, unknown>> }).backpack;
      expect(backpack[0]).toMatchObject({ isActive: false, isScratched: false });
   });
});

/*
 * Version-gated migrator coverage: the 1.0.2 storyThemes backfill and the OTHERSCAPE `specials` /
 * CITY_OF_MIST `nemeses` legs of the 1.3.0 tag-list upgrade were covered code with no test - a regression
 * could have silently disabled them. These lock them in.
 */
describe('harmonization: 1.0.2 storyThemes backfill', () => {
   it('adds an empty storyThemes array to a pre-1.0.2 sheet whose trackers lack it', () => {
      const sheet = {
         id: 'c1', name: 'Hero', game: 'LEGENDS', version: '1.0.0',
         cards: [], journals: [], sheetLayout: [],
         trackers: { statuses: [], storyTags: [] }, // no storyThemes at 1.0.0
      } as unknown as Character;

      const harmonized = harmonizeData(sheet, 'FULL_CHARACTER_SHEET');
      expect(Array.isArray(harmonized.trackers.storyThemes)).toBe(true);
      expect(harmonized.trackers.storyThemes).toEqual([]);
   });
});

describe('harmonization: 1.3.0 tag-list upgrade (all three lists)', () => {
   const bland = (name: string) => ({ id: `t-${name}`, name });

   it('upgrades OTHERSCAPE character-card specials from BlandTag[] to Tag[]', () => {
      const sheet = {
         id: 'c1', name: 'Runner', game: 'OTHERSCAPE', version: '1.2.0',
         cards: [{ id: 'card', title: '', order: 0, isFlipped: false, cardType: 'CHARACTER_CARD', details: { game: 'OTHERSCAPE', specials: [bland('Augmented')] } }],
         journals: [], sheetLayout: [], trackers: { statuses: [], storyTags: [], storyThemes: [] },
      } as unknown as Character;

      const harmonized = harmonizeData(sheet, 'FULL_CHARACTER_SHEET');
      const specials = (harmonized.cards[0].details as unknown as { specials: Array<Record<string, unknown>> }).specials;
      expect(specials[0]).toMatchObject({ name: 'Augmented', isActive: false, isScratched: false });
   });

   it('upgrades CITY_OF_MIST character-card nemeses from BlandTag[] to Tag[]', () => {
      const sheet = {
         id: 'c1', name: 'Detective', game: 'CITY_OF_MIST', version: '1.2.0',
         cards: [{ id: 'card', title: '', order: 0, isFlipped: false, cardType: 'CHARACTER_CARD', details: { game: 'CITY_OF_MIST', nemeses: [bland('The Cabal')] } }],
         journals: [], sheetLayout: [], trackers: { statuses: [], storyTags: [], storyThemes: [] },
      } as unknown as Character;

      const harmonized = harmonizeData(sheet, 'FULL_CHARACTER_SHEET');
      const nemeses = (harmonized.cards[0].details as unknown as { nemeses: Array<Record<string, unknown>> }).nemeses;
      expect(nemeses[0]).toMatchObject({ name: 'The Cabal', isActive: false, isScratched: false });
   });
});

describe('harmonization: standalone drawer card', () => {
   it('upgrades a BARE CHARACTER_CARD (no version) via the default 1.0.0 branch, and drops its order', () => {
      // The exact shape a standalone drawer character-card takes on import: no `version`, so it enters via
      // hasRegisteredMigration defaulting to '1.0.0' and runs the idempotent 1.3.0 upgrade.
      const card = { id: 'card', title: '', order: 3, isFlipped: false, cardType: 'CHARACTER_CARD', details: { game: 'OTHERSCAPE', specials: [{ id: 's1', name: 'Cyberarm' }] } };

      const harmonized = harmonizeData(card, 'CHARACTER_CARD') as typeof card;
      const specials = (harmonized.details as unknown as { specials: Array<Record<string, unknown>> }).specials;
      expect(specials[0]).toMatchObject({ name: 'Cyberarm', isActive: false, isScratched: false });
      expect(harmonized).not.toHaveProperty('order'); // A-1: standalone cards drop the defunct order
   });

   it('drops the defunct order from a standalone theme card too', () => {
      const card = { id: 't', title: '', order: 2, isFlipped: false, cardType: 'CHARACTER_THEME', details: { game: 'LEGENDS' } };
      const harmonized = harmonizeData(card, 'CHARACTER_THEME') as typeof card;
      expect(harmonized).not.toHaveProperty('order');
   });
});

// -- PDF pass-through --
describe('harmonization: pdf content pass-through', () => {
   it('leaves a PDF content with annotations untouched (harmonizer knows no PDF migration)', () => {
      const content = {
         id: 'pdf-1',
         title: 'Rulebook',
         assetHash: 'hash-a',
         pageCount: 42,
         annotations: {
            a1: { id: 'a1', kind: 'ink', page: 1, color: '#e11d48', createdAt: 1, points: [0.1, 0.1, 0.2, 0.2], width: 0.01 },
         },
      };

      const harmonized = harmonizeData(structuredClone(content), 'PDF');
      expect(harmonized).toEqual(content);
   });
});
