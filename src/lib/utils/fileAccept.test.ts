// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Unit Under Test --
import {
   ACCEPT_BACKUP_RESTORE,
   ACCEPT_DRAWER_IMPORT,
   ACCEPT_ENTITY_IMPORT,
   ACCEPT_IMAGE,
   ACCEPT_NOTE_IMPORT,
   ACCEPT_SHEET_IMPORT,
   ACCEPT_THEME_IMPORT,
   ACCEPT_WORKSPACE_IMPORT,
} from './fileAccept';

// -- Utils Imports --
import { parseAcceptExtensions } from '@/hooks/useFileDrop';

/*
 * Pins each picker family's `accept`, and pins the two properties a careless edit would break: an envelope
 * family must offer both spellings of JSON, and the two strings that also feed `useFileDrop` must keep the
 * extension set their drop gates had before they were named.
 */

describe('picker family accept strings', () => {
   it('offers the .cotm envelope by extension and by MIME', () => {
      expect(ACCEPT_ENTITY_IMPORT).toBe('.cotm,.json,application/json');
      expect(ACCEPT_SHEET_IMPORT).toBe('.cotm,.json,application/json');
      expect(ACCEPT_THEME_IMPORT).toBe('.cotm,.json,application/json');
   });

   it('adds Markdown for the families that import portable text', () => {
      expect(ACCEPT_NOTE_IMPORT).toBe('.cotm,.json,application/json,.md,.markdown,text/markdown');
      expect(ACCEPT_WORKSPACE_IMPORT).toBe('.cotm,.json,application/json,.md,.markdown,text/markdown');
   });

   it('adds Markdown and PDF for the drawer family', () => {
      expect(ACCEPT_DRAWER_IMPORT).toBe('.cotm,.json,application/json,.md,.markdown,text/markdown,.pdf,application/pdf');
   });

   it('keeps the non-envelope families to themselves', () => {
      expect(ACCEPT_BACKUP_RESTORE).toBe('.cotmbak');
      expect(ACCEPT_IMAGE).toBe('image/*');
   });

   it('offers no Markdown to a family that cannot parse it', () => {
      for (const accept of [ACCEPT_ENTITY_IMPORT, ACCEPT_SHEET_IMPORT, ACCEPT_THEME_IMPORT]) {
         expect(accept).not.toMatch(/markdown|\.md/);
      }
   });

   it('lists both JSON spellings in every envelope family', () => {
      const envelopeFamilies = [ACCEPT_ENTITY_IMPORT, ACCEPT_SHEET_IMPORT, ACCEPT_THEME_IMPORT, ACCEPT_NOTE_IMPORT, ACCEPT_WORKSPACE_IMPORT, ACCEPT_DRAWER_IMPORT];
      for (const accept of envelopeFamilies) {
         expect(accept.split(',')).toEqual(expect.arrayContaining(['.cotm', '.json', 'application/json']));
      }
   });
});

describe('the drop gates the strings feed', () => {
   // `useFileDrop` gates a drop on extension tokens only, so the added MIME spellings drop away here:
   // `.cotm,.json,.md,.markdown,.pdf` for the drawer, `.cotm,.json` for the sheet.
   it('gates the drawer drop on its extension tokens', () => {
      expect(parseAcceptExtensions(ACCEPT_DRAWER_IMPORT)).toEqual(['.cotm', '.json', '.md', '.markdown', '.pdf']);
   });

   it('leaves the character sheet drop gate unchanged', () => {
      expect(parseAcceptExtensions(ACCEPT_SHEET_IMPORT)).toEqual(['.cotm', '.json']);
   });
});
