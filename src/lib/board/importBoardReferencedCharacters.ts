// -- Library Imports --
import cuid from 'cuid';

// -- Board Imports --
import { reIdBoardAggregate } from './reIdBoardAggregate';

// -- Drawer Imports --
import { createFolder, createItem, getCharacterItemIdMap } from '@/lib/drawer/drawerRepository';

// -- Board Imports --
import { rehydrateBoardReferencedNotes, rewireBoardNoteReferences } from './importBoardReferencedNotes';
import { rehydrateBoardReferencedPdfs } from './importBoardReferencedPdfs';

// -- Type Imports --
import type { Board, CharacterBoardContent } from '@/lib/types/board';
import type { Character } from '@/lib/types/character';
import type { EmbeddedEntities } from '@/lib/utils/export-import';

/*
 * The board-import counterpart to the export-side character embed: a board file carries the full data
 * of every character its elements reference, and here we turn that data into local characters and point
 * the elements at them. Dedup is by the PRESERVED character id (a globally-unique cuid, the same on
 * every machine): a character already in the drawer is LINKED (never duplicated, never overwritten); an
 * absent one is recreated keeping its id. The embedded portraits are already restored by importFromFile.
 */

/**
 * Links or recreates the characters an imported board references, returning a map from each source
 * `characterId` to the LOCAL drawer item id backing it (for the element rewire). A character already in
 * the drawer is linked to its existing item; an absent one is created as a FULL_CHARACTER_SHEET drawer
 * item with its id kept. `ensureFolder` lazily makes (and memoizes) the shared "Imported from {board}"
 * landing folder - called only when a character is actually recreated, so pure links create no folder.
 */
export async function rehydrateBoardReferencedCharacters(
   characters: Record<string, Character> | undefined,
   ensureFolder: () => Promise<string>,
): Promise<Map<string, string>> {
   const drawerItemIdByCharacterId = new Map<string, string>();
   if (!characters) return drawerItemIdByCharacterId;

   const existing = await getCharacterItemIdMap();

   for (const [characterId, character] of Object.entries(characters)) {
      const existingItemId = existing.get(characterId);
      if (existingItemId) {
         drawerItemIdByCharacterId.set(characterId, existingItemId); // link, never overwrite
         continue;
      }

      // The drawer item gets a fresh id; the character keeps its own (the dedup key). Pre-mint the
      // item id so the character's `drawerItemId` can point back to it in a single write.
      const drawerItemId = cuid();
      await createItem({
         id: drawerItemId,
         name: character.name,
         game: character.game,
         type: 'FULL_CHARACTER_SHEET',
         content: { ...character, drawerItemId },
         parentFolderId: await ensureFolder(),
      });
      drawerItemIdByCharacterId.set(characterId, drawerItemId);
   }

   return drawerItemIdByCharacterId;
}

/**
 * Points every character element at its local drawer item: sets `sourceDrawerItemId` to the item id for
 * the element's `characterId` and clears the stale `lastKnown`. `characterId` is left as-is (it is the
 * preserved id and the tab key). An element whose character had no embed entry (unresolvable at export)
 * is left untouched, so it dangles as before. Pure - returns a new aggregate.
 */
export function rewireBoardCharacterElements(board: Board, drawerItemIdByCharacterId: Map<string, string>): Board {
   const items = board.items.map((item) => {
      if (item.content.kind !== 'character') return item;
      const sourceDrawerItemId = drawerItemIdByCharacterId.get(item.content.characterId);
      if (!sourceDrawerItemId) return item; // no embed for this reference - leave it dangling
      const content: CharacterBoardContent = { kind: 'character', characterId: item.content.characterId, sourceDrawerItemId };
      return { ...item, content };
   });
   return { ...board, items };
}

/**
 * The full board-import transform, shared by every import entry point: rehydrate the referenced characters,
 * notes, AND pdf placeholders (link/create), re-id the aggregate for a fresh independent copy, then rewire the
 * character elements + note reference tiles to the local drawer items. Pdf portals need no rewire - their
 * target id is preserved and the materialized placeholder keeps it. Everything recreated shares ONE
 * lazily-made "Imported from {board}" folder (created only if something is actually recreated). Returns the
 * board ready to persist.
 */
export async function prepareImportedBoard(
   board: Board,
   embedded: EmbeddedEntities | undefined,
   importedFolderName: string,
): Promise<Board> {
   // One shared, lazily-created landing folder for every recreated entity, so a mixed import doesn't scatter
   // (or make two identically-named folders), and a pure-link import makes none.
   let importedFolderId: string | null = null;
   const ensureFolder = async (): Promise<string> => {
      if (importedFolderId === null) importedFolderId = (await createFolder({ name: importedFolderName, parentFolderId: null })).id;
      return importedFolderId;
   };

   const drawerItemIdByCharacterId = await rehydrateBoardReferencedCharacters(embedded?.characters, ensureFolder);
   const drawerItemIdByNoteId = await rehydrateBoardReferencedNotes(embedded?.notes, ensureFolder);
   await rehydrateBoardReferencedPdfs(embedded?.pdfs, ensureFolder);

   const reIded = reIdBoardAggregate(board);
   const rewiredCharacters = rewireBoardCharacterElements(reIded, drawerItemIdByCharacterId);
   return rewireBoardNoteReferences(rewiredCharacters, drawerItemIdByNoteId);
}
