/*
 * The chrome-theme token registry: the single source of truth for which CSS variables a theme controls,
 * the four built-in presets' values (lifted from global.css so "duplicate a preset" works in JS), and the
 * helpers that turn a token set into the CSS a custom theme injects at runtime. The .card-type-* game
 * colors are NOT chrome and live only in global.css - never here.
 */

// -- Type Imports --
import type { ResolvedMode } from '@/lib/theme/themeMode';

/** The 19 chrome color tokens every theme defines, in editor / injection / duplicate order. */
export const CHROME_TOKEN_KEYS = [
   'background', 'foreground',
   'card', 'card-foreground',
   'popover', 'popover-foreground',
   'primary', 'primary-foreground',
   'secondary', 'secondary-foreground',
   'muted', 'muted-foreground',
   'accent', 'accent-foreground',
   'destructive', 'destructive-foreground',
   'border', 'input', 'ring',
] as const;

export type ChromeTokenKey = (typeof CHROME_TOKEN_KEYS)[number];

/** A full chrome palette: one CSS color string per token. */
export type TokenSet = Record<ChromeTokenKey, string>;

/**
 * The 11 "paper" tokens: a game-agnostic palette for elements that use the card-* paper look without a game
 * card-type (drawer trackers, NEUTRAL items). MODE-AGNOSTIC - one value each, no light/dark split, so paper
 * reads the same in both modes like a real game card. Drives the `:root` card-* fallback in global.css.
 */
export const PAPER_TOKEN_KEYS = [
   'paper-background', 'paper-foreground', 'paper-border',
   'paper-primary', 'paper-primary-foreground',
   'paper-secondary', 'paper-secondary-foreground',
   'paper-accent', 'paper-accent-foreground',
   'paper-destructive', 'paper-destructive-foreground',
] as const;

export type PaperTokenKey = (typeof PAPER_TOKEN_KEYS)[number];

/** A full paper palette: one CSS color string per paper token. */
export type PaperSet = Record<PaperTokenKey, string>;

/** The classic parchment shared by every preset (kept in sync with the `:root --paper-*` in global.css). */
export const CLASSIC_PAPER: PaperSet = {
   'paper-background': 'hsl(39 56% 91%)',
   'paper-foreground': 'hsl(28 18% 20%)',
   'paper-border': 'hsl(30 20% 32%)',
   'paper-primary': 'hsl(28 30% 34%)',
   'paper-primary-foreground': 'hsl(40 56% 93%)',
   'paper-secondary': 'hsl(42 38% 82%)',
   'paper-secondary-foreground': 'hsl(30 18% 22%)',
   'paper-accent': 'hsl(34 48% 50%)',
   'paper-accent-foreground': 'hsl(40 56% 93%)',
   'paper-destructive': 'hsl(10 72% 82%)',
   'paper-destructive-foreground': 'hsl(12 35% 24%)',
};

/**
 * The editor's grouping of the 19 tokens: each surface paired with the foreground that sits on it, so the
 * two are edited side by side. Structure only - the section + token display labels are i18n
 * (`SettingsDialog.themes.groups.*` / `.tokens.*`), so the editor resolves them. (`ring` rides the primary
 * group; `border`/`input` have no foreground pair.)
 */
export const TOKEN_GROUPS: { id: string; tokens: ChromeTokenKey[] }[] = [
   { id: 'base', tokens: ['background', 'foreground'] },
   { id: 'card', tokens: ['card', 'card-foreground'] },
   { id: 'popover', tokens: ['popover', 'popover-foreground'] },
   { id: 'primary', tokens: ['primary', 'primary-foreground', 'ring'] },
   { id: 'secondary', tokens: ['secondary', 'secondary-foreground'] },
   { id: 'muted', tokens: ['muted', 'muted-foreground'] },
   { id: 'accent', tokens: ['accent', 'accent-foreground'] },
   { id: 'destructive', tokens: ['destructive', 'destructive-foreground'] },
   { id: 'lines', tokens: ['border', 'input'] },
];

/* The unified generator's types: seed roles by tier + two modifier axes (saturation, contrast). */

