// -- Other Library Imports --
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// -- Utils Imports --
import { DEFAULT_STROKE_WIDTH } from '@/lib/board/drawingStyle';
import { latestPatchNotesVersion } from '@/lib/patch-notes';
import { latestAnnouncementId } from '@/lib/announcements';

// -- Types Imports --
import type { GameSystem } from '../types/drawer';
import type { BrushKind } from '@/lib/types/board';
import type { DiceTrayContent } from '@/lib/dice/diceTrayTypes';
import type { CustomTheme } from '@/lib/theme/themeTokens';
import { normalizePaper } from '@/lib/theme/themeTokens';
import type { CardPalette, CardPaletteGame } from '@/lib/theme/cardPalettes';
import type { ThemeMode } from '@/lib/theme/themeMode';



export type ThemeName = 'theme-neutral' | 'theme-legends' | 'theme-otherscape' | 'theme-city-of-mist';
/** The active theme: a preset class, or a custom theme's `theme-custom-{id}` (its value IS its class). */
export type ActiveTheme = ThemeName | `theme-custom-${string}`;
export type DeviceType = 'mobile' | 'desktop';
export type FormFactor = 'phone' | 'tablet' | 'desktop';
export type MobileHandedness = 'left' | 'right';

interface AppSettingsState {
   theme: ActiveTheme;
   /** Light/dark mode, applied by ThemeModeManager (owns only the `dark`/`light` class). `system` follows the OS. */
   themeMode: ThemeMode;
   /** User-defined themes (applied at runtime by the ThemeClassManager). Dormant until the editor ships. */
   customThemes: CustomTheme[];
   // The theme currently being edited, as a live but UNSAVED draft. The whole app previews it (see
   // ThemeClassManager), but it only reaches `customThemes` on Save. Excluded from persistence on purpose:
   // a reload drops unsaved edits and the saved theme stays intact.
   themeDraft: CustomTheme | null;
   /** User-defined card palettes for every game in one list, each tagged by its `game` (applied at runtime by
    * the CardPaletteClassManager). */
   cardPalettes: CardPalette[];
   /** Each game's active palette id; `'default'` means the built-in `.card-type-*` rules in global.css show through. */
   activeCardPalettes: Record<CardPaletteGame, string>;
   // The card palette currently being edited, as a live but UNSAVED draft. The app previews it (see
   // CardPaletteClassManager); it only reaches `cardPalettes` on Save. Excluded from persistence on purpose,
   // like themeDraft: a reload drops unsaved edits and the saved palette stays intact.
   cardPaletteDraft: CardPalette | null;
   isCompactDrawer: boolean;
   isSideBySideView: boolean;
   lastVisitedVersion: string;
   /** The newest release the user has opened What's-new for. Drives the New! dot; distinct from `lastVisitedVersion`
    * (which gates the boot auto-open) so the dot persists until the notes are actually opened. */
   lastReadPatchNotesVersion: string;
   /** The newest announcement the user has acknowledged (dismissed from the banner). Seeded to the latest on
    * fresh install so newcomers skip the backlog; returning users see anything appended since. */
   lastSeenAnnouncementId: string;
   isTrackersAlwaysEditable: boolean;
   isSidebarCollapsed: boolean;
   /** Whether the note editor's document-outline rail is shown. Persisted so it stays where the user left it. */
   isNoteOutlineOpen: boolean;
   /** Whether the board's layers panel is open. Persisted so it stays where the user left it (default closed). */
   layersPanelOpen: boolean;
   /** Whether the Navigator slide-over is open. Persisted so it stays where the user left it (default closed). */
   navigatorOpen: boolean;
   contextualGame: GameSystem;
   deviceTypeOverride?: DeviceType;
   /** Manual layout-profile override; `undefined` = auto-detect. Orthogonal to `deviceTypeOverride` (the
    * binary base regime): the Interface control sets both together so base and layout stay coherent, while
    * pointer capability is always auto-detected regardless. */
   formFactorOverride?: FormFactor;
   isMobileFABMode: boolean;
   mobileHandedness: MobileHandedness;
   areGestureHintsEnabled: boolean;
   hasSeenTrackerSelectHint: boolean;
   hasSeenDrawerMenuHint: boolean;
   /** Whether first-run onboarding has been completed or skipped. The single first-run gate for both platforms. */
   hasCompletedOnboarding: boolean;
   /** Ids of tutorials that reached their final step. Skipping never lands here, so a skipped tutorial still
    * reads as replayable. Drives the completed check + Start/Replay label in the tutorial list. */
   completedTutorials: string[];
   // The app-wide dice tray (a bottom sliding panel, reachable from any tab). Persisted, no undo: edits
   // and rolls write straight to `content`, so the configured dice/modifiers and the last roll survive a
   // reload. `isOpen` is the panel's slide state.
   diceTray: { content: DiceTrayContent; isOpen: boolean };
   // A one-shot "roll the app tray now" request (armed by the palette's Roll command). Transient: excluded
   // from persistence so a reload never auto-rolls; the tray clears it once it has rolled.
   pendingDiceRoll: boolean;
   // The board drawing tool's settings, persisted so the last brush/color/size survive a reload. `color` and
   // `width` are BOTH shared across brushes (null color = the adaptive foreground, frozen to a hex only on
   // pick), so switching brush keeps the current ink and size. `shapeBase` and `shapeFilled` drive the Shape
   // tool (circle vs square base, and whether its interior is filled). Applied at stroke creation.
   penSettings: { brush: BrushKind; color: string | null; width: number; shapeBase: 'circle' | 'square'; shapeFilled: boolean };
   actions: {
      setTheme: (theme: ActiveTheme) => void;
      setThemeMode: (mode: ThemeMode) => void;
      addCustomTheme: (theme: CustomTheme) => void;
      updateCustomTheme: (id: string, patch: Partial<CustomTheme>) => void;
      deleteCustomTheme: (id: string) => void;
      reorderCustomThemes: (activeId: string, overId: string) => void;
      beginThemeDraft: (theme: CustomTheme) => void;
      patchThemeDraft: (patch: Partial<CustomTheme>) => void;
      saveThemeDraft: () => void;
      discardThemeDraft: () => void;
      setActiveCardPalette: (game: CardPaletteGame, id: string) => void;
      addCardPalette: (palette: CardPalette) => void;
      updateCardPalette: (id: string, patch: Partial<CardPalette>) => void;
      deleteCardPalette: (id: string) => void;
      reorderCardPalettes: (activeId: string, overId: string) => void;
      beginCardPaletteDraft: (palette: CardPalette) => void;
      patchCardPaletteDraft: (patch: Partial<CardPalette>) => void;
      saveCardPaletteDraft: () => void;
      discardCardPaletteDraft: () => void;
      toggleCompactDrawer: () => void;
      setSideBySideView: (isSideBySide: boolean) => void;
      setLastVisitedVersion: (version: string) => void;
      setLastReadPatchNotesVersion: (version: string) => void;
      setLastSeenAnnouncementId: (id: string) => void;
      setTrackersAlwaysEditable: (isEditable: boolean) => void;
      setSidebarCollapsed: (isCollapsed: boolean) => void;
      toggleSidebarCollapsed: () => void;
      setNoteOutlineOpen: (isOpen: boolean) => void;
      toggleNoteOutline: () => void;
      setLayersPanelOpen: (isOpen: boolean) => void;
      toggleLayersPanel: () => void;
      setNavigatorOpen: (isOpen: boolean) => void;
      toggleNavigator: () => void;
      setContextualGame: (game: GameSystem) => void;
      setDeviceTypeOverride: (deviceType: DeviceType | undefined) => void;
      setFormFactorOverride: (formFactor: FormFactor | undefined) => void;
      setMobileFABMode: (enabled: boolean) => void;
      setMobileHandedness: (handedness: MobileHandedness) => void;
      setGestureHintsEnabled: (enabled: boolean) => void;
      setHasSeenTrackerSelectHint: (seen: boolean) => void;
      setHasSeenDrawerMenuHint: (seen: boolean) => void;
      setHasCompletedOnboarding: (completed: boolean) => void;
      markTutorialCompleted: (id: string) => void;
      resetTutorialProgress: () => void;
      setDiceTrayContent: (content: DiceTrayContent) => void;
      toggleDiceTray: () => void;
      setDiceTrayOpen: (isOpen: boolean) => void;
      startDiceTrayRoll: (content: DiceTrayContent) => void;
      clearPendingDiceRoll: () => void;
      setPenBrush: (brush: BrushKind) => void;
      setPenColor: (color: string | null) => void;
      setPenWidth: (width: number) => void;
      setShapeBase: (base: 'circle' | 'square') => void;
      setShapeFilled: (filled: boolean) => void;
   };
}



