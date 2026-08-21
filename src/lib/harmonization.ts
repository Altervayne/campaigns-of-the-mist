import { APP_VERSION } from "./config";
import { compare } from 'semver';
import { LEGACY_IMAGE_CARD_SIZE } from './constants/imageCard';
import { buildSheetLayout } from './character/sheetLayout';
import type { GeneralItemType, Drawer, DrawerItem, Folder } from './types/drawer';
import type { Card, Character, Tag } from './types/character';



function isDrawer(data: unknown): data is Drawer {
  return !!data && typeof data === 'object' && 'rootItems' in data && 'folders' in data && !('content' in data);
}
function isFolder(data: unknown): data is Folder {
  return !!data && typeof data === 'object' && 'items' in data && 'folders' in data && !('rootItems' in data);
}
function isDrawerItem(data: unknown): data is DrawerItem {
  return !!data && typeof data === 'object' && 'content' in data && 'type' in data && 'id' in data;
}
function isCharacter(data: unknown): data is Character {
  return !!data && typeof data === 'object' && 'cards' in data && 'trackers' in data;
}
function isCard(data: unknown): data is Card {
  return !!data && typeof data === 'object' && 'cardType' in data && 'details' in data;
}
function isVersionable(data: unknown): data is { version?: string } {
    return !!data && typeof data === 'object' && 'version' in data;
}



/**
 * Idempotently upgrades a legacy `BlandTag[]` shape ({ id, name }) to the full
 * `Tag` shape ({ id, name, isActive, isScratched }). Used by the 1.3.0 migrator
 * for the character-card tag lists (Hero backpack, Otherscape specials, Rift
 * nemeses) that gained activation + burn. Safe to re-run on data that already
 * has the new shape - existing booleans pass through unchanged.
 */
const upgradeBlandToTagList = (list: unknown): Tag[] => {
   if (!Array.isArray(list)) return [];
   return list.map((item) => {
      const tag = (item ?? {}) as { id?: string; name?: string; isActive?: unknown; isScratched?: unknown };
      return {
         id: typeof tag.id === 'string' ? tag.id : '',
         name: typeof tag.name === 'string' ? tag.name : '',
         isActive: typeof tag.isActive === 'boolean' ? tag.isActive : false,
         isScratched: typeof tag.isScratched === 'boolean' ? tag.isScratched : false,
      };
   });
};

/**
 * 1.3.0 character-card tag-list upgrade: converts Hero backpack, Otherscape
 * Character specials, and Rift nemeses from `BlandTag[]` to `Tag[]` so each
 * entry can be activated and burned like a power tag. Idempotent.
 */
const upgradeCharacterCardTagLists = (card: Card): Card => {
   if (card.cardType !== 'CHARACTER_CARD') return card;
   const details = card.details as unknown as Record<string, unknown>;
   const game = details.game;
   if (game === 'LEGENDS' && Array.isArray(details.backpack)) {
      return { ...card, details: { ...card.details, backpack: upgradeBlandToTagList(details.backpack) } as Card['details'] };
   }
   if (game === 'OTHERSCAPE' && Array.isArray(details.specials)) {
      return { ...card, details: { ...card.details, specials: upgradeBlandToTagList(details.specials) } as Card['details'] };
   }
   if (game === 'CITY_OF_MIST' && Array.isArray(details.nemeses)) {
      return { ...card, details: { ...card.details, nemeses: upgradeBlandToTagList(details.nemeses) } as Card['details'] };
   }
   return card;
};



/**
 * Normalizes an IMAGE_CARD: backfills a missing `width`/`height` with the legacy
 * 250x600 footprint (so cards created before resizable image cards keep their look),
 * and normalizes `game` to `'NEUTRAL'` (image cards are game-agnostic; older ones
 * recorded the game they were created in). Idempotent and version-independent: an
 * already-normalized card passes through unchanged.
 */
const ensureImageCardSize = (card: Card): Card => {
   if (card.cardType !== 'IMAGE_CARD') return card;
   const details = card.details as unknown as { width?: unknown; height?: unknown; game?: unknown };
   const hasWidth = typeof details.width === 'number';
   const hasHeight = typeof details.height === 'number';
   const isNeutral = details.game === 'NEUTRAL';
   if (hasWidth && hasHeight && isNeutral) return card;
   return {
      ...card,
      details: {
         ...card.details,
         game: 'NEUTRAL',
         width: hasWidth ? (details.width as number) : LEGACY_IMAGE_CARD_SIZE.width,
         height: hasHeight ? (details.height as number) : LEGACY_IMAGE_CARD_SIZE.height,
      } as Card['details'],
   };
};


