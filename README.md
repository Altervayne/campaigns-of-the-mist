![Campaigns of the Mist](./assets/banner.png)

# Campaigns of the Mist

**Campaigns of the Mist** is a fast, private, entirely client-side companion for running and playing [Mist Engine](https://cityofmist.co) tabletop RPGs: *Legend in the Mist*, *Metro: Otherscape*, and *City of Mist*. There's no server and no account: everything you make lives in your own browser, and it installs as an app that works fully offline.

It's an unofficial, fan-made project (a full rewrite of the old *Characters of the Mist* alpha, now rebranded as it grew from a character-sheet app into a whole table workspace). This README is for people who want to **run or hack on the code**. If you just want to *use* the app, it's at [campaignsofthemist.app](https://www.campaignsofthemist.app/) and it teaches itself through its built-in tutorials, so you won't find a feature list here.

---

## Tech stack

- **Build / dev:** [Vite](https://vitejs.dev/) 7
- **UI:** [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) v4, with [Radix UI](https://www.radix-ui.com/) primitives (shadcn/ui-style components)
- **State:** [Zustand](https://zustand-demo.pmnd.rs/) for stores, [zundo](https://github.com/charkour/zundo) for the temporal (undo/redo) layer
- **Persistence:** [Dexie](https://dexie.org/) over IndexedDB (app settings on `localStorage`)
- **Drag & drop:** [dnd-kit](https://dndkit.com/)
- **Animation:** [Framer Motion](https://www.framer.com/motion/)
- **Notes editor:** [CodeMirror 6](https://codemirror.net/)
- **Command palette:** [cmdk](https://cmdk.paco.me/)
- **Routing:** [React Router](https://reactrouter.com/)
- **Markdown:** [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-gfm](https://github.com/remarkjs/remark-gfm)
- **Localization:** [i18next](https://www.i18next.com/) / react-i18next
- **Icons:** [Lucide](https://lucide.dev/)
- **Offline / PWA:** [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) (Workbox)
- **Testing:** [Vitest](https://vitest.dev/) + Testing Library, on jsdom with [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB)

---

## Running it locally

**Prerequisites:** [Node.js](https://nodejs.org/) **20.19+** (or **22.12+**), the minimum Vite 7 needs, and npm.

```bash
npm install      # install dependencies
npm run dev      # start the dev server at http://localhost:5173
```

Other scripts:

```bash
npm run build        # typecheck + production bundle -> dist/  (runs `tsc -b && vite build`)
npm run preview      # serve the built dist/ locally
npm test             # run the test suite once (vitest run)
npm run test:watch   # run tests in watch mode
npm run lint         # eslint over the project
```

---

## Project structure

```
messages/                 Locale JSON -> en.json is the source of truth.
src/
  main.tsx, App.tsx        Entry point + app shell (theme/store providers, router).
  router.tsx               Routes (a single route into the character/workspace page).
  app/                     Global CSS + theme tokens.
  i18n/                    i18next config + the `locales.ts` registry of available languages.
  pages/                   CharacterSheetPage -> the one route; switches desktop/mobile shells.
  components/
    organisms/             The big surfaces: board, drawer, notes, tabs, navigator, cards, dialogs...
    molecules/ · ui/       Smaller pieces + the Radix/shadcn primitives.
    mobile/                The mobile shell (its own navigation, sheets, and screens).
    providers/             Theme + app-start context providers.
  hooks/                   Cross-cutting React hooks.
  lib/                     The non-UI core (see below).
```

`src/lib/` holds the domain logic and data layer, split by surface:

- **`stores/`** -> Zustand stores (drawer, app settings, general UI state…).
- **`character/`, `board/`, `notes/`, `drawer/`** -> per-surface domain logic + Dexie persistence.
- **`dice/`, `tutorial/`, `portals/`, `navigator/`, `theme/`, `cards/`, `challenge/`, `trackers/`** -> the feature subsystems.
- **`harmonization.ts`** -> the import migrator: brings exported files from older versions up to the current schema, so a file from any past release stays importable.
- **`backup/`, `assets/`, `types/`, `utils/`, `constants/`** -> full-app backup/restore, the image/asset store, shared types, and helpers.

A few architectural notes worth knowing before you dig in:

- **100% client-side.** No backend, no API. Everything persists to **IndexedDB via Dexie**; only a little app-settings state lives on `localStorage`.
- **Offline-first PWA.** The service worker (vite-plugin-pwa / Workbox) precaches the app so it runs with no network. Heavy surfaces (the board canvas, the CodeMirror notes editor) are code-split into lazy chunks that are *still* precached, so offline stays complete without bloating first paint.
- **Undo/redo** is a temporal Zustand layer (zundo), scoped per surface.
- **Localization** lives in `messages/*.json`, registered in `src/i18n/config.ts` and listed in `src/i18n/locales.ts`. `en.json` is the source of truth; the others are community-contributed.

---

## License

Campaigns of the Mist is distributed under the **[GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)](https://www.gnu.org/licenses/agpl-3.0.html)**, full text in [`LICENSE`](./LICENSE). You're free to use, modify, and redistribute the code (including commercially), but if you distribute or *network-host* a modified version, you must release your full source under the same license.

The third-party components bundled into the app, and their respective licenses, are listed in [`THIRD_PARTY_LICENSES`](./THIRD_PARTY_LICENSES).

The name **Campaigns of the Mist**, the icon, and the logo are **not** covered by the AGPL. They are the exclusive property of Florian Douay, all rights reserved; see [`NOTICE`](./NOTICE) for the terms. If you fork or redistribute the project, you must remove them and bring your own name and brand identity.

*City of Mist*, *Metro: Otherscape*, and *Legend in the Mist*, together with their settings and trademarks, are the exclusive intellectual property of Son of Oak Game Studio LLC. This is an unofficial, fan-made project and is in no way endorsed by Amit Moshe or Son of Oak Game Studio LLC.
