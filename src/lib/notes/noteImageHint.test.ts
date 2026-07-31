// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import {
   activeImageTokenAt,
   findImageTokens,
   hasImageTokenInRange,
   parseImageHint,
   resizeWidthPct,
   rewriteImageHintAt,
   serializeImageHint,
} from './noteImageHint';

const HASH = 'a1b2c3d4e5f6';
const HASH2 = 'f6e5d4c3b2a1';

describe('parseImageHint', () => {
   it('defaults a missing/empty/garbage hint to center 100', () => {
      expect(parseImageHint(undefined)).toEqual({ align: 'center', widthPct: 100, aspect: null });
      expect(parseImageHint('')).toEqual({ align: 'center', widthPct: 100, aspect: null });
      expect(parseImageHint('   ')).toEqual({ align: 'center', widthPct: 100, aspect: null });
      expect(parseImageHint('banana')).toEqual({ align: 'center', widthPct: 100, aspect: null });
   });

   it('parses canonical align + width', () => {
      expect(parseImageHint('left 40')).toEqual({ align: 'left', widthPct: 40, aspect: null });
      expect(parseImageHint('right 45')).toEqual({ align: 'right', widthPct: 45, aspect: null });
      expect(parseImageHint('center 50')).toEqual({ align: 'center', widthPct: 50, aspect: null });
   });

   it('parses an optional aspect after the width (a fixed box)', () => {
      expect(parseImageHint('left 40 0.75')).toEqual({ align: 'left', widthPct: 40, aspect: 0.75 });
      expect(parseImageHint('center 60 1.5')).toEqual({ align: 'center', widthPct: 60, aspect: 1.5 });
      // Aspect is clamped into the box band.
      expect(parseImageHint('center 60 9').aspect).toBe(3.0);
      expect(parseImageHint('center 60 0.01').aspect).toBe(0.2);
   });

   it('pins full to 100 and ignores any stored width', () => {
      expect(parseImageHint('full')).toEqual({ align: 'full', widthPct: 100, aspect: null });
      expect(parseImageHint('full 40')).toEqual({ align: 'full', widthPct: 100, aspect: null });
   });

   it('accepts a trailing % on parse (never emitted)', () => {
      expect(parseImageHint('left 40%')).toEqual({ align: 'left', widthPct: 40, aspect: null });
   });

   it('expands the shipped size-word aliases to center + bucket', () => {
      expect(parseImageHint('small')).toEqual({ align: 'center', widthPct: 30, aspect: null });
      expect(parseImageHint('medium')).toEqual({ align: 'center', widthPct: 50, aspect: null });
   });

   it('defaults a widthless side align to its band midpoint and a widthless center to 100', () => {
      expect(parseImageHint('left')).toEqual({ align: 'left', widthPct: 40, aspect: null });
      expect(parseImageHint('center')).toEqual({ align: 'center', widthPct: 100, aspect: null });
   });

   it('parses a bare width as a centered block', () => {
      expect(parseImageHint('50')).toEqual({ align: 'center', widthPct: 50, aspect: null });
   });

   it('clamps width into the align band', () => {
      expect(parseImageHint('left 5')).toEqual({ align: 'left', widthPct: 25, aspect: null }); // side floor 25
      expect(parseImageHint('left 250')).toEqual({ align: 'left', widthPct: 55, aspect: null }); // side ceil 55
      expect(parseImageHint('center 5')).toEqual({ align: 'center', widthPct: 30, aspect: null }); // center floor 30
   });

   it('ignores extra/unknown tokens (forward-compat)', () => {
      expect(parseImageHint('left 40 xyz')).toEqual({ align: 'left', widthPct: 40, aspect: null });
   });
});

describe('serializeImageHint', () => {
   it('omits the title at the default (center 100)', () => {
      expect(serializeImageHint({ align: 'center', widthPct: 100, aspect: null })).toBeUndefined();
   });

   it('emits full without a width', () => {
      expect(serializeImageHint({ align: 'full', widthPct: 100, aspect: null })).toBe('full');
   });

   it('emits bare "align width" (no %) for side aligns and non-default center', () => {
      expect(serializeImageHint({ align: 'left', widthPct: 40, aspect: null })).toBe('left 40');
      expect(serializeImageHint({ align: 'center', widthPct: 50, aspect: null })).toBe('center 50');
   });

   it('emits the aspect as a third token when a fixed box is set', () => {
      expect(serializeImageHint({ align: 'left', widthPct: 40, aspect: 0.75 })).toBe('left 40 0.75');
      expect(serializeImageHint({ align: 'center', widthPct: 100, aspect: 1.5 })).toBe('center 100 1.5');
      expect(serializeImageHint({ align: 'full', widthPct: 100, aspect: 0.5 })).toBe('full 100 0.5');
   });

   it('round-trips idempotently: parse -> serialize -> parse', () => {
      for (const title of ['left 40', 'right 55', 'center 30', 'left 40 0.75', 'center 60 1.5', 'full', undefined]) {
         const once = parseImageHint(title);
         const serialized = serializeImageHint(once);
         expect(parseImageHint(serialized)).toEqual(once);
      }
   });
});

describe('findImageTokens', () => {
   it('finds every token in order with span + parts', () => {
      const body = `intro ![a map](asset:${HASH} "left 40") mid ![](asset:${HASH2})`;
      const tokens = findImageTokens(body);
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toMatchObject({ hash: HASH, title: 'left 40', alt: 'a map' });
      expect(tokens[1]).toMatchObject({ hash: HASH2, title: '', alt: '' });
      // Spans are exact.
      expect(body.slice(tokens[0].index, tokens[0].index + tokens[0].length)).toBe(`![a map](asset:${HASH} "left 40")`);
   });

   it('keys the same asset used twice by ABSOLUTE OFFSET, never by hash', () => {
      const body = `![](asset:${HASH}) then again ![](asset:${HASH})`;
      const tokens = findImageTokens(body);
      expect(tokens).toHaveLength(2);
      expect(tokens[0].hash).toBe(tokens[1].hash);
      expect(tokens[0].index).not.toBe(tokens[1].index); // distinct rewrite identities
   });
});