/** The seed roles the generator fills by tier: accent appears at tier 3, secondary at tier 4. */
export interface SeedSet {
   primary: string;
   background: string;
   accent?: string;
   secondary?: string;
}

/** How many seed roles the generator exposes: 2 (Primary + Background), 3 (+ Accent), 4 (+ Secondary). */
export type GeneratorTier = 2 | 3 | 4;

/** Saturation axis: near-gray surfaces -> moderate tint -> bold tinted surfaces + a real accent. */
export type SaturationLevel = 'minimal' | 'balanced' | 'vivid';

/** Contrast axis: a compressed gentle ramp -> the preset ramp -> a widened ramp with more-visible borders. */
export type ContrastLevel = 'soft' | 'normal' | 'contrasted';

/** Everything the unified generator needs. `seeds` is one set, or a light/dark pair when `separateModes`. */
export interface GeneratorSettings {
   tier: GeneratorTier;
   separateModes: boolean;
   saturation: SaturationLevel;
   contrast: ContrastLevel;
   seeds: SeedSet | { light: SeedSet; dark: SeedSet };
}

/**
 * A user-defined theme. `light` / `dark` are the resolved palettes that actually apply (the source of
 * truth); `radius` is the shared corner size. When the theme was filled from the generator, `generator`
 * records the settings that produced it (so the panel restores + re-generates; manual edits afterwards win).
 */
export interface CustomTheme {
   id: string;
   name: string;
   light: TokenSet;
   dark: TokenSet;
   radius: string;
   // The game-agnostic paper palette (mode-agnostic): one value per token, applied the same in light + dark.
   paper: PaperSet;
   generator?: GeneratorSettings;
}

/** A custom theme's active value (and CSS class) is `theme-custom-{id}`, so the preset class-swap just works. */
export const CUSTOM_THEME_PREFIX = 'theme-custom-';

/** The active value for a custom theme by id (its value IS its class). */
export const customThemeClass = (id: string): `theme-custom-${string}` => `${CUSTOM_THEME_PREFIX}${id}`;

/** The id embedded in a `theme-custom-{id}` value, or null if this isn't a custom theme value. */
export const customThemeIdFromClass = (theme: string): string | null =>
   theme.startsWith(CUSTOM_THEME_PREFIX) ? theme.slice(CUSTOM_THEME_PREFIX.length) : null;

/** The id of the managed `<style>` element that holds the active custom theme's rules. */
export const CUSTOM_THEME_STYLE_ID = 'cotm-custom-theme';

/**
 * Serializes a token set to CSS custom-property declarations (`--background: <v>; ...`), appending
 * `--radius: <radius>;` when a radius is given (the light rule carries it; dark only overrides colors).
 */
export function tokenSetToCssVars(set: TokenSet, radius?: string): string {
   const declarations = CHROME_TOKEN_KEYS.map((key) => `--${key}: ${set[key]};`);
   if (radius !== undefined) declarations.push(`--radius: ${radius};`);
   return declarations.join(' ');
}

/** Serializes a paper palette to its `--paper-*` declarations (mode-agnostic - rides the base rule only). */
export function paperSetToCssVars(paper: PaperSet): string {
   return PAPER_TOKEN_KEYS.map((key) => `--${key}: ${paper[key]};`).join(' ');
}

/**
 * The editor's grouping of the 11 paper tokens, like TOKEN_GROUPS but single-column (paper is mode-agnostic).
 * Surface paired with its foreground where there is one. Labels are i18n (`SettingsDialog.themes.paper.*`).
 */
export const PAPER_GROUPS: { id: string; tokens: PaperTokenKey[] }[] = [
   { id: 'paper-base', tokens: ['paper-background', 'paper-foreground'] },
   { id: 'paper-header', tokens: ['paper-primary', 'paper-primary-foreground'] },
   { id: 'paper-secondary', tokens: ['paper-secondary', 'paper-secondary-foreground'] },
   { id: 'paper-lines', tokens: ['paper-border'] },
   { id: 'paper-accent', tokens: ['paper-accent', 'paper-accent-foreground'] },
   { id: 'paper-danger', tokens: ['paper-destructive', 'paper-destructive-foreground'] },
];

