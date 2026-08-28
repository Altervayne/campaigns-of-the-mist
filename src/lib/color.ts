/*
 * Small, dependency-free color helpers shared by the board's color-able items, the color PICKER, and the
 * theme-derivation engine. The pure hex/rgb/hsl/cmyk conversions live here (the picker keeps only its
 * stateful sticky-hue logic); the WCAG contrast helpers power the derivation's auto-contrast foregrounds.
 */

// ==================
//  Parsing + conversions (pure)
// ==================

/** Parses a `#rrggbb` hex (with or without the `#`) to `[r, g, b]`, or null when malformed. */
export function hexToRgb(hex: string): [number, number, number] | null {
   const match = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
   return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : null;
}

/** `[r, g, b]` (0-255) to `#rrggbb`, each channel clamped. */
export function rgbToHex(red: number, green: number, blue: number): string {
   return '#' + [red, green, blue].map((component) => Math.max(0, Math.min(255, Math.round(component))).toString(16).padStart(2, '0')).join('');
}

export function hsvToRgb(hue: number, saturation: number, value: number): [number, number, number] {
   saturation /= 100; value /= 100;
   const chroma = value * saturation;
   const intermediate = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
   const offset = value - chroma;
   let red = 0, green = 0, blue = 0;
   if      (hue < 60)  { red = chroma; green = intermediate; }
   else if (hue < 120) { red = intermediate; green = chroma; }
   else if (hue < 180) { green = chroma; blue = intermediate; }
   else if (hue < 240) { green = intermediate; blue = chroma; }
   else if (hue < 300) { red = intermediate; blue = chroma; }
   else                { red = chroma; blue = intermediate; }
   return [Math.round((red + offset) * 255), Math.round((green + offset) * 255), Math.round((blue + offset) * 255)];
}

export function rgbToHsv(red: number, green: number, blue: number): [number, number, number] {
   red /= 255; green /= 255; blue /= 255;
   const max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min;
   const valueHSV = max, saturationHSV = max === 0 ? 0 : delta / max;
   let hueHSV = 0;
   if (delta !== 0) {
      if      (max === red)   hueHSV = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6;
      else if (max === green) hueHSV = ((blue - red) / delta + 2) / 6;
      else                    hueHSV = ((red - green) / delta + 4) / 6;
   }
   return [Math.round(hueHSV * 360), Math.round(saturationHSV * 100), Math.round(valueHSV * 100)];
}

export function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
   red /= 255; green /= 255; blue /= 255;
   const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
   const lightness = (max + min) / 2;
   if (max === min) return [0, 0, Math.round(lightness * 100)];
   const delta = max - min;
   const saturationHSL = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
   let hueHSL = 0;
   if      (max === red)   hueHSL = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6;
   else if (max === green) hueHSL = ((blue - red) / delta + 2) / 6;
   else                    hueHSL = ((red - green) / delta + 4) / 6;
   return [Math.round(hueHSL * 360), Math.round(saturationHSL * 100), Math.round(lightness * 100)];
}

export function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
   hue /= 360; saturation /= 100; lightness /= 100;
   if (saturation === 0) { const gray = Math.round(lightness * 255); return [gray, gray, gray]; }
   const quadrant = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
   const base = 2 * lightness - quadrant;
   const hueChannel = (hueInput: number) => {
      hueInput = ((hueInput % 1) + 1) % 1;
      if (hueInput < 1 / 6) return base + (quadrant - base) * 6 * hueInput;
      if (hueInput < 1 / 2) return quadrant;
      if (hueInput < 2 / 3) return base + (quadrant - base) * (2 / 3 - hueInput) * 6;
      return base;
   };
   return [Math.round(hueChannel(hue + 1 / 3) * 255), Math.round(hueChannel(hue) * 255), Math.round(hueChannel(hue - 1 / 3) * 255)];
}

