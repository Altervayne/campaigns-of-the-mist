// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import { saveCharacter } from '@/lib/character/characterRepository';
import { addStencil, deleteStencil } from './stencilRepository';
import { collectReferencedAssetHashes } from './collectReferencedAssetHashes';

// -- Type Imports --
import type { Card, Character } from '@/lib/types/character';
import type { DrawerItemContent } from '@/lib/types/drawer';

/*
 * Unit tests for the reference collector against fake-indexeddb with synthetic
 * characters and drawer items. `assetId` does not exist on any card type yet, so the
 * fixtures attach it via a cast - exactly the forward-compatible shape the consumer
 * series will produce.
 */

/** A card carrying (or not) a `details.assetId`, built loosely since the field is not in the type yet. */
function makeCard(id: string, assetId: string | null): Card {
   return {
      id,
      title: '',
      order: 0,
      isFlipped: false,
      cardType: 'CHARACTER_CARD',
      details: { assetId },
   } as unknown as Card;
}

/** A minimal character holding the given cards. */
function makeCharacter(id: string, cards: Card[]): Character {
   return {
      id,
      name: 'Hero',
      game: 'LEGENDS',
      cards,
      trackers: { statuses: [], storyTags: [], storyThemes: [] },
   } as unknown as Character;
}

/** Adds a drawer item with arbitrary content directly (the GC restriction is on the GC module, not tests). */
function seedDrawerItem(id: string, content: DrawerItemContent) {
   return drawerDatabase.items.add({
      id,
      name: id,
      parentFolderId: 'root',
      order: 0,
      game: 'LEGENDS',
      type: 'CHARACTER_CARD',
      createdAt: 0,
      updatedAt: 0,
      content,
   });
}

/** Adds a board item row directly (the kind drives whether it carries an asset reference). */
function seedBoardItem(id: string, kind: 'image' | 'post-it', assetId: string | null) {
   return drawerDatabase.boardItems.add({
      id,
      boardId: 'board-1',
      kind,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      z: 0,
      content: kind === 'image' ? { kind: 'image', assetId, fit: 'cover' } : { kind: 'post-it', mode: 'copy', data: { id: 'n33', text: '' } },
   });
}

/** Adds a stenciled board image item: the baked `assetId` plus the kept pre-mask `sourceAssetId`. */
function seedStenciledImage(id: string, assetId: string, sourceAssetId: string) {
   return drawerDatabase.boardItems.add({
      id,
      boardId: 'board-1',
      kind: 'image',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      z: 0,
      content: { kind: 'image', assetId, sourceAssetId, maskId: 'hexagon', fit: 'cover' },
   });
}

/** Adds an embedded board CARD copy carrying an IMAGE_CARD whose `details.assetId` references an asset. */
function seedBoardCardCopy(id: string, assetId: string) {
   return drawerDatabase.boardItems.add({
      id,
      boardId: 'board-1',
      kind: 'card',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      z: 0,
      content: { kind: 'card', mode: 'copy', data: { cardType: 'IMAGE_CARD', details: { assetId } } },
   });
}

/** Adds a board PORTAL item with the given image visual (poster or composed), or an icon visual (no asset). */
function seedBoardPortal(id: string, visual: { kind: 'image'; assetId: string; mode: 'poster' | 'composed'; size: number; background: boolean; aspect: number } | { kind: 'icon'; icon: string }) {
   return drawerDatabase.boardItems.add({
      id,
      boardId: 'board-1',
      kind: 'portal',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      z: 0,
      content: { kind: 'portal', target: { kind: 'external', href: 'https://x.y' }, style: { visual, label: '', align: 'right', background: true } },
   });
}

/** Adds a working note row directly, whose `body` carries inline `asset:` image references. */
function seedNote(id: string, body: string) {
   return drawerDatabase.notes.add({
      id,
      title: id,
      body,
      updatedAt: 0,
      drawerItemId: null,
      schemaVersion: 1,
   });
}

