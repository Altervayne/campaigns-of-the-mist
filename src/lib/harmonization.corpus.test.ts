// -- Library Imports --
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// -- Local Imports --
import { harmonizeData } from './harmonization';
import { transformLegacyCharacter } from './utils/migration';

// -- Type Imports --
import type { Character } from './types/character';
import type { GeneralItemType } from './types/drawer';

/*
 * Real cross-version corpus round-trip. Runs the owner's archived `.cotm` / alpha `.json` exports
 * (OtherAssets/data-migration-tests, gitignored) through the ACTUAL migration paths and asserts each lands
 * well-formed and idempotent - the empirical companion to the synthetic fixtures in harmonization.test.ts.
 *
 * The corpus is local-only, so this whole suite SKIPS when the folder is absent (CI, a fresh clone, the
 * public repo). Drop new real exports into a version-named subfolder and they are picked up automatically.
 */

const ROOT = fileURLToPath(new URL('../../OtherAssets/data-migration-tests', import.meta.url));
const HAS_CORPUS = existsSync(ROOT);

function walk(dir: string): string[] {
   const out: string[] = [];
   for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else if (name.endsWith('.cotm') || name.endsWith('.json')) out.push(p);
   }
   return out;
}

/** Recursively counts residual `game` fields on tracker-shaped objects (has `trackerType`). */
function countTrackerGames(node: unknown): number {
   if (Array.isArray(node)) return node.reduce((n: number, v) => n + countTrackerGames(v), 0);
   if (!node || typeof node !== 'object') return 0;
   const o = node as Record<string, unknown>;
   let n = 'trackerType' in o && 'game' in o ? 1 : 0;
   for (const v of Object.values(o)) n += countTrackerGames(v);
   return n;
}
function countCardOrders(cards: unknown): number {
   return Array.isArray(cards) ? cards.filter((c) => c && typeof c === 'object' && 'order' in (c as object)).length : 0;
}
/** Counts items / folders / non-neutral tracker wrappers in a Drawer or Folder tree. */
function countDrawer(node: unknown) {
   const acc = { items: 0, folders: 0, trackerWrapperNonNeutral: 0 };
   const TRACK = new Set(['STATUS_TRACKER', 'STORY_TAG_TRACKER', 'STORY_THEME_TRACKER']);
   function visit(f: Record<string, unknown>) {
      const items = (f.rootItems ?? f.items) as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(items)) for (const it of items) {
         acc.items += 1;
         if (TRACK.has(it.type as string) && it.game !== 'NEUTRAL') acc.trackerWrapperNonNeutral += 1;
      }
      const folders = f.folders as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(folders)) for (const sub of folders) { acc.folders += 1; visit(sub); }
   }
   if (node && typeof node === 'object') visit(node as Record<string, unknown>);
   return acc;
}

const files = HAS_CORPUS ? walk(ROOT) : [];

describe.skipIf(!HAS_CORPUS)('real corpus round-trip (local-only)', () => {
   it('the corpus is non-empty', () => { expect(files.length).toBeGreaterThan(0); });

   for (const path of files) {
      const rel = path.replace(/\\/g, '/').split('data-migration-tests/').pop() ?? path;

      it(rel, () => {
         const parsed = JSON.parse(readFileSync(path, 'utf8')); // must parse
         const isAlpha = parsed && typeof parsed === 'object' && 'compatibility' in parsed && 'themeOne' in parsed;

         if (isAlpha) {
            // Pre-1.0 alpha format -> the dedicated converter, whose output must itself harmonize clean.
            const ch = transformLegacyCharacter(parsed).character;
            expect(Array.isArray(ch.cards) && Array.isArray(ch.journals) && Array.isArray(ch.sheetLayout)).toBe(true);
            const h = harmonizeData(ch, 'FULL_CHARACTER_SHEET') as Character;
            expect(countTrackerGames(h.trackers)).toBe(0);
            expect(countCardOrders(h.cards)).toBe(0);
            return;
         }

         expect(parsed.fileType).toBeTruthy();
         const fileType = parsed.fileType as GeneralItemType;
         const harmonized = harmonizeData(parsed.content, fileType) as Record<string, unknown>;
         expect(harmonized).toBeTruthy();
         // Idempotent: a second pass changes nothing.
         expect(harmonizeData(structuredClone(harmonized), fileType)).toEqual(harmonized);

         if (fileType === 'FULL_CHARACTER_SHEET') {
            const ch = harmonized as unknown as Character;
            expect(Array.isArray(ch.journals)).toBe(true);
            expect(Array.isArray(ch.sheetLayout)).toBe(true);
            expect(countCardOrders(ch.cards)).toBe(0);
            expect(countTrackerGames(ch.trackers)).toBe(0);
         } else if (fileType === 'STATUS_TRACKER' || fileType === 'STORY_TAG_TRACKER' || fileType === 'STORY_THEME_TRACKER') {
            expect('game' in harmonized).toBe(false);
         } else if (fileType === 'FULL_DRAWER') {
            const before = countDrawer(parsed.content);
            const after = countDrawer(harmonized);
            expect(after.items).toBe(before.items);           // nothing dropped
            expect(after.folders).toBe(before.folders);
            expect(after.trackerWrapperNonNeutral).toBe(0);   // every tracker wrapper neutralized
            expect(countTrackerGames(harmonized)).toBe(0);    // every tracker content game stripped
         }
      });
   }
});
