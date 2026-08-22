// Canonical breakpoint pixel constants for the JS side. The Tailwind `@theme`
// tokens in src/app/global.css (--breakpoint-tablet, --breakpoint-desk) mirror
// these numbers; keep the two in sync.

// Phone <-> desktop-tree boundary (mobile <-> tablet). Widths below this fall to
// the phone layout. 48rem at the root font size.
export const BREAKPOINT_TABLET = 768;

// Tablet-density <-> full-density boundary. 64rem at the root font size.
export const BREAKPOINT_DESK = 1024;

// Below this width a portrait tablet drops to the phone tree. Tunable threshold,
// not wired to detection in P0; confirmed against a real iPad Mini in portrait.
export const TABLET_PORTRAIT_FALLBACK = 820;