/** The built-in presets' display names (brand proper nouns, not translated), in selector order. */
export const PRESET_LABELS: Record<string, string> = {
   'theme-neutral': 'Neutral',
   'theme-legends': 'Legends in the Mist',
   'theme-otherscape': ':Otherscape',
   'theme-city-of-mist': 'City of Mist',
};

/** The built-in presets, keyed by their theme class - light/dark palettes + radius + paper lifted from global.css. */
export const PRESET_THEMES: Record<string, { light: TokenSet; dark: TokenSet; radius: string; paper: PaperSet }> = {
   'theme-neutral': {
      radius: '0.5rem',
      paper: CLASSIC_PAPER,
      light: {
         background: 'hsl(0 0% 96%)', foreground: 'hsl(222.2 84% 4.9%)',
         card: 'hsl(0 0% 100%)', 'card-foreground': 'hsl(222.2 84% 4.9%)',
         popover: 'hsl(0 0% 98%)', 'popover-foreground': 'hsl(222.2 84% 4.9%)',
         primary: 'hsl(222.2 47.4% 11.2%)', 'primary-foreground': 'hsl(210 40% 98%)',
         secondary: 'hsl(210 40% 96.1%)', 'secondary-foreground': 'hsl(222.2 47.4% 11.2%)',
         muted: 'hsl(210 40% 96.1%)', 'muted-foreground': 'hsl(215.4 16.3% 44%)',
         accent: 'hsl(210 40% 96.1%)', 'accent-foreground': 'hsl(222.2 47.4% 11.2%)',
         destructive: 'hsl(0 72% 44%)', 'destructive-foreground': 'hsl(210 40% 98%)',
         border: 'hsl(214.3 31.8% 91.4%)', input: 'hsl(214.3 31.8% 91.4%)', ring: 'hsl(222.2 84% 4.9%)',
      },
      dark: {
         background: 'hsl(222.2 84% 5%)', foreground: 'hsl(210 40% 98%)',
         card: 'hsl(222.2 84% 10%)', 'card-foreground': 'hsl(210 40% 98%)',
         popover: 'hsl(222.2 84% 7.5%)', 'popover-foreground': 'hsl(210 40% 98%)',
         primary: 'hsl(210 40% 98%)', 'primary-foreground': 'hsl(222.2 47.4% 11.2%)',
         secondary: 'hsl(217.2 32.6% 17.5%)', 'secondary-foreground': 'hsl(210 40% 98%)',
         muted: 'hsl(217.2 32.6% 17.5%)', 'muted-foreground': 'hsl(215 20.2% 65.1%)',
         accent: 'hsl(217.2 32.6% 17.5%)', 'accent-foreground': 'hsl(210 40% 98%)',
         destructive: 'hsl(0 63% 47%)', 'destructive-foreground': 'hsl(210 40% 98%)',
         border: 'hsl(217.2 32.6% 17.5%)', input: 'hsl(217.2 32.6% 17.5%)', ring: 'hsl(212.7 26.8% 83.9%)',
      },
   },
   'theme-legends': {
      radius: '0.5rem',
      paper: CLASSIC_PAPER,
      light: {
         background: 'hsl(210 6% 96%)', foreground: 'hsl(30 25% 10%)',
         card: 'hsl(43 40% 92%)', 'card-foreground': 'hsl(30 25% 10%)',
         popover: 'hsl(42 35% 85%)', 'popover-foreground': 'hsl(30 25% 10%)',
         primary: 'hsl(25 50% 20%)', 'primary-foreground': 'hsl(43 40% 98%)',
         secondary: 'hsl(210 8% 82%)', 'secondary-foreground': 'hsl(30 25% 10%)',
         muted: 'hsl(210 8% 82%)', 'muted-foreground': 'hsl(30 22% 32%)',
         accent: 'hsl(38 30% 76%)', 'accent-foreground': 'hsl(30 25% 10%)',
         destructive: 'hsl(0 72% 44%)', 'destructive-foreground': 'hsl(0 0% 98%)',
         border: 'hsl(25 30% 35%)', input: 'hsl(25 30% 35%)', ring: 'hsl(25 50% 20%)',
      },
      dark: {
         background: 'hsl(43 31% 5%)', foreground: 'hsl(43 30% 83%)',
         card: 'hsl(43 31% 15%)', 'card-foreground': 'hsl(43 30% 83%)',
         popover: 'hsl(43 31% 10%)', 'popover-foreground': 'hsl(43 30% 83%)',
         primary: 'hsl(43 30% 83%)', 'primary-foreground': 'hsl(43 31% 15%)',
         secondary: 'hsl(43 31% 25%)', 'secondary-foreground': 'hsl(43 30% 83%)',
         muted: 'hsl(43 31% 25%)', 'muted-foreground': 'hsl(43 16% 71%)',
         accent: 'hsl(43 31% 25%)', 'accent-foreground': 'hsl(43 30% 83%)',
         destructive: 'hsl(0 63% 47%)', 'destructive-foreground': 'hsl(0 0% 98%)',
         border: 'hsl(43 31% 25%)', input: 'hsl(43 31% 25%)', ring: 'hsl(43 30% 83%)',
      },
   },
   'theme-city-of-mist': {
      radius: '0.5rem',
      paper: CLASSIC_PAPER,
      light: {
         background: 'hsl(240 10% 96%)', foreground: 'hsl(240 18% 10%)',
         card: 'hsl(240 15% 82%)', 'card-foreground': 'hsl(240 18% 10%)',
         popover: 'hsl(240 12% 88%)', 'popover-foreground': 'hsl(240 18% 10%)',
         primary: 'hsl(280 40% 42%)', 'primary-foreground': 'hsl(240 15% 96%)',
         secondary: 'hsl(240 12% 68%)', 'secondary-foreground': 'hsl(240 18% 10%)',
         muted: 'hsl(240 12% 68%)', 'muted-foreground': 'hsl(240 12% 25%)',
         accent: 'hsl(25 45% 72%)', 'accent-foreground': 'hsl(240 18% 10%)',
         destructive: 'hsl(0 72% 44%)', 'destructive-foreground': 'hsl(240 15% 96%)',
         border: 'hsl(240 12% 55%)', input: 'hsl(240 12% 55%)', ring: 'hsl(280 40% 42%)',
      },
      dark: {
         background: 'hsl(240 8% 12%)', foreground: 'hsl(240 5% 88%)',
         card: 'hsl(240 10% 16%)', 'card-foreground': 'hsl(240 5% 88%)',
         popover: 'hsl(240 10% 14%)', 'popover-foreground': 'hsl(240 5% 88%)',
         primary: 'hsl(280 25% 35%)', 'primary-foreground': 'hsl(240 5% 95%)',
         secondary: 'hsl(240 6% 22%)', 'secondary-foreground': 'hsl(240 5% 88%)',
         muted: 'hsl(240 6% 22%)', 'muted-foreground': 'hsl(240 5% 64%)',
         accent: 'hsl(25 45% 40%)', 'accent-foreground': 'hsl(240 5% 95%)',
         destructive: 'hsl(0 63% 47%)', 'destructive-foreground': 'hsl(240 5% 96%)',
         border: 'hsl(240 6% 28%)', input: 'hsl(240 6% 28%)', ring: 'hsl(280 50% 35%)',
      },
   },
   'theme-otherscape': {
      radius: '0.5rem',
      paper: CLASSIC_PAPER,
      light: {
         background: 'hsl(210 5% 88%)', foreground: 'hsl(210 18% 12%)',
         card: 'hsl(210 6% 94%)', 'card-foreground': 'hsl(210 18% 12%)',
         popover: 'hsl(210 5% 91%)', 'popover-foreground': 'hsl(210 18% 12%)',
         primary: 'hsl(200 75% 38%)', 'primary-foreground': 'hsl(210 15% 98%)',
         secondary: 'hsl(210 10% 68%)', 'secondary-foreground': 'hsl(210 18% 12%)',
         muted: 'hsl(210 10% 68%)', 'muted-foreground': 'hsl(210 12% 25%)',
         accent: 'hsl(80 65% 72%)', 'accent-foreground': 'hsl(210 18% 12%)',
         destructive: 'hsl(0 72% 44%)', 'destructive-foreground': 'hsl(0 0% 98%)',
         border: 'hsl(210 15% 52%)', input: 'hsl(210 15% 52%)', ring: 'hsl(200 75% 38%)',
      },
      dark: {
         background: 'hsl(225 23% 8%)', foreground: 'hsl(190 67% 94%)',
         card: 'hsl(225 23% 8%)', 'card-foreground': 'hsl(190 67% 94%)',
         popover: 'hsl(225 23% 8%)', 'popover-foreground': 'hsl(190 67% 94%)',
         primary: 'hsl(76 100% 70%)', 'primary-foreground': 'hsl(225 23% 8%)',
         secondary: 'hsl(225 10% 20%)', 'secondary-foreground': 'hsl(190 67% 94%)',
         muted: 'hsl(225 10% 20%)', 'muted-foreground': 'hsl(190, 25%, 57%)',
         accent: 'hsl(190 70% 65%)', 'accent-foreground': 'hsl(225 23% 8%)',
         destructive: 'hsl(0 63% 47%)', 'destructive-foreground': 'hsl(0 0% 98%)',
         border: 'hsl(225 10% 20%)', input: 'hsl(225 10% 20%)', ring: 'hsl(76 100% 70%)',
      },
   },
};

