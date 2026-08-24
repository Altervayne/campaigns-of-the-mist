// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import * as repo from './boardRepository';
import { reIdBoardAggregate } from './reIdBoardAggregate';
import * as assets from '@/lib/assets/assetRepository';
import { hashBytes } from '@/lib/assets/processImage';
import { blobToBase64, collectAssetIdsFromContent, rehydrateEmbeddedAssets } from '@/lib/utils/export-import';
import { collectReferencedAssetHashes } from '@/lib/assets/collectReferencedAssetHashes';

// -- Type Imports --
import type { Board } from '@/lib/types/board';
import type { BoardItemRecord } from './boardRecords';
import type { EmbeddedAsset } from '@/lib/utils/export-import';

/*
 * The board file round-trip at the data layer (the DOM download/upload is browser-verified):
 * serialize a board, clear it, re-ID and re-materialize - and assets dedup on re-import.
 */

function rec(id: string, boardId: string, z: number, overrides: Partial<BoardItemRecord> = {}): BoardItemRecord {
   return { id, boardId, kind: 'post-it', x: 0, y: 0, width: 100, height: 100, z, content: { kind: 'post-it', mode: 'copy', data: { id: 'n24', text: id } }, ...overrides };
}

beforeEach(async () => {
   await drawerDatabase.boards.clear();
   await drawerDatabase.boardItems.clear();
   await drawerDatabase.assets.clear();
});

