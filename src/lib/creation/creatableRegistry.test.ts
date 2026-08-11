// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { CREATABLE_REGISTRY, CREATABLE_BY_KIND, type CreatableKind } from './creatableRegistry';

/*
 * Guards the shared creatable-element registry: it must expose every board-native kind exactly once,
 * in ring order, and each entry's content factory must mint a payload whose `kind` matches its key
 * (so a surface indexing by kind can never build the wrong content).
 */

const EXPECTED_KINDS: CreatableKind[] = ['post-it', 'text', 'journal', 'image', 'pin', 'dice-tray', 'roll-table', 'zone', 'portal'];

describe('creatableRegistry', () => {
   it('exposes every board kind exactly once, in ring order', () => {
      expect(CREATABLE_REGISTRY.map((entry) => entry.kind)).toEqual(EXPECTED_KINDS);
   });

   it('indexes every kind in CREATABLE_BY_KIND', () => {
      for (const kind of EXPECTED_KINDS) {
         expect(CREATABLE_BY_KIND[kind]).toBeDefined();
         expect(CREATABLE_BY_KIND[kind].kind).toBe(kind);
      }
   });

   it('each entry carries an icon, a label key, and a positive default footprint', () => {
      for (const entry of CREATABLE_REGISTRY) {
         expect(entry.icon).toBeTruthy();
         expect(typeof entry.labelKey).toBe('string');
         expect(entry.labelKey.length).toBeGreaterThan(0);
         expect(entry.defaultSize.width).toBeGreaterThan(0);
         expect(entry.defaultSize.height).toBeGreaterThan(0);
      }
   });

   it('makeContent produces a payload whose kind matches the entry key', () => {
      for (const entry of CREATABLE_REGISTRY) {
         expect(entry.makeContent().kind).toBe(entry.kind);
      }
   });

   it('makeContent mints fresh content on each call (independent ids)', () => {
      const journal = CREATABLE_BY_KIND['journal'];
      const first = journal.makeContent();
      const second = journal.makeContent();
      // Two board journals must not share the same aggregate id.
      const firstId = first.kind === 'journal' ? first.data.id : '';
      const secondId = second.kind === 'journal' ? second.data.id : '';
      expect(firstId).not.toBe(secondId);
   });
});
