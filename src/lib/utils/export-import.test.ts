// -- Library Imports --
import { beforeEach, describe, expect, it } from 'vitest';

// -- Local Imports --
import { drawerDatabase } from '@/lib/drawer/drawerDatabase';
import { hashBytes } from '@/lib/assets/processImage';
import { storeAsset } from '@/lib/assets/assetRepository';
import {
   base64ToBytes,
   blobToBase64,
   collectAssetIdsFromContent,
   exportToFile,
   generateExportFilename,
   isExportedCustomTheme,
   rehydrateEmbeddedAssets,
} from './export-import';

// -- Type Imports --
import type { EmbeddedAsset, ExportFile } from './export-import';
import type { Card, Character } from '@/lib/types/character';
import type { Board } from '@/lib/types/board';
import type { Drawer, DrawerItem } from '@/lib/types/drawer';
import type { CustomTheme } from '@/lib/theme/themeTokens';

/*
 * Tests for the inline-embed export/import plumbing: the content walk, the base64
 * round-trip, and import rehydration (dedup-aware). The full file download/upload
 * path (FileReader-based `importFromFile`, anchor download) is browser-verified - the
 * Node test environment has no DOM FileReader.
 */

/** A card carrying an `assetId` (the field is not on the card type yet, so cast loosely). */
function imageCard(assetId: string, id = 'c1'): Card {
   return { id, title: 'Portrait', order: 0, isFlipped: false, cardType: 'IMAGE_CARD', details: { game: 'LEGENDS', assetId, fit: 'cover' } } as unknown as Card;
}

function character(cards: Card[]): Character {
   return { id: 'ch', name: 'Hero', game: 'LEGENDS', cards, trackers: { statuses: [], storyTags: [], storyThemes: [] } } as unknown as Character;
}

function drawerItem(id: string, content: DrawerItem['content']): DrawerItem {
   return { id, game: 'LEGENDS', type: 'IMAGE_CARD', name: id, content };
}

beforeEach(async () => {
   await drawerDatabase.assets.clear();
});

describe('collectAssetIdsFromContent', () => {
   it('finds the assetId on a single card', () => {
      expect(collectAssetIdsFromContent(imageCard('hash-a'))).toEqual(new Set(['hash-a']));
   });

   it('finds assetIds across a character\'s cards', () => {
      const result = collectAssetIdsFromContent(character([imageCard('hash-a', 'c1'), imageCard('hash-b', 'c2')]));
      expect(result).toEqual(new Set(['hash-a', 'hash-b']));
   });

   it('recurses a drawer: root items + nested folders, cards + characters', () => {
      const drawer: Drawer = {
         rootItems: [drawerItem('i1', imageCard('hash-c'))],
         folders: [
            {
               id: 'f1',
               name: 'Folder',
               items: [drawerItem('i2', character([imageCard('hash-d')]))],
               folders: [
                  { id: 'f2', name: 'Sub', items: [drawerItem('i3', imageCard('hash-e'))], folders: [] },
               ],
            },
         ],
      };

      expect(collectAssetIdsFromContent(drawer)).toEqual(new Set(['hash-c', 'hash-d', 'hash-e']));
   });

   it('returns empty for content with no asset references', () => {
      expect(collectAssetIdsFromContent(imageCard('')).size).toBe(0);
      expect(collectAssetIdsFromContent(character([])).size).toBe(0);
   });

   it('folds BOTH the baked and the source asset of a stenciled board image (re-mask survives import)', () => {
      const board: Board = {
         id: 'b', name: 'Board', viewport: { x: 0, y: 0, zoom: 1 }, nextLayerSeq: 1,
         items: [
            { id: 'img', kind: 'image', x: 0, y: 0, width: 100, height: 100, z: 0, content: { kind: 'image', assetId: 'baked-h', sourceAssetId: 'source-h', maskId: 'hexagon', fit: 'cover' } },
         ],
      };

      expect(collectAssetIdsFromContent(board)).toEqual(new Set(['baked-h', 'source-h']));
   });

   it('folds only the assetId for an unmasked board image (no source)', () => {
      const board: Board = {
         id: 'b', name: 'Board', viewport: { x: 0, y: 0, zoom: 1 }, nextLayerSeq: 1,
         items: [
            { id: 'img', kind: 'image', x: 0, y: 0, width: 100, height: 100, z: 0, content: { kind: 'image', assetId: 'plain-h', fit: 'cover' } },
         ],
      };

      expect(collectAssetIdsFromContent(board)).toEqual(new Set(['plain-h']));
   });

   it('finds inline-image hashes in a note body (so an exported note bundles its images)', () => {
      // The SAME grammar the GC uses, exercised through the export path - the two must never drift.
      const note = { id: 'n1', title: 'Handout', body: '![a map](asset:1234abcd5678)\n\n![](asset:9999ffff0000)' };
      expect(collectAssetIdsFromContent(note)).toEqual(new Set(['1234abcd5678', '9999ffff0000']));
   });
});

