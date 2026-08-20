// -- Local Imports --
import { listCharacters } from '@/lib/character/characterRepository';
import { listAllItemContents } from '@/lib/drawer/drawerRepository';
import { listAllBoardItems } from '@/lib/board/boardRepository';
import { listAllNotes } from '@/lib/notes/noteRepository';
import { collectFromNote } from '@/lib/notes/noteAssets';

// -- Type Imports --
import type { Card, Character } from '@/lib/types/character';
import type { DrawerItemContent } from '@/lib/types/drawer';
import type { Board, BoardItemContent, Note } from '@/lib/types/board';
import type { BoardItemRecord } from '@/lib/board/boardRecords';

/*
 * The "mark" side of asset garbage collection: walks every place an asset id can
 * appear and returns the set of referenced hashes. Sources its data through the
 * repositories (never raw `db`), so a new reference domain (e.g. the Board) registers
 * its read + extractor here, in one place.
 *
 * A reference is any card's `details.assetId` that is a non-null string. It is a
 * pure presence check, NOT gated on `cardType`: the `IMAGE_CARD` type does not exist
 * yet, so this matches nothing today, and lights up automatically once cards start
 * carrying an `assetId` - the consumer series needs no change here.
 */

/** Adds a card's `details.assetId` to `into` when present. Forward-compatible: the field need not exist yet. */
function collectFromCard(card: Card, into: Set<string>): void {
   const assetId = (card.details as { assetId?: unknown }).assetId;
   if (typeof assetId === 'string' && assetId.length > 0) into.add(assetId);
}

/** Walks every card on a character. */
function collectFromCharacter(character: Character, into: Set<string>): void {
   for (const card of character.cards) collectFromCard(card, into);
}

/**
 * A drawer item's content is a character (has `cards`), a board (has `viewport` + `items`),
 * a note (has `body`), a card (has `details`), or a tracker (none of these). A drawer-saved
 * board or note is an inline aggregate - its art is NOT in the normalized item tables - so it
 * is walked here (otherwise a saved-then-closed board/note's images would be reclaimed).
 */
function collectFromItemContent(content: DrawerItemContent, into: Set<string>): void {
   if (Array.isArray((content as Character).cards)) {
      collectFromCharacter(content as Character, into);
   } else if ('viewport' in content && Array.isArray((content as Board).items)) {
      for (const item of (content as Board).items) collectFromBoardItemContent(item.content, into);
   } else if (typeof (content as Note).body === 'string') {
      collectFromNote(content as Note, into);
   } else if ('details' in content) {
      collectFromCard(content as Card, into);
   }
   // Trackers hold no asset references.
}

/**
 * Adds a board item's asset references to `into`: a native `image` item's `assetId`, an embedded `card`
 * COPY's card art (e.g. a dropped IMAGE_CARD), a `note` COPY's cover + inline body images, and a `portal`'s
 * image visual (poster or composed). A copy note is self-contained in `content.data` and is NOT in `db.notes`,
 * so its art is reachable ONLY here - without this branch the sweep would reclaim it; likewise a portal's image
 * lives only on the board item. Trackers carry no assets, and a reference item holds no copy - its source
 * (drawer item / working note) is scanned separately - so neither contributes here.
 */
function collectFromBoardItemContent(content: BoardItemContent, into: Set<string>): void {
   if (content.kind === 'image') {
      // A stenciled image references TWO assets: the baked `assetId` AND the kept `sourceAssetId`
      // (the pre-mask original re-mask/reset re-runs on). Both must count, or masking would strand
      // the source for the sweep to reclaim.
      if (content.assetId) into.add(content.assetId);
      if (content.sourceAssetId) into.add(content.sourceAssetId);
      return;
   }
   if (content.kind === 'card' && content.mode === 'copy' && content.data && typeof content.data === 'object' && 'details' in content.data) {
      collectFromCard(content.data as Card, into);
   }
   if (content.kind === 'note' && content.mode === 'copy') {
      collectFromNote(content.data, into);
   }
   if (content.kind === 'portal' && content.style.visual?.kind === 'image') {
      into.add(content.style.visual.assetId);
   }
}

function collectFromBoardItem(item: BoardItemRecord, into: Set<string>): void {
   collectFromBoardItemContent(item.content, into);
}

/**
 * Collects every asset hash currently referenced anywhere in stored data: every
 * character's cards, every drawer item whose content is a card / character / note, every
 * board's image items, and every WORKING note's inline images (the `notes` table - an
 * open note's images aren't in the drawer until it is saved).
 *
 * @returns The set of referenced hashes. Anything in the asset store NOT in this
 *   set is an orphan candidate for the sweep (subject to the grace window).
 */
export async function collectReferencedAssetHashes(): Promise<Set<string>> {
   const referenced = new Set<string>();

   const [characterRecords, itemContents, boardItems, notes] = await Promise.all([
      listCharacters(),
      listAllItemContents(),
      listAllBoardItems(),
      listAllNotes(),
   ]);

   for (const record of characterRecords) collectFromCharacter(record.character, referenced);
   for (const content of itemContents) collectFromItemContent(content, referenced);
   for (const item of boardItems) collectFromBoardItem(item, referenced);
   for (const note of notes) collectFromNote(note, referenced);

   return referenced;
}
