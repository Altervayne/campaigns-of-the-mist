// -- Utils Imports --
import { parseColorToRgb, rgbToHex } from '@/lib/color';

/** Any CSS color -> `#rrggbb` so the picker (hex-based) opens on the current value. Guards a missing value. */
export function toHex(color: string | undefined | null): string {
   if (!color) return '#000000';
   const rgb = parseColorToRgb(color);
   return rgb ? rgbToHex(...rgb) : '#000000';
}