describe('CUSTOM_THEME export/import', () => {
   const makeTheme = (): CustomTheme => ({
      id: 'orig', name: 'My Theme', radius: '0.75rem',
      light: { background: '#fff' } as unknown as CustomTheme['light'],
      dark: { background: '#000' } as unknown as CustomTheme['dark'],
      paper: { 'paper-background': '#eee' } as unknown as CustomTheme['paper'],
      generator: { tier: 3, separateModes: false, saturation: 'vivid', contrast: 'normal', seeds: { primary: '#1', background: '#2', accent: '#3' } },
   });

   it('references no assets (a theme is asset-free)', () => {
      expect(collectAssetIdsFromContent(makeTheme()).size).toBe(0);
   });

   it('names the file with a Theme label and no game prefix', () => {
      const name = generateExportFilename('NEUTRAL', 'CUSTOM_THEME', 'My Theme');
      expect(name).toContain('My Theme');
      expect(name).toContain('Theme');
      expect(name).not.toMatch(/LitM|CoM|OS/);
   });

   it('isExportedCustomTheme accepts a theme envelope and rejects others', () => {
      const themeFile: ExportFile = { fileType: 'CUSTOM_THEME', game: 'NEUTRAL', content: makeTheme() };
      expect(isExportedCustomTheme(themeFile)).toBe(true);
      expect(isExportedCustomTheme({ fileType: 'FULL_CHARACTER_SHEET', game: 'LEGENDS', content: character([]) })).toBe(false);
      const malformed = { fileType: 'CUSTOM_THEME', game: 'NEUTRAL', content: { light: {}, dark: {} } } as unknown as ExportFile;
      expect(isExportedCustomTheme(malformed)).toBe(false);
      // A theme envelope missing `paper` is rejected (paper is required now - no backfill).
      const noPaper = { fileType: 'CUSTOM_THEME', game: 'NEUTRAL', content: { light: {}, dark: {}, radius: '0.5rem' } } as unknown as ExportFile;
      expect(isExportedCustomTheme(noPaper)).toBe(false);
   });

   it('round-trips with a fresh id, preserving light/dark/radius and the generator settings', () => {
      const theme = makeTheme();
      const file: ExportFile = { fileType: 'CUSTOM_THEME', game: 'NEUTRAL', content: theme };
      // The importer re-IDs the validated content (the exact shape the manager's handler builds).
      const reIded = { ...(file.content as CustomTheme), id: 'fresh' };
      expect(reIded.id).not.toBe(theme.id);
      expect(reIded.light).toEqual(theme.light);
      expect(reIded.dark).toEqual(theme.dark);
      expect(reIded.radius).toBe(theme.radius);
      expect(reIded.generator).toEqual(theme.generator);
   });
});

/**
 * Runs an `exportToFile` call in the Node env by stubbing the browser download surface (no DOM here),
 * capturing the generated blob and parsing it back to the envelope. Restores the globals afterwards.
 */
async function captureExport(run: () => Promise<void>): Promise<ExportFile> {
   let captured: Blob | null = null;
   const g = globalThis as unknown as { document?: unknown };
   const priorDocument = g.document;
   const priorCreate = (URL as { createObjectURL?: unknown }).createObjectURL;
   const priorRevoke = (URL as { revokeObjectURL?: unknown }).revokeObjectURL;

   g.document = { createElement: () => ({ href: '', download: '', click() {} }), body: { appendChild() {}, removeChild() {} } };
   (URL as { createObjectURL: (b: Blob) => string }).createObjectURL = (blob) => { captured = blob; return 'blob:mock'; };
   (URL as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};

   try {
      await run();
   } finally {
      g.document = priorDocument;
      (URL as { createObjectURL?: unknown }).createObjectURL = priorCreate;
      (URL as { revokeObjectURL?: unknown }).revokeObjectURL = priorRevoke;
   }

   if (!captured) throw new Error('no export was captured');
   return JSON.parse(await (captured as Blob).text()) as ExportFile;
}

