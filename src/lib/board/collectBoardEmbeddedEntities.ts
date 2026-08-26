// -- Board Imports --
import { collectBoardReferencedCharacters } from './collectBoardReferencedCharacters';
import { collectBoardReferencedNotes } from './collectBoardReferencedNotes';
import { collectBoardReferencedPdfs } from './collectBoardReferencedPdfs';

// -- Type Imports --
import type { Board } from '@/lib/types/board';
import type { EmbeddedEntities } from '@/lib/utils/export-import';

/*
 * The one place a board export gathers the FULL data of every entity its tiles only reference - the
 * characters behind character elements, the notes behind reference note tiles, and the byteless pdf stubs
 * behind pdf portals - so those live references survive on another machine. Shared by every export entry
 * point, so a site can't embed one kind and forget another. Returns `undefined` when nothing needs embedding
 * (a board of copies / native items alone).
 */
export async function collectBoardEmbeddedEntities(board: Board): Promise<EmbeddedEntities | undefined> {
   const characters = await collectBoardReferencedCharacters(board);
   const notes = await collectBoardReferencedNotes(board);
   const pdfs = await collectBoardReferencedPdfs(board);

   const hasCharacters = Object.keys(characters).length > 0;
   const hasNotes = Object.keys(notes).length > 0;
   const hasPdfs = Object.keys(pdfs).length > 0;
   if (!hasCharacters && !hasNotes && !hasPdfs) return undefined;

   return {
      ...(hasCharacters ? { characters } : {}),
      ...(hasNotes ? { notes } : {}),
      ...(hasPdfs ? { pdfs } : {}),
   };
}