/**
 * Backfills the `journals` array on a character: sheet journals are a 2.0 addition, so a 1.x
 * `FULL_CHARACTER_SHEET` imported through the harmonizer arrives without the field and code
 * reading `character.journals` would crash. Idempotent and version-independent - a sheet that
 * already carries the array passes through unchanged.
 */
const ensureCharacterJournals = (character: Character): Character => {
   if (Array.isArray(character.journals)) return character;
   return { ...character, journals: [] };
};

/**
 * Drops the defunct `order` from a card: the sheet's ordered layout lives in `character.sheetLayout`
 * now, so `Card.order` is dead weight (it only ever mirrored the array index). The FIRST field
 * removal - idempotent, and a card without it passes through unchanged.
 */
const dropCardOrder = (card: Card): Card => {
   if (!('order' in card)) return card;
   const rest = { ...(card as Card & { order?: unknown }) };
   delete rest.order;
   return rest;
};

/**
 * Backfills the sheet layout manifest: order used to live on the (now-removed) `Card.order` and an
 * implicit cards-then-journals render; the manifest makes it explicit. A 1.x sheet arrives without
 * it, so build the behavior-preserving default (every card in array order, then every journal).
 * Idempotent - a sheet that already carries a manifest passes through unchanged.
 */
const ensureSheetLayout = (character: Character): Character => {
   if (Array.isArray(character.sheetLayout)) return character;
   return { ...character, sheetLayout: buildSheetLayout(character) };
};

/**
 * Drops the defunct `game` from a tracker: trackers are theme-agnostic now and render from their
 * context character's game (the app theme when there is none), so a stored `game` is dead weight.
 * Idempotent - a tracker without the field passes through unchanged.
 */
const stripTrackerGame = (tracker: unknown): unknown => {
   if (!tracker || typeof tracker !== 'object' || !('game' in tracker)) return tracker;
   const rest = { ...(tracker as Record<string, unknown>) };
   delete rest.game;
   return rest;
};

/** Drops `game` from every tracker on a character (all three lists). */
const stripCharacterTrackerGames = (character: Character): Character => {
   const trackers = character.trackers;
   if (!trackers) return character;
   return {
      ...character,
      trackers: {
         ...trackers,
         statuses: (trackers.statuses ?? []).map(stripTrackerGame) as Character['trackers']['statuses'],
         storyTags: (trackers.storyTags ?? []).map(stripTrackerGame) as Character['trackers']['storyTags'],
         storyThemes: (trackers.storyThemes ?? []).map(stripTrackerGame) as Character['trackers']['storyThemes'],
      },
   };
};

/** The drawer-item types whose content IS a single tracker. */
const TRACKER_ITEM_TYPES: ReadonlySet<GeneralItemType> = new Set(['STATUS_TRACKER', 'STORY_TAG_TRACKER', 'STORY_THEME_TRACKER']);


type MigrationFunction = (data: unknown) => unknown;

const MIGRATIONS: Record<string, Partial<Record<GeneralItemType, MigrationFunction>>> = {
   '1.0.2': {
      FULL_CHARACTER_SHEET: (data: unknown): unknown => {
         if (isCharacter(data)) {
            if (data.trackers && !data.trackers.storyThemes) {
               data.trackers.storyThemes = [];
            }
         }
         return data;
      },
   },
   '1.3.0': {
      // Loaded character sheets: walk each card and upgrade the relevant tag list.
      FULL_CHARACTER_SHEET: (data: unknown): unknown => {
         if (!isCharacter(data)) return data;
         return { ...data, cards: data.cards.map(upgradeCharacterCardTagLists) };
      },
      // Standalone character cards saved in the drawer get the same upgrade.
      // Cards do not carry their own `version` field, so the harmonizer enters
      // this migration via the `hasRegisteredMigration` branch (defaulting to
      // version '1.0.0'); the idempotent upgrade keeps re-runs safe.
      CHARACTER_CARD: (data: unknown): unknown => {
         if (!isCard(data)) return data;
         return upgradeCharacterCardTagLists(data);
      },
   },
};

const MIGRATION_VERSIONS = Object.keys(MIGRATIONS).sort(compare);

const hasRegisteredMigration = (dataType: GeneralItemType): boolean =>
   MIGRATION_VERSIONS.some((version) => MIGRATIONS[version][dataType] !== undefined);