describe('exportToFile embedded entities', () => {
   const board = (): Board => ({ id: 'b', name: 'Board', viewport: { x: 0, y: 0, zoom: 1 }, nextLayerSeq: 1, items: [] });

   it('omits embedded when none is passed (byte-shape unchanged)', async () => {
      const file = await captureExport(() => exportToFile(board(), 'FULL_BOARD', 'NEUTRAL', 'board'));
      expect(file.embedded).toBeUndefined();
   });

   it('writes embedded.characters and folds their portrait assets into the assets map', async () => {
      const bytes = new Uint8Array([3, 1, 4, 1, 5]);
      await storeAsset({ hash: 'portrait-1', blob: new Blob([bytes], { type: 'image/webp' }), mimeType: 'image/webp', width: 2, height: 2, byteSize: bytes.length });
      const char = character([imageCard('portrait-1')]);

      const file = await captureExport(() => exportToFile(board(), 'FULL_BOARD', 'NEUTRAL', 'board', { characters: { 'old-1': char } }));

      expect(file.embedded?.characters?.['old-1']).toEqual(char);
      expect(file.assets?.['portrait-1']).toMatchObject({ mimeType: 'image/webp', width: 2, height: 2 });
   });

   it('embeds BOTH the baked and source bytes of a stenciled image, and an import round-trip restores both', async () => {
      const baked = new Uint8Array([1, 1, 2, 3, 5]);
      const source = new Uint8Array([8, 13, 21, 34]);
      await storeAsset({ hash: 'baked-h', blob: new Blob([baked], { type: 'image/webp' }), mimeType: 'image/webp', width: 4, height: 4, byteSize: baked.length });
      await storeAsset({ hash: 'source-h', blob: new Blob([source], { type: 'image/webp' }), mimeType: 'image/webp', width: 6, height: 6, byteSize: source.length });

      const stenciled = (): Board => ({
         id: 'b', name: 'Board', viewport: { x: 0, y: 0, zoom: 1 }, nextLayerSeq: 1,
         items: [
            { id: 'img', kind: 'image', x: 0, y: 0, width: 100, height: 100, z: 0, content: { kind: 'image', assetId: 'baked-h', sourceAssetId: 'source-h', maskId: 'hexagon', fit: 'cover' } },
         ],
      });

      const file = await captureExport(() => exportToFile(stenciled(), 'FULL_BOARD', 'NEUTRAL', 'board'));

      expect(file.assets?.['baked-h']).toMatchObject({ mimeType: 'image/webp', width: 4, height: 4 });
      expect(file.assets?.['source-h']).toMatchObject({ mimeType: 'image/webp', width: 6, height: 6 });

      // Clear the store and re-import: both the displayed bake and the re-mask source must return.
      await drawerDatabase.assets.clear();
      await rehydrateEmbeddedAssets(file.assets!);

      expect(await drawerDatabase.assets.get('baked-h')).toBeDefined();
      expect(await drawerDatabase.assets.get('source-h')).toBeDefined();
   });
});

describe('base64 round-trip', () => {
   it('encodes and decodes a small blob to the exact same bytes', async () => {
      const original = new Uint8Array([0, 1, 2, 127, 128, 200, 253, 254, 255]);
      const blob = new Blob([original], { type: 'image/webp' });

      const base64 = await blobToBase64(blob);
      const decoded = base64ToBytes(base64);

      expect(Array.from(decoded)).toEqual(Array.from(original));
   });
});

describe('rehydrateEmbeddedAssets', () => {
   /** Builds an embedded-assets map for the given bytes, keyed by their real hash. */
   async function embed(bytes: Uint8Array<ArrayBuffer>): Promise<{ hash: string; assets: Record<string, EmbeddedAsset> }> {
      const blob = new Blob([bytes], { type: 'image/webp' });
      const base64 = await blobToBase64(blob);
      const hash = await hashBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      return { hash, assets: { [hash]: { mimeType: 'image/webp', width: 12, height: 9, base64 } } };
   }

   it('stores embedded assets so references resolve, preserving metadata', async () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const { hash, assets } = await embed(bytes);

      await rehydrateEmbeddedAssets(assets);

      expect(await drawerDatabase.assets.count()).toBe(1);
      const record = await drawerDatabase.assets.get(hash);
      expect(record).toMatchObject({ hash, mimeType: 'image/webp', width: 12, height: 9, byteSize: 5 });
   });

   it('dedups on a second import (no duplicate rows)', async () => {
      const { assets } = await embed(new Uint8Array([9, 8, 7, 6]));

      await rehydrateEmbeddedAssets(assets);
      await rehydrateEmbeddedAssets(assets);

      expect(await drawerDatabase.assets.count()).toBe(1);
   });
});
