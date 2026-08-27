// @vitest-environment jsdom

// -- Testing Imports --
import { describe, expect, it } from 'vitest';

// -- Unit Under Test --
import { resolveMatchRange } from './pdfTextRange';

// -- Type Imports --
import type { TextLayerHandle } from './pdfTextLayerRegistry';

/*
 * The resolver's OFFSET math, verified against the same fold+separator join the search index uses. jsdom's
 * `getClientRects` returns nothing, so the pixel step (`rangeToNormalizedQuads`) is a cursor-check, not a
 * unit test - here we assert the resolved Range lands on the right text nodes and character offsets.
 */

/** A fake handle backed by real DOM divs, so each item's `firstChild` is a text node of its string. */
function makeHandle(itemsStr: string[]): TextLayerHandle {
   const textDivs = itemsStr.map((s) => {
      const div = document.createElement('div');
      div.textContent = s;
      document.body.appendChild(div);
      return div;
   });
   return { textDivs, itemsStr };
}

describe('resolveMatchRange', () => {
   it('resolves a partial single-item match to the right text-node offsets', () => {
      const handle = makeHandle(['Fire']);
      // 'ir' is folded offsets [1,3) of 'fire'.
      const range = resolveMatchRange(handle, 1, 2);
      expect(range).not.toBeNull();
      expect(range!.startContainer).toBe(handle.textDivs[0].firstChild);
      expect(range!.startOffset).toBe(1);
      expect(range!.endContainer).toBe(handle.textDivs[0].firstChild);
      expect(range!.endOffset).toBe(3);
   });

   it('spans two items across the inter-item separator', () => {
      const handle = makeHandle(['Fire', 'ball']);
      // Joined folded text is 'fire ball'; the match covers both items [0,9).
      const range = resolveMatchRange(handle, 0, 9);
      expect(range).not.toBeNull();
      expect(range!.startContainer).toBe(handle.textDivs[0].firstChild);
      expect(range!.startOffset).toBe(0);
      expect(range!.endContainer).toBe(handle.textDivs[1].firstChild);
      expect(range!.endOffset).toBe(4);
   });

   it('maps a folded offset back past collapsed whitespace to its raw char', () => {
      const handle = makeHandle(['a  b']);
      // 'a  b' folds to 'a b'; the folded 'b' is at offset 2 but raw index 3.
      const range = resolveMatchRange(handle, 2, 1);
      expect(range).not.toBeNull();
      expect(range!.startContainer).toBe(handle.textDivs[0].firstChild);
      expect(range!.startOffset).toBe(3);
      expect(range!.endOffset).toBe(4);
   });

   it('clamps a start on the separator forward to the next item', () => {
      const handle = makeHandle(['Fire', 'ball']);
      // ' ball' starts on the separator (folded offset 4, owned by no item) and clamps into 'ball'.
      const range = resolveMatchRange(handle, 4, 5);
      expect(range).not.toBeNull();
      expect(range!.startContainer).toBe(handle.textDivs[1].firstChild);
      expect(range!.startOffset).toBe(0);
      expect(range!.endContainer).toBe(handle.textDivs[1].firstChild);
      expect(range!.endOffset).toBe(4);
   });

   it('clamps an end on the separator back to the previous item', () => {
      const handle = makeHandle(['Fire', 'ball']);
      // 'fire ' ends on the separator (folded offset 4); the end clamps back to the last char of 'Fire'.
      const range = resolveMatchRange(handle, 0, 5);
      expect(range).not.toBeNull();
      expect(range!.startContainer).toBe(handle.textDivs[0].firstChild);
      expect(range!.startOffset).toBe(0);
      expect(range!.endContainer).toBe(handle.textDivs[0].firstChild);
      expect(range!.endOffset).toBe(4);
   });

   it('returns null for a non-positive length', () => {
      const handle = makeHandle(['Fire']);
      expect(resolveMatchRange(handle, 0, 0)).toBeNull();
   });

   it('returns null when the match offset is past the page text', () => {
      const handle = makeHandle(['Fire']);
      expect(resolveMatchRange(handle, 10, 2)).toBeNull();
   });

   it('returns null when the resolved item has no text node', () => {
      const handle = makeHandle(['Fire']);
      // A desynced div (emptied after registration) has no firstChild; the caller falls back.
      handle.textDivs[0].textContent = '';
      expect(resolveMatchRange(handle, 0, 4)).toBeNull();
   });
});
