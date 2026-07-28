// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { resolveActiveWindow } from './activeWindow';

/*
 * The surface precedence, pinned. Both readers (the sidebar's action set and the page's surface
 * switch) resolve through this, so a change here moves both at once - which is the point.
 */

describe('resolveActiveWindow', () => {
   it('falls back to the main menu when nothing is active', () => {
      expect(resolveActiveWindow({ hasNote: false, hasBoard: false, hasCharacter: false })).toBe('MAIN_MENU');
   });

   it('resolves the play area for a character alone', () => {
      expect(resolveActiveWindow({ hasNote: false, hasBoard: false, hasCharacter: true })).toBe('PLAY_AREA');
   });

   it('puts a board over a loaded character', () => {
      expect(resolveActiveWindow({ hasNote: false, hasBoard: true, hasCharacter: true })).toBe('BOARD');
   });

   it('puts a note over both a board and a loaded character', () => {
      expect(resolveActiveWindow({ hasNote: true, hasBoard: true, hasCharacter: true })).toBe('NOTE');
   });
});