// Accepts any envelope item type the importers pass. A type with no registered migration (e.g. the
// 2.0-native CUSTOM_THEME and CARD_PALETTE) has nothing to migrate and passes straight through unchanged.
export function harmonizeData<T extends object>(data: T, dataType: GeneralItemType | 'CUSTOM_THEME' | 'CARD_PALETTE' | 'STENCIL'): T {
   if (!data || typeof data !== 'object') {
      return data;
   }

   let harmonizedData: unknown = data;

   // ==================
   //  STEP 1: Harmonize the current object based on its specific type
   // ==================
   // The extra `hasRegisteredMigration` branch is the catch-all for data that
   // doesn't carry its own `version` field but is targeted by a migration (e.g.
   // standalone Cards stored in the drawer). Such data defaults to '1.0.0' and
   // re-runs its migrations on every load - migration functions for those types
   // must therefore be idempotent.
   if (isVersionable(harmonizedData) || isCharacter(harmonizedData) || isDrawer(harmonizedData) || hasRegisteredMigration(dataType as GeneralItemType)) {
      let currentVersion = (isVersionable(harmonizedData) && harmonizedData.version) || '1.0.0';

      for (const targetVersion of MIGRATION_VERSIONS) {
         if (compare(targetVersion, currentVersion) > 0) {
            const versionMigrations = MIGRATIONS[targetVersion];
            const migrate = versionMigrations[dataType as GeneralItemType];

            if (migrate) {
               harmonizedData = migrate(data);
            }

            if (isVersionable(harmonizedData)) {
                harmonizedData.version = targetVersion;
            }
            currentVersion = targetVersion;
         }
      }

      if (!isVersionable(harmonizedData) || !harmonizedData.version || compare(APP_VERSION, harmonizedData.version) > 0) {
         if(isVersionable(harmonizedData)) {
            harmonizedData.version = APP_VERSION;
         }
      }
   }

   // ==================
   //  STEP 1.5: Backfill image-card sizes (unconditional, idempotent)
   // ==================
   // Image cards gained a persisted display size; cards that predate it are filled
   // with the legacy footprint. This is NOT version-gated (cards carry no version and
   // saved characters already sit at the current version), so it runs on every load.
   if (isCharacter(harmonizedData)) {
      // Card path: backfill image sizes AND drop the defunct `Card.order` (order lives in the manifest now).
      harmonizedData = { ...harmonizedData, cards: harmonizedData.cards.map((card) => dropCardOrder(ensureImageCardSize(card))) };
      harmonizedData = stripCharacterTrackerGames(harmonizedData as Character);
      harmonizedData = ensureCharacterJournals(harmonizedData as Character);
      // The manifest backfill reads the final cards + journals, so it runs last.
      harmonizedData = ensureSheetLayout(harmonizedData as Character);
   } else if (isCard(harmonizedData)) {
      // A standalone drawer card (any type) drops its defunct `Card.order`; only an IMAGE_CARD also needs the
      // size/game backfill. `dropCardOrder` no-ops when `order` is already absent, so this is idempotent.
      harmonizedData = dropCardOrder(dataType === 'IMAGE_CARD' ? ensureImageCardSize(harmonizedData) : harmonizedData);
   } else if (TRACKER_ITEM_TYPES.has(dataType as GeneralItemType)) {
      // A standalone tracker saved in the drawer: its content IS the tracker; drop its dead `game`.
      harmonizedData = stripTrackerGame(harmonizedData);
   }

   // ==================
   //  STEP 2: Check for container properties and RECURSE
   // ==================
   if (isDrawer(harmonizedData)) {
      harmonizedData.rootItems = harmonizedData.rootItems.map(item => harmonizeData(item, item.type));
      harmonizedData.folders = harmonizedData.folders.map(folder => harmonizeData(folder, 'FOLDER'));
   } else if (isFolder(harmonizedData)) {
      harmonizedData.items = harmonizedData.items.map(item => harmonizeData(item, item.type));
      harmonizedData.folders = harmonizedData.folders.map(subFolder => harmonizeData(subFolder, 'FOLDER'));
   } else if (isDrawerItem(harmonizedData)) {
      harmonizedData.content = harmonizeData(harmonizedData.content, harmonizedData.type);
      // The item WRAPPER carries its own `game`, read by DrawerItemPreview for the type label.
      // Trackers are theme-agnostic now, so a tracker wrapper is forced to NEUTRAL - SET, never
      // delete: an absent `game` breaks the `t('Drawer.Types.<game>')` label. Idempotent.
      if (TRACKER_ITEM_TYPES.has(harmonizedData.type)) {
         harmonizedData.game = 'NEUTRAL';
      }
   }

   return harmonizedData as T;
}