/** Adds an embedded board CARD REFERENCE; its `lastKnown` may carry art, but references are not scanned. */
function seedBoardCardReference(id: string, sourceDrawerItemId: string, lastKnownAssetId: string) {
   return drawerDatabase.boardItems.add({
      id,
      boardId: 'board-1',
      kind: 'card',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      z: 0,
      content: { kind: 'card', mode: 'reference', sourceDrawerItemId, lastKnown: { cardType: 'IMAGE_CARD', details: { assetId: lastKnownAssetId } } },
   });
}

beforeEach(async () => {
   await drawerDatabase.characters.clear();
   await drawerDatabase.items.clear();
   await drawerDatabase.boardItems.clear();
   await drawerDatabase.notes.clear();
   await drawerDatabase.stencils.clear();
});

describe('collectReferencedAssetHashes', () => {
   it('finds assetIds on a stored character\'s cards', async () => {
      await saveCharacter(makeCharacter('char-1', [makeCard('c1', 'asset-A'), makeCard('c2', 'asset-B')]));

      const referenced = await collectReferencedAssetHashes();

      expect(referenced).toEqual(new Set(['asset-A', 'asset-B']));
   });

   it('finds an assetId on a drawer item whose content is a single card', async () => {
      await seedDrawerItem('item-card', makeCard('c1', 'asset-C'));

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.has('asset-C')).toBe(true);
   });

   it('finds assetIds on a drawer item whose content is a full character', async () => {
      await seedDrawerItem('item-char', makeCharacter('char-x', [makeCard('c1', 'asset-D')]));

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.has('asset-D')).toBe(true);
   });

   it('unions references across characters and drawer items', async () => {
      await saveCharacter(makeCharacter('char-1', [makeCard('c1', 'asset-A')]));
      await seedDrawerItem('item-card', makeCard('c2', 'asset-B'));
      await seedDrawerItem('item-char', makeCharacter('char-x', [makeCard('c3', 'asset-C')]));

      const referenced = await collectReferencedAssetHashes();

      expect(referenced).toEqual(new Set(['asset-A', 'asset-B', 'asset-C']));
   });

   it('ignores cards without an assetId and returns empty when nothing references', async () => {
      await saveCharacter(makeCharacter('char-1', [makeCard('c1', null)]));

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.size).toBe(0);
   });

   it('finds the assetId on a board image item (so the GC keeps board art)', async () => {
      await seedBoardItem('img-item', 'image', 'asset-board');
      await seedBoardItem('note-item', 'post-it', null); // a non-image item holds no reference

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.has('asset-board')).toBe(true);
      expect(referenced.size).toBe(1);
   });

   it('retains BOTH the baked and the source asset of a stenciled image (masking must not strand the original)', async () => {
      await seedStenciledImage('masked-item', 'asset-baked', 'asset-source');

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.has('asset-baked')).toBe(true);
      expect(referenced.has('asset-source')).toBe(true);
      expect(referenced.size).toBe(2);
   });

   it('keeps a library stencil\'s mask asset alive with NO board item referencing it (the library is the sole keeper)', async () => {
      // A stencil owns its mask; without the fifth GC root the mask would be swept the moment no image
      // baked from it - which, since an image only soft-references the stencil, is always.
      await addStencil('Torn Edge', 'asset-mask');

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.has('asset-mask')).toBe(true);
   });

   it('lets a stencil\'s mask asset be collected once the stencil is deleted (nothing else holds it)', async () => {
      const stencil = await addStencil('Torn Edge', 'asset-mask');
      await deleteStencil(stencil.id);

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.has('asset-mask')).toBe(false);
   });

   it('keeps a mask shared by two stencils referenced until BOTH are gone', async () => {
      const first = await addStencil('First', 'asset-shared');
      const second = await addStencil('Second', 'asset-shared');

      await deleteStencil(first.id);
      expect((await collectReferencedAssetHashes()).has('asset-shared')).toBe(true);

      await deleteStencil(second.id);
      expect((await collectReferencedAssetHashes()).has('asset-shared')).toBe(false);
   });

   it('does NOT count a stenciled image\'s stencil (soft ref); only its baked + source assets', async () => {
      // The image carries `stencilId` but never contributes a mask hash - the library owns that.
      await drawerDatabase.boardItems.add({
         id: 'lib-masked', boardId: 'board-1', kind: 'image', x: 0, y: 0, width: 100, height: 100, z: 0,
         content: { kind: 'image', assetId: 'asset-baked', sourceAssetId: 'asset-source', stencilId: 'stencil-1', fit: 'cover' },
      });

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.has('asset-baked')).toBe(true);
      expect(referenced.has('asset-source')).toBe(true);
      expect(referenced.has('stencil-1')).toBe(false);
      expect(referenced.size).toBe(2);
   });

   it('lets an OLD baked asset be collected on re-mask while the shared source survives', async () => {
      // Re-masking rebakes source -> a NEW asset; the item now points at the new bake + the same
      // source. The stale old bake is referenced by nothing, so it must NOT appear (it is collectable),
      // while the source, still referenced, must survive.
      await seedStenciledImage('masked-item', 'asset-baked-new', 'asset-source');

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.has('asset-baked-old')).toBe(false);
      expect(referenced.has('asset-source')).toBe(true);
   });

   it('ignores a board image item whose assetId is null (empty image box)', async () => {
      await seedBoardItem('img-empty', 'image', null);

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.size).toBe(0);
   });

   it('finds the assetId on an embedded board card copy (so the GC keeps a dropped IMAGE_CARD)', async () => {
      await seedBoardCardCopy('card-item', 'asset-embed');

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.has('asset-embed')).toBe(true);
   });

   it('retains a referenced IMAGE_CARD asset via the DRAWER scan, not the board reference', async () => {
      // The source drawer item carries the real asset; the board holds a live reference to it.
      await seedDrawerItem('drawer-img', makeCard('img', 'asset-ref'));
      await seedBoardCardReference('ref-item', 'drawer-img', 'asset-ref');

      const referenced = await collectReferencedAssetHashes();

      // Kept once, via the drawer item. The board reference itself contributes nothing.
      expect(referenced.has('asset-ref')).toBe(true);
   });

   it('does not collect a board reference\'s lastKnown asset when its source is gone', async () => {
      // No drawer source: a dangling reference's cached art is NOT a live reference, so it
      // is not retained (the source is the truth; convert-to-copy is the recovery path).
      await seedBoardCardReference('ref-item', 'missing-drawer', 'asset-stale');

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.has('asset-stale')).toBe(false);
   });

   it('finds the assetId on a board portal with an image visual (so the GC keeps portal art)', async () => {
      await seedBoardPortal('portal-poster', { kind: 'image', assetId: 'asset-poster', mode: 'poster', size: 0.55, background: true, aspect: 1.5 });
      await seedBoardPortal('portal-composed', { kind: 'image', assetId: 'asset-composed', mode: 'composed', size: 0.55, background: true, aspect: 0.75 });
      await seedBoardPortal('portal-icon', { kind: 'icon', icon: 'globe' }); // an icon portal holds no asset

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.has('asset-poster')).toBe(true);
      expect(referenced.has('asset-composed')).toBe(true);
      expect(referenced.size).toBe(2);
   });

   it('finds the inline-image hash in a WORKING note body (so the sweep keeps an open note\'s images)', async () => {
      // A note open in a tab isn't in the drawer yet; its images live in the `notes` table and would
      // be reclaimed if the GC never walked it - the exact days-later silent loss the helper guards.
      await seedNote('note-working', '# Handout\n\n![a map](asset:aaaa111122223333)');

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.has('aaaa111122223333')).toBe(true);
   });

   it('finds the inline-image hash in a DRAWER-saved note (item content is an inline aggregate)', async () => {
      await seedDrawerItem('note-item', { id: 'n1', title: 'Saved', body: '![](asset:bbbb444455556666)' } as DrawerItemContent);

      const referenced = await collectReferencedAssetHashes();

      expect(referenced.has('bbbb444455556666')).toBe(true);
   });
});