export function rgbToCmyk(red: number, green: number, blue: number): [number, number, number, number] {
   red /= 255; green /= 255; blue /= 255;
   const black = 1 - Math.max(red, green, blue);
   if (black >= 1) return [0, 0, 0, 100];
   return [
      Math.round(((1 - red - black) / (1 - black)) * 100),
      Math.round(((1 - green - black) / (1 - black)) * 100),
      Math.round(((1 - blue - black) / (1 - black)) * 100),
      Math.round(black * 100),
   ];
}

export function cmykToRgb(cyan: number, magenta: number, yellow: number, black: number): [number, number, number] {
   cyan /= 100; magenta /= 100; yellow /= 100; black /= 100;
   return [
      Math.round(255 * (1 - cyan) * (1 - black)),
      Math.round(255 * (1 - magenta) * (1 - black)),
      Math.round(255 * (1 - yellow) * (1 - black)),
   ];
}

/** `#rrggbb` to `[h, s, l]` (h 0-360, s/l 0-100), or null when malformed. */
export function hexToHsl(hex: string): [number, number, number] | null {
   const rgb = hexToRgb(hex);
   return rgb ? rgbToHsl(...rgb) : null;
}

/** Formats HSL components as the space-separated `hsl(H S% L%)` string the themes use. */
export function formatHsl(hue: number, saturation: number, lightness: number): string {
   return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
}

/** Parses a CSS color (hex or `hsl(H S% L%)` / `hsl(H, S%, L%)`) to `[r, g, b]`, or null. */
export function parseColorToRgb(color: string): [number, number, number] | null {
   const trimmed = color.trim();
   if (trimmed.startsWith('#')) return hexToRgb(trimmed);
   const hsl = trimmed.match(/^hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)$/i);
   if (hsl) return hslToRgb(parseFloat(hsl[1]), parseFloat(hsl[2]), parseFloat(hsl[3]));
   return null;
}

/** `[h, s, l]` for a CSS color (hex or hsl), falling back to a neutral gray when unparseable. */
export function colorToHsl(color: string): [number, number, number] {
   const rgb = parseColorToRgb(color);
   return rgb ? rgbToHsl(...rgb) : [0, 0, 50];
}

// ==================
//  Luminance + contrast (WCAG)
// ==================

/** WCAG relative luminance (0-1) of an `[r, g, b]` color. */
export function relativeLuminance([red, green, blue]: [number, number, number]): number {
   const channel = (value: number) => {
      const srgb = value / 255;
      return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
   };
   return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** WCAG contrast ratio (1-21) between two CSS colors; 1 if either can't be parsed. */
export function contrastRatio(a: string, b: string): number {
   const rgbA = parseColorToRgb(a), rgbB = parseColorToRgb(b);
   if (!rgbA || !rgbB) return 1;
   const lumA = relativeLuminance(rgbA), lumB = relativeLuminance(rgbB);
   const lighter = Math.max(lumA, lumB), darker = Math.min(lumA, lumB);
   return (lighter + 0.05) / (darker + 0.05);
}

// ==================
//  Readable text color (board notes)
// ==================

/** Near-black / near-white text colors, picked to read on a colored background. */
const DARK_TEXT = '#1c1917';
const LIGHT_TEXT = '#f5f5f4';

/**
 * Returns a legible text color for text drawn on `background`, chosen by the background's
 * perceived luminance: dark text on light pastels, light text on dark customs, so a note
 * stays readable on any color. Accepts hex or `hsl()` (card palette tokens are hsl); an
 * unparseable color falls back to dark text.
 */
export function readableTextColor(background: string): string {
   const rgb = parseColorToRgb(background);
   if (!rgb) return DARK_TEXT;
   const [red, green, blue] = rgb;
   // sRGB-weighted luminance, 0..1; the 0.6 threshold leans toward dark text on pastels.
   const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
   return luminance > 0.6 ? DARK_TEXT : LIGHT_TEXT;
}