/** localStorage key the persist middleware writes the app settings under (themes, prefs, tutorial flags, ...). */
export const APP_SETTINGS_STORAGE_KEY = 'characters-of-the-mist_app-settings';

export const useAppSettingsStore = create<AppSettingsState>()(
   persist(
      (set, get) => ({
         theme: 'theme-neutral',
         themeMode: 'system',
         customThemes: [],
         themeDraft: null,
         cardPalettes: [],
         activeCardPalettes: { LEGENDS: 'default', CITY_OF_MIST: 'default', OTHERSCAPE: 'default' },
         cardPaletteDraft: null,
         isCompactDrawer: false,
         isSideBySideView: false,
         lastVisitedVersion: "0.0.0",
         // Seed to the newest release so a fresh install (or a store that predates this field) never nags with the
         // dot; it appears only once a genuinely newer release lands that the user hasn't opened.
         lastReadPatchNotesVersion: latestPatchNotesVersion,
         // Seed to the newest announcement so a fresh install never surfaces the backlog; the banner appears
         // only once a genuinely newer announcement ships that the user hasn't dismissed.
         lastSeenAnnouncementId: latestAnnouncementId,
         isTrackersAlwaysEditable: false,
         isSidebarCollapsed: false,
         isNoteOutlineOpen: false,
         layersPanelOpen: false,
         navigatorOpen: false,
         contextualGame: 'LEGENDS',
         deviceTypeOverride: undefined,
         formFactorOverride: undefined,
         isMobileFABMode: false,
         mobileHandedness: 'right',
         areGestureHintsEnabled: true,
         hasSeenTrackerSelectHint: false,
         hasSeenDrawerMenuHint: false,
         hasCompletedOnboarding: false,
         completedTutorials: [],
         diceTray: { content: { dice: [], modifiers: [] }, isOpen: false },
         pendingDiceRoll: false,
         penSettings: { brush: 'pen', color: null, width: DEFAULT_STROKE_WIDTH, shapeBase: 'circle', shapeFilled: false },
         actions: {
            setTheme: (theme) => set({ theme }),
            setThemeMode: (mode) => set({ themeMode: mode }),
            addCustomTheme: (theme) => set((state) => ({ customThemes: [...state.customThemes, theme] })),
            updateCustomTheme: (id, patch) => set((state) => ({
               customThemes: state.customThemes.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
            })),
            // Drop the theme; if it was the active one, fall back to a preset so the app stays themed.
            deleteCustomTheme: (id) => set((state) => ({
               customThemes: state.customThemes.filter((entry) => entry.id !== id),
               theme: state.theme === `theme-custom-${id}` ? 'theme-neutral' : state.theme,
            })),
            // Move a custom theme to another's slot (drag-to-reorder); the array IS the persisted order.
            reorderCustomThemes: (activeId, overId) => set((state) => {
               const from = state.customThemes.findIndex((entry) => entry.id === activeId);
               const to = state.customThemes.findIndex((entry) => entry.id === overId);
               if (from === -1 || to === -1 || from === to) return {};
               const next = state.customThemes.slice();
               const [moved] = next.splice(from, 1);
               next.splice(to, 0, moved);
               return { customThemes: next };
            }),
            // Start (or restart) the live draft from a deep copy of the saved theme, so opening the editor
            // shows no change until the user edits.
            beginThemeDraft: (theme) => set({
               themeDraft: { ...theme, light: { ...theme.light }, dark: { ...theme.dark }, paper: { ...theme.paper }, generator: theme.generator ? { ...theme.generator } : undefined },
            }),
            patchThemeDraft: (patch) => set((state) => (state.themeDraft ? { themeDraft: { ...state.themeDraft, ...patch } } : {})),
            // The only write of editor-owned fields back to a saved theme. Name/id aren't editor-edited, so a
            // rename made mid-edit is preserved. The draft stays put (now matching the saved theme, so clean).
            saveThemeDraft: () => {
               const draft = get().themeDraft;
               if (!draft) return;
               get().actions.updateCustomTheme(draft.id, { light: draft.light, dark: draft.dark, radius: draft.radius, paper: draft.paper, generator: draft.generator });
            },
            discardThemeDraft: () => set({ themeDraft: null }),
            setActiveCardPalette: (game, id) => set((state) => ({
               activeCardPalettes: { ...state.activeCardPalettes, [game]: id },
            })),
            addCardPalette: (palette) => set((state) => ({ cardPalettes: [...state.cardPalettes, palette] })),
            updateCardPalette: (id, patch) => set((state) => ({
               cardPalettes: state.cardPalettes.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
            })),
            // Drop the palette; any game pointing at it falls back to `'default'` (global.css shows through).
            deleteCardPalette: (id) => set((state) => {
               const activeCardPalettes = { ...state.activeCardPalettes };
               for (const game of Object.keys(activeCardPalettes) as CardPaletteGame[]) {
                  if (activeCardPalettes[game] === id) activeCardPalettes[game] = 'default';
               }
               return { cardPalettes: state.cardPalettes.filter((entry) => entry.id !== id), activeCardPalettes };
            }),
            // Move a palette to another's slot (drag-to-reorder); the array IS the persisted order.
            reorderCardPalettes: (activeId, overId) => set((state) => {
               const from = state.cardPalettes.findIndex((entry) => entry.id === activeId);
               const to = state.cardPalettes.findIndex((entry) => entry.id === overId);
               if (from === -1 || to === -1 || from === to) return {};
               const next = state.cardPalettes.slice();
               const [moved] = next.splice(from, 1);
               next.splice(to, 0, moved);
               return { cardPalettes: next };
            }),
            // Start (or restart) the live draft from a deep copy of the saved palette, so opening the editor
            // shows no change until the user edits.
            beginCardPaletteDraft: (palette) => set({
               cardPaletteDraft: {
                  ...palette,
                  cardTypes: Object.fromEntries(
                     Object.entries(palette.cardTypes).map(([slug, paper]) => [slug, { ...paper }]),
                  ),
               },
            }),
            patchCardPaletteDraft: (patch) => set((state) => (state.cardPaletteDraft ? { cardPaletteDraft: { ...state.cardPaletteDraft, ...patch } } : {})),
            // The only write of editor-owned fields back to a saved palette. The draft stays put (now matching
            // the saved palette, so clean), so editing can continue after a save.
            saveCardPaletteDraft: () => {
               const draft = get().cardPaletteDraft;
               if (!draft) return;
               get().actions.updateCardPalette(draft.id, { name: draft.name, cardTypes: draft.cardTypes });
            },
            discardCardPaletteDraft: () => set({ cardPaletteDraft: null }),
            toggleCompactDrawer: () => set((state) => ({ isCompactDrawer: !state.isCompactDrawer })),
            setSideBySideView: (isSideBySide) => set({ isSideBySideView: isSideBySide }),
            setLastVisitedVersion: (version) => set({ lastVisitedVersion: version }),
            setLastReadPatchNotesVersion: (version) => set({ lastReadPatchNotesVersion: version }),
            setLastSeenAnnouncementId: (id) => set({ lastSeenAnnouncementId: id }),
            setTrackersAlwaysEditable: (isEditable) => set({ isTrackersAlwaysEditable: isEditable }),
            setSidebarCollapsed: (isCollapsed) => set({ isSidebarCollapsed: isCollapsed }),
            toggleSidebarCollapsed: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
            setNoteOutlineOpen: (isOpen) => set({ isNoteOutlineOpen: isOpen }),
            toggleNoteOutline: () => set((state) => ({ isNoteOutlineOpen: !state.isNoteOutlineOpen })),
            setLayersPanelOpen: (isOpen) => set({ layersPanelOpen: isOpen }),
            toggleLayersPanel: () => set((state) => ({ layersPanelOpen: !state.layersPanelOpen })),
            setNavigatorOpen: (isOpen) => set({ navigatorOpen: isOpen }),
            toggleNavigator: () => set((state) => ({ navigatorOpen: !state.navigatorOpen })),
            setContextualGame: (game) => set({ contextualGame: game }),
            setDeviceTypeOverride: (deviceType) => set({ deviceTypeOverride: deviceType }),
            setFormFactorOverride: (formFactor) => set({ formFactorOverride: formFactor }),
            setMobileFABMode: (enabled) => set({ isMobileFABMode: enabled }),
            setMobileHandedness: (handedness) => set({ mobileHandedness: handedness }),
            setGestureHintsEnabled: (enabled) => set({ areGestureHintsEnabled: enabled }),
            setHasSeenTrackerSelectHint: (seen) => set({ hasSeenTrackerSelectHint: seen }),
            setHasSeenDrawerMenuHint: (seen) => set({ hasSeenDrawerMenuHint: seen }),
            setHasCompletedOnboarding: (completed) => set({ hasCompletedOnboarding: completed }),
            // Completion is reaching the final step; idempotent so a re-run never double-lists an id.
            markTutorialCompleted: (id) => set((state) => (
               state.completedTutorials.includes(id) ? {} : { completedTutorials: [...state.completedTutorials, id] }
            )),
            resetTutorialProgress: () => set({ completedTutorials: [] }),
            // No undo: edits and rolls both write straight to content; the persist middleware saves it.
            setDiceTrayContent: (content) => set((state) => ({ diceTray: { ...state.diceTray, content } })),
            toggleDiceTray: () => set((state) => ({ diceTray: { ...state.diceTray, isOpen: !state.diceTray.isOpen } })),
            setDiceTrayOpen: (isOpen) => set((state) => ({ diceTray: { ...state.diceTray, isOpen } })),
            // Set the setup, open the tray, and arm the one-shot roll in one update, so the tray rolls the
            // new dice/modifiers (not stale ones). The tray runs its own animated roll, then clears the flag.
            startDiceTrayRoll: (content) => set((state) => ({ diceTray: { ...state.diceTray, content, isOpen: true }, pendingDiceRoll: true })),
            clearPendingDiceRoll: () => set({ pendingDiceRoll: false }),
            // Tool settings, not board data: plain sets, no undo. The persist middleware saves them.
            setPenBrush: (brush) => set((state) => ({ penSettings: { ...state.penSettings, brush } })),
            setPenColor: (color) => set((state) => ({ penSettings: { ...state.penSettings, color } })),
            // One shared size across brushes (carries when the brush changes, like the shared ink).
            setPenWidth: (width) => set((state) => ({ penSettings: { ...state.penSettings, width } })),
            setShapeBase: (base) => set((state) => ({ penSettings: { ...state.penSettings, shapeBase: base } })),
            setShapeFilled: (filled) => set((state) => ({ penSettings: { ...state.penSettings, shapeFilled: filled } })),
         },
      }),
      {
         name: APP_SETTINGS_STORAGE_KEY,
         storage: createJSONStorage(() => localStorage),
         partialize: (state) => ({
            theme: state.theme,
            themeMode: state.themeMode,
            customThemes: state.customThemes,
            // cardPaletteDraft is intentionally omitted (like themeDraft): unsaved edits never persist.
            cardPalettes: state.cardPalettes,
            activeCardPalettes: state.activeCardPalettes,
            isCompactDrawer: state.isCompactDrawer,
            isSideBySideView: state.isSideBySideView,
            lastVisitedVersion: state.lastVisitedVersion,
            lastReadPatchNotesVersion: state.lastReadPatchNotesVersion,
            lastSeenAnnouncementId: state.lastSeenAnnouncementId,
            isTrackersAlwaysEditable: state.isTrackersAlwaysEditable,
            isSidebarCollapsed: state.isSidebarCollapsed,
            isNoteOutlineOpen: state.isNoteOutlineOpen,
            layersPanelOpen: state.layersPanelOpen,
            navigatorOpen: state.navigatorOpen,
            contextualGame: state.contextualGame,
            deviceTypeOverride: state.deviceTypeOverride,
            formFactorOverride: state.formFactorOverride,
            isMobileFABMode: state.isMobileFABMode,
            mobileHandedness: state.mobileHandedness,
            areGestureHintsEnabled: state.areGestureHintsEnabled,
            hasSeenTrackerSelectHint: state.hasSeenTrackerSelectHint,
            hasSeenDrawerMenuHint: state.hasSeenDrawerMenuHint,
            hasCompletedOnboarding: state.hasCompletedOnboarding,
            completedTutorials: state.completedTutorials,
            diceTray: state.diceTray,
            penSettings: state.penSettings
         }),
         // Backfill on load: a theme or palette saved before a paper token existed lacks it, which would feed
         // the editor's color picker an undefined and crash. normalizePaper fills any missing token from the
         // classic default so older stored data opens cleanly.
         merge: (persisted, current) => {
            const merged = { ...current, ...(persisted as Partial<AppSettingsState>) };
            merged.customThemes = (merged.customThemes ?? []).map((theme) => ({ ...theme, paper: normalizePaper(theme.paper) }));
            merged.cardPalettes = (merged.cardPalettes ?? []).map((palette) => ({
               ...palette,
               cardTypes: Object.fromEntries(Object.entries(palette.cardTypes).map(([slug, set]) => [slug, normalizePaper(set)])),
            }));
            return merged;
         },
      }
   )
);

export const useAppSettingsActions = () => useAppSettingsStore((state) => state.actions);