// -- Other Library Imports --
import cuid from 'cuid';

// -- Utils Imports --
import { deepReId } from '@/lib/utils/drawer';
import { reIdCharacterAggregate } from '@/lib/character/reIdCharacterAggregate';

// -- Type Imports --
import type { DrawerItemContent, Folder, GeneralItemType } from '@/lib/types/drawer';
import type { Character } from '@/lib/types/character';

/*
 * Cross-reference-safe re-identification of imported drawer content. Importing a copy needs fresh ids so it
 * can't collide with existing rows, but a blind `deepReId` over a whole subtree breaks the cross-references
 * some content carries (a character's sheet-layout manifest + journal bookmarks, a board's connections + zone
 * membership, a journal's bookmark->page links). So each item is re-ID'd BY TYPE, exactly as the single-item
 * `addItem` / `addImportedItem` paths already do - this is the shared seam so the tree-import path can't drift
 * from them.
 */

/**
 * Re-IDs one imported item's content according to its type:
 *   - FULL_BOARD / JOURNAL / NOTE / ROLL_TABLE / PDF keep their content verbatim (self-contained in the file;
 *     the id keys a focus-or-open round-trip, and reminting internals would orphan connections / bookmarks or a
 *     roll table's `lastRoll` / `history` entry cross-refs). A PDF's id keys its open/working-row round-trip;
 *     `assetHash` is not an id field, so it survives untouched.
 *   - FULL_CHARACTER_SHEET routes through the aggregate re-id that keeps its manifest + bookmarks consistent.
 *   - everything else is a cross-ref-free card / tracker / post-it, deep-re-ID'd so the copy is independent.
 */
export function reIdImportedItemContent(type: GeneralItemType, content: DrawerItemContent): DrawerItemContent {
   if (type === 'FULL_BOARD' || type === 'JOURNAL' || type === 'NOTE' || type === 'ROLL_TABLE' || type === 'PDF') return content;
   if (type === 'FULL_CHARACTER_SHEET') return reIdCharacterAggregate(content as Character);
   return deepReId(content);
}

/**
 * Re-IDs a whole imported folder subtree: fresh folder ids, fresh item-wrapper ids, and each item's content
 * re-ID'd through {@link reIdImportedItemContent} (NOT a blanket `deepReId`, which would break the cross-refs
 * a nested character / board / journal carries). The input is left unmodified.
 */
export function reIdImportedFolderTree(folder: Folder): Folder {
   return {
      ...folder,
      id: cuid(),
      items: folder.items.map((item) => ({ ...item, id: cuid(), content: reIdImportedItemContent(item.type, item.content) })),
      folders: folder.folders.map(reIdImportedFolderTree),
   };
}
