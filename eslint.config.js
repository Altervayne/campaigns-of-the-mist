import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Keeps the decomposed BoardView from regrowing into a god-component: the extracted board hooks and
  // components must stay small. Scoped to the refactor's own output; the older board files (items/,
  // BoardItemBox, connections, tool-settings) are separate and not covered here.
  {
    files: [
      'src/hooks/board/**/*.{ts,tsx}',
      'src/components/organisms/board/BoardCanvas.tsx',
      'src/components/organisms/board/BoardView.tsx',
      'src/components/organisms/board/boardCanvasConstants.ts',
      'src/components/organisms/board/layers/**/*.{ts,tsx}',
      'src/components/organisms/board/toolbar/**/*.{ts,tsx}',
      'src/components/organisms/board/windows/**/*.{ts,tsx}',
      'src/components/organisms/board/fields/**/*.{ts,tsx}',
    ],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  // The two files that legitimately exceed the cap: the wiring hub that composes the hooks, and the
  // drawing concern (the board's largest single responsibility). Exempt so the guard stays green.
  {
    files: [
      'src/components/organisms/board/BoardCanvas.tsx',
      'src/hooks/board/useBoardDrawing.ts',
    ],
    rules: {
      'max-lines': 'off',
    },
  },
  // Same guard for the decomposed SidebarMenu: the extracted sidebar hook + section leaves stay small.
  // Scoped to this refactor's output only.
  {
    files: [
      'src/hooks/sidebar/**/*.{ts,tsx}',
      'src/components/organisms/sidebar/**/*.{ts,tsx}',
      'src/components/organisms/SidebarMenu.tsx',
    ],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  // Same guard for the decomposed DiceTray: the tray's section leaves and its extracted hooks stay small.
  {
    files: [
      'src/components/molecules/dice/**/*.{ts,tsx}',
      'src/hooks/dice/**/*.{ts,tsx}',
    ],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  // The workspace file-I/O engine legitimately exceeds the cap (import + export + update-in-place as one
  // concern); exempt it like useBoardDrawing. A future consolidation pass may split it.
  {
    files: ['src/hooks/sidebar/useSidebarFileIO.ts'],
    rules: {
      'max-lines': 'off',
    },
  },
  // Same guard for the decomposed MobileDrawer: the drawer's parts and the mobile hooks stay small.
  {
    files: [
      'src/components/mobile/drawer/**/*.{ts,tsx}',
      'src/hooks/mobile/**/*.{ts,tsx}',
    ],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  // The drawer's context menu is the one file in that set still over the cap, and it is the next mobile
  // de-monolithization target; exempt until then rather than leaving the whole folder unguarded.
  {
    files: ['src/components/mobile/drawer/MobileDrawerContextMenu.tsx'],
    rules: {
      'max-lines': 'off',
    },
  },
  // Same guard for the decomposed WorkspacePage: the page, its workspace/sheet regions, and its hooks
  // stay small.
  {
    files: [
      'src/pages/WorkspacePage.tsx',
      'src/components/organisms/workspace/**/*.{ts,tsx}',
      'src/components/organisms/character-sheet/**/*.{ts,tsx}',
      'src/hooks/character-sheet/**/*.{ts,tsx}',
    ],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  // Same guard for the decomposed JournalItem: its section leaves and primitives stay small. Scoped to the
  // journal output only - the other board items are not decomposed yet and are deliberately not covered.
  // Its extracted hooks live under `src/hooks/board/**`, already guarded by the board block above.
  {
    files: [
      'src/components/organisms/board/items/journal/**/*.{ts,tsx}',
      'src/components/organisms/board/items/JournalItem.tsx',
    ],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  // Same guard for the decomposed NoteEditor: the thin component plus its extracted theme / imperative handle /
  // click handlers / stable-controllers hook stay small. Scoped to this refactor's output only - the other
  // large note files (tableWidget, coverGutter, NoteView, NoteToolbar, ...) are not decomposed yet and are
  // deliberately not covered.
  {
    files: [
      'src/components/organisms/note/NoteEditor.tsx',
      'src/components/organisms/note/live/noteEditorTheme.ts',
      'src/components/organisms/note/live/noteEditorHandle.ts',
      'src/components/organisms/note/live/noteEditorClicks.ts',
      'src/components/organisms/note/live/useStableNoteControllers.ts',
    ],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  // Same guard for the decomposed ChallengeCardEditor: the thin dialog wrapper plus its extracted per-game
  // form bodies, row editors, and shared field primitives stay small.
  {
    files: [
      'src/components/organisms/dialogs/ChallengeCardEditor.tsx',
      'src/components/organisms/dialogs/challenge-editor/**/*.{ts,tsx}',
    ],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  // Same guard for the per-game card-palette files: the data model, the defaults probe, the injection
  // manager, the create hook, and the settings list + pane stay focused.
  {
    files: [
      'src/lib/theme/cardPalettes.ts',
      'src/lib/theme/cardPaletteProbe.ts',
      'src/lib/theme/useCreateCardPalette.ts',
      'src/components/providers/CardPaletteClassManager.tsx',
      'src/components/organisms/dialogs/settings/CardPaletteManager.tsx',
      'src/components/organisms/dialogs/settings/CardPalettesSettingsPane.tsx',
    ],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
])