describe('board export -> import round-trip', () => {
   it('reproduces items, connections, and viewport with fresh ids', async () => {
      const board = await repo.createBoard('Original');
      await repo.saveBoard({ ...board, viewport: { x: 7, y: 8, zoom: 1.5 } });
      await repo.bulkPutItems([
         rec('a', board.id, 0),
         rec('b', board.id, 1),
         rec('c', board.id, 2, { kind: 'connection', width: 0, height: 0, content: { kind: 'connection', from: 'a', to: 'b', style: { width: 2, color: '#0f0' } } }),
         rec('img', board.id, 3, { kind: 'image', content: { kind: 'image', assetId: 'asset-h', fit: 'cover' } }),
      ]);

      // "Export": the file's content is the serialized aggregate.
      const aggregate = (await repo.loadBoard(board.id))!;
      const fileContent = JSON.parse(JSON.stringify(aggregate)) as Board;
      expect([...collectAssetIdsFromContent(fileContent)]).toEqual(['asset-h']);

      // Another device / cleared drawer.
      await drawerDatabase.boards.clear();
      await drawerDatabase.boardItems.clear();

      // "Import": fresh identity, then materialize.
      const reIded = reIdBoardAggregate(fileContent);
      await repo.importBoard(reIded);
      const reloaded = (await repo.loadBoard(reIded.id))!;

      // Fresh ids
      expect(reloaded.id).not.toBe(board.id);
      expect(reloaded.items.map((i) => i.id)).not.toContain('a');
      // Viewport preserved
      expect(reloaded.viewport).toEqual({ x: 7, y: 8, zoom: 1.5 });
      // Every item reproduced
      expect(reloaded.items.length).toBe(4);
      // Connection endpoints still resolve to real (re-IDed) items
      const ids = new Set(reloaded.items.map((i) => i.id));
      const connection = reloaded.items.find((i) => i.content.kind === 'connection')!;
      const { from, to } = connection.content as { from: string; to: string };
      expect(ids.has(from)).toBe(true);
      expect(ids.has(to)).toBe(true);
      // Image asset reference preserved
      const image = reloaded.items.find((i) => i.content.kind === 'image')!;
      expect((image.content as { assetId: string }).assetId).toBe('asset-h');
   });

   it('preserves an 8-digit alpha stroke color through export/import', async () => {
      const board = await repo.createBoard('Drawing');
      await repo.saveBoard(board);
      const alpha = '#3b82f680'; // rrggbb + aa: the Transform tool stores opacity in the color's alpha
      await repo.bulkPutItems([
         rec('draw', board.id, 0, {
            kind: 'drawing',
            content: { kind: 'drawing', seq: 1, strokes: [{ id: 's1', brush: 'pen', color: alpha, width: 3, points: [0, 0, 10, 10] }] },
         }),
      ]);

      const fileContent = JSON.parse(JSON.stringify((await repo.loadBoard(board.id))!)) as Board;
      await drawerDatabase.boards.clear();
      await drawerDatabase.boardItems.clear();

      const reIded = reIdBoardAggregate(fileContent);
      await repo.importBoard(reIded);
      const reloaded = (await repo.loadBoard(reIded.id))!;

      const drawing = reloaded.items.find((i) => i.content.kind === 'drawing')!;
      const strokes = (drawing.content as { strokes: { color: string }[] }).strokes;
      expect(strokes[0].color).toBe(alpha); // the 8-digit alpha survives byte-identical (no 6-digit truncation)
   });

   it('preserves edited embed copies (card flip/tags, tracker tiers, image asset) through export/import', async () => {
      const board = await repo.createBoard('Embeds');
      await repo.saveBoard(board);

      // An embed's edits live in `content.data`: a flipped, renamed theme card; an image card
      // re-pointed at a freshly edited asset; a status tracker with toggled tiers.
      const themeCard = {
         id: 'inner-theme', cardType: 'CHARACTER_THEME', title: 'Theme', order: 0, isFlipped: true,
         details: { game: 'LEGENDS', themeType: 'Origin', mainTag: { id: 'm', name: 'Edited Name' }, powerTags: [{ id: 'p', name: 'added tag' }], weaknessTags: [], improvements: [], quest: 'Q' },
      };
      const imageCard = { id: 'inner-img', cardType: 'IMAGE_CARD', title: 'Art', order: 1, details: { game: 'LEGENDS', assetId: 'edited-hash', width: 280, height: 360 } };
      const statusTracker = { id: 'inner-trk', trackerType: 'STATUS', name: 'Hurt', tiers: [true, false, false] };

      await repo.bulkPutItems([
         rec('card-embed', board.id, 0, { kind: 'card', content: { kind: 'card', mode: 'copy', data: themeCard } }),
         rec('img-embed', board.id, 1, { kind: 'card', content: { kind: 'card', mode: 'copy', data: imageCard } }),
         rec('trk-embed', board.id, 2, { kind: 'tracker', content: { kind: 'tracker', mode: 'copy', data: statusTracker } }),
      ]);

      const fileContent = JSON.parse(JSON.stringify((await repo.loadBoard(board.id))!)) as Board;
      // The edited image embed's asset is collected for export (referenced, not GC'd).
      expect(collectAssetIdsFromContent(fileContent).has('edited-hash')).toBe(true);

      await drawerDatabase.boards.clear();
      await drawerDatabase.boardItems.clear();

      const reIded = reIdBoardAggregate(fileContent);
      await repo.importBoard(reIded);
      const reloaded = (await repo.loadBoard(reIded.id))!;

      type CardEmbed = { data: { cardType: string; isFlipped: boolean; details: { mainTag: { name: string }; powerTags: { name: string }[] } } };
      const theme = reloaded.items.find((i) => i.content.kind === 'card' && (i.content as unknown as CardEmbed).data.cardType === 'CHARACTER_THEME')!;
      const td = (theme.content as unknown as CardEmbed).data;
      expect(td.isFlipped).toBe(true);
      expect(td.details.mainTag.name).toBe('Edited Name');
      expect(td.details.powerTags[0].name).toBe('added tag');

      const trk = reloaded.items.find((i) => i.content.kind === 'tracker')!;
      expect((trk.content as unknown as { data: { tiers: boolean[] } }).data.tiers).toEqual([true, false, false]);

      // The GC mark walks the imported board items and still references the edited image's asset.
      expect((await collectReferencedAssetHashes()).has('edited-hash')).toBe(true);
   });

   it('walks a COPY note’s cover + inline image assets for export AND the GC mark', async () => {
      const board = await repo.createBoard('Notes');
      await repo.saveBoard(board);

      // A copy note is self-contained in `content.data` and is NOT in `db.notes`, so its art is reachable
      // only via the board item. Its cover hash + an inline `asset:` body image must both be collected.
      const copyNote = { id: 'inner-note', title: 'Handout', body: 'Lore ![art](asset:deadbeef) here.', cover: { hash: 'aabbccdd', width: 40, aspect: 1.5 } };
      await repo.bulkPutItems([
         rec('note-embed', board.id, 0, { kind: 'note', content: { kind: 'note', mode: 'copy', data: copyNote } }),
      ]);

      // Export walk (collectFromBoard): both the cover and the inline body image ride the file.
      const fileContent = JSON.parse(JSON.stringify((await repo.loadBoard(board.id))!)) as Board;
      const exported = collectAssetIdsFromContent(fileContent);
      expect(exported.has('aabbccdd')).toBe(true);
      expect(exported.has('deadbeef')).toBe(true);

      // GC mark (collectFromBoardItemContent): the sweep sees both, so it won't reclaim a copy note's art.
      const marked = await collectReferencedAssetHashes();
      expect(marked.has('aabbccdd')).toBe(true);
      expect(marked.has('deadbeef')).toBe(true);
   });
});

describe('embedded asset dedup on import', () => {
   it('re-importing shared art does not duplicate asset rows', async () => {
      const bytes = new Uint8Array([9, 8, 7, 6]);
      const blob = new Blob([bytes], { type: 'image/webp' });
      const hash = await hashBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      const assetsMap: Record<string, EmbeddedAsset> = {
         [hash]: { mimeType: 'image/webp', width: 10, height: 10, base64: await blobToBase64(blob) },
      };

      await rehydrateEmbeddedAssets(assetsMap);
      await rehydrateEmbeddedAssets(assetsMap); // import the same file again

      const stored = await assets.listAssetHashes();
      expect(stored.map((s) => s.hash)).toEqual([hash]);
   });
});