/** A theme's palettes for both modes - what a swatch (or a duplicate) reads from. */
export interface ThemeTokenSource {
   light: TokenSet;
   dark: TokenSet;
   radius: string;
   paper: PaperSet;
}

/** The palette a theme renders as under the given light/dark mode, so a preview shows its real colors right now. */
export function resolveThemeTokens(source: ThemeTokenSource, resolvedMode: ResolvedMode): TokenSet {
   return resolvedMode === 'dark' ? source.dark : source.light;
}

/**
 * Resolves an active theme value to the class to put on `<html>` and the CSS for the managed style element.
 * A preset injects no CSS (its rules live in global.css). A custom theme injects its light + dark rules. A
 * custom value whose theme no longer exists (deleted / stale) falls back to a preset and reports it, so the
 * caller can correct the store and the app never ends up unstyled.
 */
export function resolveActiveTheme(
   theme: string,
   customThemes: CustomTheme[],
   fallback = 'theme-neutral',
   draft?: CustomTheme | null,
): { className: string; css: string; isStale: boolean } {
   const id = customThemeIdFromClass(theme);
   if (id === null) return { className: theme, css: '', isStale: false };

   const saved = customThemes.find((entry) => entry.id === id);
   if (!saved) return { className: fallback, css: '', isStale: true };

   // While editing, the draft for THIS theme drives the live CSS, so the whole app previews unsaved edits.
   const source = draft && draft.id === id ? draft : saved;

   // Paper rides the base rule only (mode-agnostic).
   const css =
      `.${theme} { ${tokenSetToCssVars(source.light, source.radius)} ${paperSetToCssVars(source.paper)} }\n` +
      `.dark.${theme} { ${tokenSetToCssVars(source.dark)} }`;
   return { className: theme, css, isStale: false };
}

/**
 * Whether two themes match on the EDITOR-owned fields (light, dark, radius, paper, generator) - the fields a
 * draft tracks. Name/id are excluded (not edited here). Used to tell when a draft has unsaved changes.
 */
export function themeEditorFieldsEqual(a: CustomTheme, b: CustomTheme): boolean {
   return (
      a.radius === b.radius &&
      JSON.stringify(a.light) === JSON.stringify(b.light) &&
      JSON.stringify(a.dark) === JSON.stringify(b.dark) &&
      JSON.stringify(a.paper) === JSON.stringify(b.paper) &&
      JSON.stringify(a.generator ?? null) === JSON.stringify(b.generator ?? null)
   );
}
