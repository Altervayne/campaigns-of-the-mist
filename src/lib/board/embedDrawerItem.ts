// -- Constant Imports --
import { DEFAULT_IMAGE_CARD_SIZE, clampCardWidth, clampCardHeight } from '@/lib/constants/imageCard';

// -- Other Library Imports --
import cuid from 'cuid';

// -- Type Imports --
import type { DrawerItem, GeneralItemType } from '@/lib/types/drawer';
import type { CardBoardContent, TrackerBoardContent, ImageBoardContent, CharacterBoardContent, PostItBoardContent, PostItNote, JournalBoardContent, Journal, NoteBoardContent, Note, RollTableBoardContent } from '@/lib/types/board';
import type { Card, Character, ImageCardDetails, Tracker } from '@/lib/types/character';
import type { RollTableContent } from '@/lib/rolltable/types';

/*
 * Turns a card/tracker into the spec for a board item, whether it came from the drawer or straight
 * off the character sheet. A card/tracker drops as a COPY: the content is deep-copied so the board
 * item is self-contained and a later edit can never mutate it. A drawer-sourced copy also records
 * `sourceDrawerItemId`; a sheet component is a bare copy with no source. An IMAGE_CARD is just an
 * image, so it drops as the board's NATIVE image item (no embed, no copy/reference). Full sheets,
 * full boards, and folders are not droppable here and return `null` (the caller no-ops).
 */

/**
 * Native footprint (world units) of each tracker, matching the sheet component's fixed size, so the
 * embed box hugs the tracker (it carries its own border - the box stays bare). A status is `w-55 h-25`,
 * a story tag `w-55 h-13.75`, a story theme `w-62.5 h-55` (rem -> px at 16px/rem).
 */
export const EMBEDDED_TRACKER_SIZES: Record<string, { width: number; height: number }> = {
   STATUS: { width: 220, height: 100 },
   STORY_TAG: { width: 220, height: 55 },
   STORY_THEME: { width: 250, height: 220 },
};
/** Fallback when a tracker's type is unknown. */
const DEFAULT_TRACKER_SIZE = { width: 220, height: 100 } as const;

/** Native footprint of a theme / character card (the sheet's `w-62.5 h-150`); the embed renders at this size. */
export const EMBEDDED_CARD_SIZE = { width: 250, height: 600 } as const;

/**
 * Fixed landscape footprint of an EXPANDED challenge card (its board display mode). The box uses this
 * exact size instead of the portrait fit-width, so the expanded sheet gets its wide sheet dimensions.
 */
export const EXPANDED_CARD_SIZE = { width: 900, height: 560 } as const;

/** Default footprint of a character reference element. Wide enough that a theme row's type + themebook stay readable; the overview grows the height to fit its rows. */
export const CHARACTER_ELEMENT_SIZE = { width: 360, height: 132 } as const;

/** Native footprint of a re-embedded post-it, matching a fresh board sticky. */
export const EMBEDDED_POSTIT_SIZE = { width: 180, height: 180 } as const;

/** Native footprint of a re-embedded journal, matching a fresh board journal. */
export const EMBEDDED_JOURNAL_SIZE = { width: 260, height: 320 } as const;

/** Default footprint of a note reference tile: a flat handout wants a touch more height than a post-it. */
export const NOTE_ELEMENT_SIZE = { width: 260, height: 320 } as const;

/** Native footprint of a re-embedded roll table, matching a fresh board roll table (its creatable default size). */
export const EMBEDDED_ROLLTABLE_SIZE = { width: 240, height: 260 } as const;

// An IMAGE_CARD is NOT here: it drops as a native image item, not an embedded card.
const CARD_TYPES = new Set<GeneralItemType>(['CHARACTER_CARD', 'CHARACTER_THEME', 'GROUP_THEME', 'LOADOUT_THEME', 'CHALLENGE_CARD']);

