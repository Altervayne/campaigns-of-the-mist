// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import {
   colorToHsl, contrastRatio, formatHsl, hexToHsl, hexToRgb, hslToRgb, parseColorToRgb, readableTextColor, rgbToHex, rgbToHsl,
} from './color';

const DARK_TEXT = '#1c1917';
const LIGHT_TEXT = '#f5f5f4';

describe('hexToRgb', () => {
   it('parses with and without the leading #', () => {
      expect(hexToRgb('#ff8800')).toEqual([255, 136, 0]);
      expect(hexToRgb('ff8800')).toEqual([255, 136, 0]);
   });

   it('returns null for a malformed hex', () => {
      expect(hexToRgb('#xyz')).toBeNull();
      expect(hexToRgb('#fff')).toBeNull(); // shorthand is not supported
   });
});

describe('readableTextColor', () => {
   it('uses dark text on light pastels', () => {
      expect(readableTextColor('#fde68a')).toBe(DARK_TEXT); // the default amber
      expect(readableTextColor('#ffffff')).toBe(DARK_TEXT);
      expect(readableTextColor('#bfdbfe')).toBe(DARK_TEXT);
   });

   it('uses light text on dark custom colors', () => {
      expect(readableTextColor('#000000')).toBe(LIGHT_TEXT);
      expect(readableTextColor('#1e3a8a')).toBe(LIGHT_TEXT); // a dark blue
      expect(readableTextColor('#7f1d1d')).toBe(LIGHT_TEXT); // a dark red
   });

   it('parses hsl too (card palette tokens are hsl)', () => {
      expect(readableTextColor('hsl(216 35% 35%)')).toBe(LIGHT_TEXT); // a dark card header
      expect(readableTextColor('hsl(40 68% 92%)')).toBe(DARK_TEXT);   // a pale card header
   });

   it('falls back to dark text on an unparseable color', () => {
      expect(readableTextColor('not-a-color')).toBe(DARK_TEXT);
   });
});

describe('hex <-> hsl conversions', () => {
   it('round-trips hex -> hsl -> rgb -> hex within rounding tolerance', () => {
      for (const hex of ['#ff8800', '#3366cc', '#1c1917', '#7a4f9e', '#10b981']) {
         const back = rgbToHex(...hslToRgb(...hexToHsl(hex)!));
         const [r0, g0, b0] = hexToRgb(hex)!;
         const [r1, g1, b1] = hexToRgb(back)!;
         expect(Math.abs(r0 - r1)).toBeLessThanOrEqual(3);
         expect(Math.abs(g0 - g1)).toBeLessThanOrEqual(3);
         expect(Math.abs(b0 - b1)).toBeLessThanOrEqual(3);
      }
   });

   it('rgbToHsl reads pure colors', () => {
      expect(rgbToHsl(255, 0, 0)).toEqual([0, 100, 50]);
      expect(rgbToHsl(0, 0, 0)).toEqual([0, 0, 0]);
      expect(rgbToHsl(255, 255, 255)).toEqual([0, 0, 100]);
   });

   it('formatHsl emits the space-separated theme form (rounded)', () => {
      expect(formatHsl(210.4, 40.6, 98.2)).toBe('hsl(210 41% 98%)');
   });
});

describe('parseColorToRgb / colorToHsl', () => {
   it('parses hex and both hsl separators', () => {
      expect(parseColorToRgb('#ffffff')).toEqual([255, 255, 255]);
      expect(parseColorToRgb('hsl(0 0% 0%)')).toEqual([0, 0, 0]);
      expect(parseColorToRgb('hsl(0, 0%, 100%)')).toEqual([255, 255, 255]);
   });

   it('returns null / a neutral fallback for garbage', () => {
      expect(parseColorToRgb('not-a-color')).toBeNull();
      expect(colorToHsl('nonsense')).toEqual([0, 0, 50]);
   });
});

describe('contrastRatio', () => {
   it('is ~21 for black vs white (hex and hsl) and 1 for identical colors', () => {
      expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
      expect(contrastRatio('hsl(0 0% 0%)', 'hsl(0 0% 100%)')).toBeCloseTo(21, 0);
      expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
   });

   it('is symmetric', () => {
      expect(contrastRatio('hsl(0 0% 20%)', 'hsl(0 0% 90%)')).toBeCloseTo(contrastRatio('hsl(0 0% 90%)', 'hsl(0 0% 20%)'), 5);
   });
});
