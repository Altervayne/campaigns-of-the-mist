// -- React Imports --
import type { CSSProperties } from 'react';

// -- Package Imports --
import { ColorPicker as PiquaColorPicker } from 'react-piqua-color';
import 'react-piqua-color/style.css';

/*
 * Thin adapter over `react-piqua-color` - our own published package, extracted from this app's
 * original in-house picker so fixes live upstream. The package is framework-agnostic and themes
 * through `--pqc-*` custom properties; we bind those to the app's theme tokens so the picker stays
 * palette-adaptive. Because the app tokens already re-resolve per game / custom theme and flip
 * under `.dark`, the picker follows all of it for free - no `pqc-dark` class needed.
 *
 * The `{ value, onChange }` contract is kept identical so ColorPopover and every consumer are
 * untouched. onChange fires continuously during a drag, exactly as before.
 */

interface ColorPickerProps {
   value: string;
   onChange: (hex: string) => void;
}

// Package token -> app theme token. Thumb rings, mono font, and sizes keep the package defaults,
// which already match the original picker (120px SV square, 12px hue bar, 0.5rem radius, white thumbs).
const APP_THEME_TOKENS = {
   '--pqc-surface': 'var(--popover)',
   '--pqc-bg': 'var(--background)',
   '--pqc-text': 'var(--foreground)',
   '--pqc-muted': 'var(--muted-foreground)',
   '--pqc-border': 'var(--border)',
   '--pqc-accent': 'var(--ring)',
} as CSSProperties;

export function ColorPicker({ value, onChange }: ColorPickerProps) {
   return <PiquaColorPicker value={value} onChange={onChange} style={APP_THEME_TOKENS} />;
}