describe('activeImageTokenAt', () => {
   it('returns the token whose span contains the caret (inclusive of both ends)', () => {
      const body = `x ![](asset:${HASH}) y`;
      const token = findImageTokens(body)[0];
      expect(activeImageTokenAt(body, token.index)?.hash).toBe(HASH); // at the start
      expect(activeImageTokenAt(body, token.index + token.length)?.hash).toBe(HASH); // at the end
      expect(activeImageTokenAt(body, 0)).toBeNull(); // outside
   });

   it('distinguishes two uses of the same asset by caret position', () => {
      const body = `![](asset:${HASH}) mid ![](asset:${HASH})`;
      const [first, second] = findImageTokens(body);
      expect(activeImageTokenAt(body, first.index + 1)?.index).toBe(first.index);
      expect(activeImageTokenAt(body, second.index + 1)?.index).toBe(second.index);
   });
});

describe('rewriteImageHintAt', () => {
   it('rewrites ONE token, leaving the rest byte-identical', () => {
      const body = `A ![c](asset:${HASH}) B ![d](asset:${HASH2}) C`;
      const target = findImageTokens(body)[0];
      const next = rewriteImageHintAt(body, target.index, { align: 'left', widthPct: 40, aspect: null });
      expect(next).toBe(`A ![c](asset:${HASH} "left 40") B ![d](asset:${HASH2}) C`);
   });

   it('drops the title when the layout serializes to the default', () => {
      const body = `![c](asset:${HASH} "left 40")`;
      const target = findImageTokens(body)[0];
      expect(rewriteImageHintAt(body, target.index, { align: 'center', widthPct: 100, aspect: null })).toBe(`![c](asset:${HASH})`);
   });

   it('can also rewrite the alt (caption)', () => {
      const body = `![](asset:${HASH})`;
      expect(rewriteImageHintAt(body, 0, { align: 'center', widthPct: 100, aspect: null }, 'a caption')).toBe(`![a caption](asset:${HASH})`);
   });

   it('never touches the asset:HASH src (the anti-data-loss guarantee)', () => {
      const body = `![](asset:${HASH} "center 50")`;
      const out = rewriteImageHintAt(body, 0, { align: 'left', widthPct: 55, aspect: null });
      expect(out).toContain(`asset:${HASH}`);
   });

   it('is a no-op when the offset does not start a token', () => {
      const body = 'no image here';
      expect(rewriteImageHintAt(body, 3, { align: 'left', widthPct: 40, aspect: null })).toBe(body);
   });
});

describe('resizeWidthPct', () => {
   it('maps a rightward drag to a wider snapped percent', () => {
      // +300px over a 600px column = +50% -> 40 + 50 = 90, snapped to 90.
      expect(resizeWidthPct(40, 300, 600)).toBe(90);
   });

   it('maps a leftward drag to a narrower snapped percent', () => {
      // -150px over 600px = -25% -> 55 - 25 = 30.
      expect(resizeWidthPct(55, -150, 600)).toBe(30);
   });

   it('snaps to 5% steps', () => {
      // +20px over 600px = +3.33% -> 43.33, snapped to 45 (nearest 5).
      expect(resizeWidthPct(40, 20, 600)).toBe(45);
   });

   it('is safe against a zero column width', () => {
      expect(resizeWidthPct(40, 100, 0)).toBeGreaterThan(40);
   });
});

describe('align is a block, never a wrap', () => {
   it('rewriting to a left align only swaps the hint - the blank line stays (no gluing)', () => {
      const body = `![](asset:${HASH})\n\nLore below it.`;
      const left = rewriteImageHintAt(body, 0, { align: 'left', widthPct: 40, aspect: null });
      expect(left).toBe(`![](asset:${HASH} "left 40")\n\nLore below it.`);
   });

   it('switching a left align back to center leaves the surrounding text untouched', () => {
      const body = `![](asset:${HASH} "left 40")\n\nLore below it.`;
      const centered = rewriteImageHintAt(body, 0, { align: 'center', widthPct: 100, aspect: null });
      expect(centered).toBe(`![](asset:${HASH})\n\nLore below it.`);
   });
});

describe('hasImageTokenInRange', () => {
   // The cover gutter feeds a line's [from, to] here to decide whether that line is a block image (so it clears
   // the cover exactly like a table). Detection reuses `findImageTokens`, so it can't drift from the widget.
   const IMG = `![](asset:${HASH})`;

   it('is true when an image token starts inside the range', () => {
      const body = `Intro\n${IMG}\nMore`;
      const lineStart = body.indexOf(IMG);
      expect(hasImageTokenInRange(body, lineStart, lineStart + IMG.length)).toBe(true);
   });

   it('is true for an image on the FIRST line', () => {
      const body = `${IMG}\n\nLore below.`;
      expect(hasImageTokenInRange(body, 0, IMG.length)).toBe(true);
   });

   it('is false for a plain-text line', () => {
      const body = `Intro\n${IMG}`;
      // The first line ("Intro") holds no image token.
      expect(hasImageTokenInRange(body, 0, 5)).toBe(false);
   });

   it('does not match a token that merely overlaps the range end from outside', () => {
      const body = `Intro\n${IMG}`;
      const imgStart = body.indexOf(IMG);
      // A range ending one byte before the token start must not claim it.
      expect(hasImageTokenInRange(body, 0, imgStart - 1)).toBe(false);
   });
});