/** The native footprint for an embedded tracker, by its `trackerType`. */
function trackerEmbedSize(trackerType: string | undefined): { width: number; height: number } {
   return (trackerType && EMBEDDED_TRACKER_SIZES[trackerType]) || DEFAULT_TRACKER_SIZE;
}

/** The spec for a board item built from a drawer item: its kind, default size, and content. */
export interface EmbeddedBoardSpec {
   kind: 'card' | 'tracker' | 'image' | 'character' | 'post-it' | 'journal' | 'note' | 'roll-table';
   width: number;
   height: number;
   content: CardBoardContent | TrackerBoardContent | ImageBoardContent | CharacterBoardContent | PostItBoardContent | JournalBoardContent | NoteBoardContent | RollTableBoardContent;
}

/**
 * The character reference element for a character dragged from a TAB onto the board, or `null` only
 * when there is no character. It works for a saved OR an unsaved character: the element keys on the
 * character's id (the live open-tab lookup), and records the saved drawer source when there is one (an
 * unsaved character has none - the element then reads live while the tab is open).
 */
export function characterElementSpec(character: { id: string; drawerItemId?: string } | null): EmbeddedBoardSpec | null {
   if (!character) return null;
   return {
      kind: 'character',
      width: CHARACTER_ELEMENT_SIZE.width,
      height: CHARACTER_ELEMENT_SIZE.height,
      content: { kind: 'character', characterId: character.id, sourceDrawerItemId: character.drawerItemId ?? undefined },
   };
}

/**
 * Builds the board-item spec for a bare sheet component (a `Card` or `Tracker`), or `null` when it is
 * not droppable. Keyed off the component's own discriminant (`cardType` / `trackerType`), which are the
 * same `GeneralItemType` / tracker-type values the drawer path keys off, so BOTH paths share this
 * mapping. The result is a self-contained COPY with NO `sourceDrawerItemId` (it is not from the drawer);
 * an IMAGE_CARD becomes the native image item. {@link embeddedSpecForDrawerItem} wraps this to layer the
 * drawer source id on and to add the full-sheet reference case.
 */
export function embeddedSpecForComponent(component: Card | Tracker | Journal): EmbeddedBoardSpec | null {
   // A bare Journal (no cardType/trackerType) drops as a self-contained COPY, no drawer source. Its
   // top-level id is regenerated so the board copy is independent, while pages keep their ids and the
   // bookmarks keep their `pageId` references (no stranded bookmark) - mirrors the drawer JOURNAL branch.
   if ('pages' in component && 'bookmarks' in component) {
      const journal = structuredClone(component);
      const data: Journal = { ...journal, id: cuid() };
      return {
         kind: 'journal',
         width: EMBEDDED_JOURNAL_SIZE.width,
         height: EMBEDDED_JOURNAL_SIZE.height,
         content: { kind: 'journal', mode: 'copy', data },
      };
   }
   if ('cardType' in component) {
      if (component.cardType === 'IMAGE_CARD') {
         const details = (component as { details?: ImageCardDetails }).details;
         return {
            kind: 'image',
            width: details?.width ? clampCardWidth(details.width) : DEFAULT_IMAGE_CARD_SIZE.width,
            height: details?.height ? clampCardHeight(details.height) : DEFAULT_IMAGE_CARD_SIZE.height,
            content: { kind: 'image', assetId: details?.assetId ?? null, fit: details?.fit ?? 'cover' },
         };
      }
      if (CARD_TYPES.has(component.cardType)) {
         return {
            kind: 'card',
            width: EMBEDDED_CARD_SIZE.width,
            height: EMBEDDED_CARD_SIZE.height,
            content: { kind: 'card', mode: 'copy', data: structuredClone(component) },
         };
      }
      return null;
   }
   if ('trackerType' in component && component.trackerType in EMBEDDED_TRACKER_SIZES) {
      const size = trackerEmbedSize(component.trackerType);
      return {
         kind: 'tracker',
         width: size.width,
         height: size.height,
         content: { kind: 'tracker', mode: 'copy', data: structuredClone(component) },
      };
   }
   return null;
}

