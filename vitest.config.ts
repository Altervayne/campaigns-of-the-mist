import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Minimal Vitest configuration for the additive drawer data layer (Phase 2).
//
// - `tsconfigPaths()`: resolves the `@/*` path alias from tsconfig (this config
//   file is used instead of vite.config.ts, so the app's alias is not inherited).
// - `environment: 'node'`: the default is the lighter Node environment, sufficient for the
//   framework-agnostic lib/hook tests (Dexie runs on the IndexedDB global provided below). A
//   component test that needs a DOM opts into jsdom per-file via a `// @vitest-environment jsdom`
//   docblock pragma, so the node suite stays pure.
// - `setupFiles: ['fake-indexeddb/auto']`: installs an in-memory IndexedDB
//   implementation onto the global scope before any test runs, so Dexie has a
//   backing store without a browser.
// - `include`: the framework-agnostic layers (the drawer/board lib and the pure-logic hooks)
//   plus the component and page tests, which carry their own jsdom pragma.
export default defineConfig({
   plugins: [tsconfigPaths()],
   test: {
      environment: 'node',
      setupFiles: ['fake-indexeddb/auto'],
      include: ['src/lib/**/*.test.ts', 'src/hooks/**/*.test.ts', 'src/components/**/*.test.tsx', 'src/pages/**/*.test.tsx'],
   },
});