/**
 * Builds the board-item spec for `item`, or `null` when the item is not droppable. A card/tracker
 * becomes an embedded COPY (deep-copied content, recording the source id); an image card becomes a
 * native image item; a saved full character sheet becomes a live read-only character REFERENCE.
 */
export function embeddedSpecForDrawerItem(item: DrawerItem): EmbeddedBoardSpec | null {
   if (item.type === 'FULL_CHARACTER_SHEET') {
      // A FULL_CHARACTER_SHEET's content is the Character; its id keys the open-tab lookup.
      const characterId = (item.content as Character).id;
      return {
         kind: 'character',
         width: CHARACTER_ELEMENT_SIZE.width,
         height: CHARACTER_ELEMENT_SIZE.height,
         content: { kind: 'character', sourceDrawerItemId: item.id, characterId },
      };
   }
   if (item.type === 'POST_IT') {
      // A saved post-it drops as a source-bearing COPY: a fresh note id makes the board copy independent
      // of the drawer twin, while `sourceDrawerItemId` keeps the Save write-back link.
      const note = item.content as PostItNote;
      const data: PostItNote = { ...note, id: cuid() };
      return {
         kind: 'post-it',
         width: EMBEDDED_POSTIT_SIZE.width,
         height: EMBEDDED_POSTIT_SIZE.height,
         content: { kind: 'post-it', mode: 'copy', sourceDrawerItemId: item.id, data },
      };
   }
   if (item.type === 'JOURNAL') {
      // A saved journal drops as a source-bearing COPY. Only the journal's TOP-LEVEL id is regenerated
      // (deep-cloned first, so the copy is independent of the drawer twin); the pages keep their ids and
      // the bookmarks keep their `pageId` references, so NO bookmark is stranded. A blind `deepReId` here
      // would rewrite every page id while leaving the differently-named `pageId` untouched, orphaning every
      // bookmark - the same landmine `addItem`/import exempt JOURNAL from, guarded here on the re-embed path.
      const journal = structuredClone(item.content as Journal);
      const data: Journal = { ...journal, id: cuid() };
      return {
         kind: 'journal',
         width: EMBEDDED_JOURNAL_SIZE.width,
         height: EMBEDDED_JOURNAL_SIZE.height,
         content: { kind: 'journal', mode: 'copy', sourceDrawerItemId: item.id, data },
      };
   }
   if (item.type === 'NOTE') {
      // A saved note drops as a LIVE read-only REFERENCE (editing is the note tab's job), keyed by the
      // note's id (the open-tab lookup) with the drawer item as its saved source - mirrors the character.
      const noteId = (item.content as Note).id;
      return {
         kind: 'note',
         width: NOTE_ELEMENT_SIZE.width,
         height: NOTE_ELEMENT_SIZE.height,
         content: { kind: 'note', mode: 'reference', noteId, sourceDrawerItemId: item.id },
      };
   }
   if (item.type === 'ROLL_TABLE') {
      // A saved roll table drops as a self-contained board COPY of its inline aggregate: deep-clone the
      // stored `RollTableContent` and re-add the board `kind`. There is no source link (the aggregate lives
      // in the content, so there is no drawer twin to write back to) - unlike a card/tracker copy.
      const table = structuredClone(item.content as RollTableContent);
      return {
         kind: 'roll-table',
         width: EMBEDDED_ROLLTABLE_SIZE.width,
         height: EMBEDDED_ROLLTABLE_SIZE.height,
         content: { kind: 'roll-table', ...table },
      };
   }
   // A drawer card/tracker wraps the same aggregate a sheet component is, so the shared mapping does
   // the work; the drawer path only layers its own `sourceDrawerItemId` onto an embedded copy.
   const spec = embeddedSpecForComponent(item.content as Card | Tracker);
   if (spec && (spec.content.kind === 'card' || spec.content.kind === 'tracker') && spec.content.mode === 'copy') {
      spec.content.sourceDrawerItemId = item.id;
   }
   return spec;
}
