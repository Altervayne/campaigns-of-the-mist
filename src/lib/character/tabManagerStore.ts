// -- Other Library Imports --
import { create } from 'zustand';

// -- Utils Imports --
import { harmonizeData } from '@/lib/harmonization';
import { DEFAULT_SHEET_ZOOM, clampSheetZoom } from './sheetZoom';
import { reIdCharacterAggregate } from './reIdCharacterAggregate';

// -- Store Imports --
import { buildNewCharacter } from '@/lib/stores/characterStore';

// -- Local Imports --
import {
   SINGLE_ACTIVE_INSTANCE_ID,
   disposeInstance,
   getCharacterInstanceIds,
   getMenuFallbackInstance,
   getOrCreateInstance,
   setActiveInstance,
} from './characterStoreRegistry';
import { attachPersistenceHandle, detachPersistenceHandle, discardPersistenceHandle, finishBootHydration } from './characterPersistence';
import { deleteCharacter, getCharacter } from './characterRepository';
import { readWorkspace, writeWorkspace } from './workspaceSession';
import { getEffectiveDeviceType } from '@/hooks/useDeviceType';
import { disposeBoardInstance, getOrCreateBoardInstance, setActiveBoardInstance } from '@/lib/board/boardStoreRegistry';
import { createBoard, deleteBoard, loadBoard } from '@/lib/board/boardRepository';
import { refreezeDrawerlessNoteReferences } from '@/lib/board/refreezeNoteReferences';
import { disposeNoteInstance, getOrCreateNoteInstance, setActiveNoteInstance } from '@/lib/notes/noteStoreRegistry';
import { createNote, deleteNote, getNote } from '@/lib/notes/noteRepository';

// -- Journey (portal trail) Imports --
import {
   EMPTY_JOURNEY,
   dropJourneyEntry,
   goToJourneyIndex,
   journeyBack,
   journeyForward,
   pushJourney,
   rekeyJourneyEntity,
} from './journey';

// -- Type Imports --
import type { Character } from '@/lib/types/character';
import type { GameSystem } from '@/lib/types/drawer';
import type { Workspace } from './workspaceSession';
import type { JourneyEntry, JourneySlice } from './journey';

/*
 * TabManager: owns the open/create/close lifecycle of character tabs: instance
 * creation/disposal, persistence-handle attach/detach, the registry's active pointer,
 * and the workspace session pointer. The per-character store actions (loadCharacter
 * etc.) stay strictly per-character; the TabManager calls them internally to populate
 * or clear an instance, while the UI drives it.
 *
 * PLATFORM SPLIT:
 * - DESKTOP keeps every open instance live (focus-or-add; dispose only on explicit
 *   `closeTab`). "Return to Menu" = `deactivate()` (show the menu, keep the tabs).
 * - MOBILE holds at most ONE live character instance (plus the permanent menu
 *   fallback): the `mobile*` actions dispose the current live instance before
 *   opening/creating the next, but never prune `openTabs` (the shared desktop set).
 * Boot is platform-aware (`runCharacterBoot`): desktop hydrates all tabs (active
 * first), mobile hydrates only the active one.
 *
 * TAB KINDS: tabs are characters, boards, or notes. The three kinds live in separate
 * registries (character + board + note), but the TabManager owns the single active pointer
 * across all three: exactly one tab is active, and activating one kind PARKS the other two
 * (a board or note tab parks the character registry on the menu fallback, so no sheet
 * shows; and clears whichever of the board/note pointers it isn't). Boards and notes are
 * desktop-only; the `mobile*` actions and `bootMobile` never touch them.
 *
 * PORTAL TRAIL: the TabManager also owns the `journey` slice - an EPHEMERAL back-stack of portal navigations
 * (see `journey.ts`). It lives here because the TabManager is the ONE place that knows the active pointer moved
 * across all three kinds. It is grown ONLY from portal activation (never from `setActiveTab`, where a manual
 * click and a portal-follow are indistinguishable), and is session-only: `persistWorkspace` writes just
 * `{openTabs, activeId}`, so the trail is simply never serialized and dies on reload.
 */

/** The kind of a tab. Boards and notes are desktop-only. */
export type TabType = 'character' | 'board' | 'note';

/** Default name for a freshly created board, until the board UI lets the user rename it. */
const DEFAULT_BOARD_NAME = 'New Board';

/** A tab in the workspace, in tab order. */
export interface OpenTab {
   /** The id keying the tab's store instance: a character id, or (for a board) its `boards` row id. */
   id: string;
   /** Discriminant for the tab's content type. */
   type: TabType;
   /** Desktop character-sheet zoom factor (content scale); absent means the default 1. */
   zoom?: number;
}

interface TabManagerState {
   /** Open tabs in order. */
   openTabs: OpenTab[];
   /** The active tab's id, or `null` when at the menu (the menu fallback instance is active). */
   activeTabId: string | null;
   /**
    * The portal trail: an EPHEMERAL, in-memory back-stack of portal navigations. Session-only - NEVER written to
    * `workspaceSession` (which persists only `{openTabs, activeId}`), so it dies on reload with no migration
    * friction (the `highlightItemId` transient precedent). Grown ONLY from portal activation.
    */
   journey: JourneySlice;
   actions: {
      // -- Desktop (keep-alive) --
      /** Creates a brand-new character of `game`, appends it as a tab, activates it, and persists it. */
      createCharacterTab: (game: GameSystem) => void;
      /** Opens an existing/imported `character`; focuses its tab if already open, else appends + activates. */
      openCharacterTab: (character: Character, drawerItemId?: string) => void;
      /** Creates a brand-new board, appends it as a tab, hydrates its instance, and activates it. Desktop-only. */
      createBoardTab: () => Promise<void>;
      /** Opens board `boardId`; focuses its tab if already open, else hydrates + appends + activates. Desktop-only. */
      openBoardTab: (boardId: string) => Promise<void>;
      /** Creates a brand-new note, appends it as a tab, hydrates its instance, and activates it. Desktop-only. */
      createNoteTab: () => Promise<void>;
      /** Opens note `noteId`; focuses its tab if already open, else hydrates + appends + activates. Desktop-only. */
      openNoteTab: (noteId: string) => Promise<void>;
      /** Closes tab `id` (dispose + delete its record) and activates a neighbour, or the menu when none remain. */
      closeTab: (id: string) => void;
      /** Convenience: closes the currently active tab. */
      closeActiveTab: () => void;
      /** Activates an already-open tab by id WITHOUT disposing the previously active one (keep-alive). */
      setActiveTab: (id: string) => void;
      /** Moves the `fromId` tab to the position of `toId`, persisting the new order; active tab unchanged. */
      reorderTabs: (fromId: string, toId: string) => void;
      /** Sets tab `id`'s sheet zoom factor (clamped), persisting it. Non-undoable, like the board viewport. */
      setTabZoom: (id: string, zoom: number) => void;
      /** Desktop "Return to Menu": show the menu while KEEPING every open tab and its live instance. */
      deactivate: () => void;
      /**
       * Re-keys a live entity tab from `oldId` to `newId` across every id-keyed system (tab entry, active
       * pointer, journey trail, store registry + persistence handle) and reaps the old working rows. The
       * fork MUST have written `newId`'s working rows first; this hydrates the new instance from them,
       * disposes the old instance WITHOUT flushing (the fork already captured the latest state, and the old
       * rows are deleted so the original reverts to its saved drawer copy on reopen), and adopts the new id.
       * Undo history does NOT survive the re-key (see the implementation note). Desktop-only.
       */
      rekeyEntityTab: (kind: TabType, oldId: string, newId: string) => Promise<void>;

      // -- Portal trail (ephemeral journey) --
      /** Records a portal edge `from -> to` (the ONLY growth path). Pushed explicitly from portal activation. */
      pushJourney: (from: JourneyEntry, to: JourneyEntry) => void;
      /** Moves the trail marker to `index` (clamped) and returns the entry to reactivate. */
      goToJourneyIndex: (index: number) => JourneyEntry | null;
      /** Steps the marker one back (clamped) and returns the entry to reactivate. */
      journeyBack: () => JourneyEntry | null;
      /** Steps the marker one forward (clamped) and returns the entry to reactivate (a clicked forward crumb). */
      journeyForward: () => JourneyEntry | null;
      /** Drops a dead trail entry (closed + never-saved), detected at pop. */
      dropJourneyEntry: (entityId: string) => void;
      /** Dismisses the whole trail (the bar's close button) - the user is done with this dive. */
      clearJourney: () => void;

      // -- Mobile (single live character instance) --
      /** Mobile open: disposes the current live character, loads `character`, adds it to `openTabs` if missing, activates. */
      mobileOpenCharacter: (character: Character, drawerItemId?: string) => void;
      /**
       * Mobile overwrite: DISCARDS the current live character (drop its handle without flushing,
       * delete its working row, prune its tab), then builds + appends a new character of `game`.
       * The forward-compat seam for a post-2.0 `openWorkspace`.
       */
      mobileReplaceWithNewCharacter: (game: GameSystem) => void;
      /**
       * Mobile overwrite with an imported sheet: DISCARDS the current live character (as
       * {@link mobileReplaceWithNewCharacter}), then loads `character` as the new live sheet.
       */
      mobileReplaceWithImportedCharacter: (character: Character) => void;
      /** Mobile "Return to Menu": disposes the live character and shows the menu, keeping `openTabs`. */
      mobileReturnToMenu: () => void;
      /**
       * Mobile "Close Sheet": DISCARDS the live character (drop its handle without flushing, delete its
       * working row, prune its tab), then shows the menu. Contrast {@link mobileReturnToMenu}, which keeps
       * the tab and working row. Never flushes, so a save the user wanted must complete BEFORE this runs.
       */
      mobileCloseSheet: () => void;
   };
}

/** Persists the current open tabs + active id to the workspace session. */
function persistWorkspace(): void {
   const { openTabs, activeTabId } = useTabManagerStore.getState();
   writeWorkspace({ openTabs, activeId: activeTabId });
}

// ==================
//  Active-pointer coordination (exactly one tab active across both registries)
// ==================

/*
 * Active-pointer coordination is a THREE-way park: exactly one of the character / board /
 * note registries is pointed at a real instance, and the other two are cleared (board/note
 * to `null`, character to its menu fallback so no sheet shows). Every activate-function
 * below sets ALL THREE pointers, so activating any kind can never leave a stale surface
 * from another kind still pointed at.
 */

/** Activates a character: point the character registry at it, clear the board AND note pointers. Pointer-only. */
function activateCharacterPointers(id: string): void {
   setActiveInstance(id);
   setActiveBoardInstance(null);
   setActiveNoteInstance(null);
}

/**
 * Activates a board: park the character registry on the menu fallback (so no sheet shows),
 * point the board registry at the board, and clear the note pointer. Pointer-only.
 */
function activateBoardPointers(id: string): void {
   getMenuFallbackInstance();
   setActiveInstance(SINGLE_ACTIVE_INSTANCE_ID);
   setActiveBoardInstance(id);
   setActiveNoteInstance(null);
}

/**
 * Activates a note: park the character registry on the menu fallback (so no sheet shows),
 * clear the board pointer, and point the note registry at the note. Pointer-only.
 */
function activateNotePointers(id: string): void {
   getMenuFallbackInstance();
   setActiveInstance(SINGLE_ACTIVE_INSTANCE_ID);
   setActiveBoardInstance(null);
   setActiveNoteInstance(id);
}

/** Points every registry at the menu: character fallback, no board, no note. Pointer-only. */
function activateMenuPointers(): void {
   getMenuFallbackInstance();
   setActiveInstance(SINGLE_ACTIVE_INSTANCE_ID);
   setActiveBoardInstance(null);
   setActiveNoteInstance(null);
}

/** Applies the coordination rule for whichever kind `tab` is. Pointer-only. */
function activatePointersForTab(tab: OpenTab): void {
   if (tab.type === 'board') activateBoardPointers(tab.id);
   else if (tab.type === 'note') activateNotePointers(tab.id);
   else activateCharacterPointers(tab.id);
}

/**
 * Re-points every registry at `tab` (or the menu when `null`), reusing the module-private three-way
 * park logic. Exposed for the tutorial demo teardown, which must restore whichever kind the user's
 * prior tab was without duplicating the park rules. Pointer-only: touches no tab or workspace state.
 */
export function restoreActivePointers(tab: OpenTab | null): void {
   if (tab) activatePointersForTab(tab);
   else activateMenuPointers();
}

/**
 * Points the active instance at the character `id`, appends a character tab for it when
 * not already open, marks it active, and persists the workspace. Keep-alive: this never
 * disposes the previously active instance.
 */
function appendAndActivate(id: string): void {
   activateCharacterPointers(id);
   useTabManagerStore.setState((state) => ({
      openTabs: state.openTabs.some((tab) => tab.id === id)
         ? state.openTabs
         : [...state.openTabs, { id, type: 'character' }],
      activeTabId: id,
   }));
   persistWorkspace();
}

/** Board counterpart of {@link appendAndActivate}: appends/focuses a board tab and activates it. */
function appendAndActivateBoard(id: string): void {
   activateBoardPointers(id);
   useTabManagerStore.setState((state) => ({
      openTabs: state.openTabs.some((tab) => tab.id === id)
         ? state.openTabs
         : [...state.openTabs, { id, type: 'board' }],
      activeTabId: id,
   }));
   persistWorkspace();
}

/** Note counterpart of {@link appendAndActivate}: appends/focuses a note tab and activates it. */
function appendAndActivateNote(id: string): void {
   activateNotePointers(id);
   useTabManagerStore.setState((state) => ({
      openTabs: state.openTabs.some((tab) => tab.id === id)
         ? state.openTabs
         : [...state.openTabs, { id, type: 'note' }],
      activeTabId: id,
   }));
   persistWorkspace();
}

/**
 * Points both registries at the menu and nulls `activeTabId`, KEEPING `openTabs` and
 * every live instance. Shared by the desktop `deactivate` action and (after disposing
 * the live character) the mobile return-to-menu.
 */
function deactivateToMenu(): void {
   activateMenuPointers();
   useTabManagerStore.setState({ activeTabId: null });
   persistWorkspace();
}

/**
 * Disposes every live character instance (flush → detach → dispose), leaving only the
 * permanent menu fallback. Enforces the mobile single-live invariant in one
 * place; never touches `openTabs`.
 */
function disposeLiveCharacterInstances(): void {
   for (const id of getCharacterInstanceIds()) {
      detachPersistenceHandle(id);
      disposeInstance(id);
   }
}

/**
 * Tears down every live character instance the DISCARD way (drop the handle without flushing,
 * dispose, delete its working row) and prunes its tab from `openTabs`. The mobile overwrite
 * teardown: the outgoing working copy is thrown away, never flushed - flushing would race the
 * debounced save against the delete and could resurrect a just-deleted row. Contrast
 * {@link disposeLiveCharacterInstances}, which flushes and leaves the tab in place.
 */
function discardLiveCharacterInstances(): void {
   const liveIds = getCharacterInstanceIds();
   for (const id of liveIds) {
      discardPersistenceHandle(id);
      disposeInstance(id);
      void deleteCharacter(id).catch((error) => {
         console.error('Failed to delete replaced character record:', error);
      });
   }
   if (liveIds.length > 0) {
      useTabManagerStore.setState((state) => ({
         openTabs: state.openTabs.filter((tab) => !liveIds.includes(tab.id)),
      }));
   }
}

export const useTabManagerStore = create<TabManagerState>(() => ({
   openTabs: [],
   activeTabId: null,
   journey: EMPTY_JOURNEY,
   actions: {
      // ==================
      //  Desktop (keep-alive)
      // ==================
      createCharacterTab: (game) => {
         const character = buildNewCharacter(game);
         const instance = getOrCreateInstance(character.id);
         attachPersistenceHandle(character.id, instance);
         // Unguarded load: the handle's subscription autosaves the new character.
         instance.getState().actions.loadCharacter(character);
         appendAndActivate(character.id);
      },
      openCharacterTab: (character, drawerItemId) => {
         // Focus-or-add: an already-open character is focused, never reloaded (which
         // would clobber its unsaved edits and undo stack).
         if (useTabManagerStore.getState().openTabs.some((tab) => tab.id === character.id)) {
            useTabManagerStore.getState().actions.setActiveTab(character.id);
            return;
         }
         const instance = getOrCreateInstance(character.id);
         attachPersistenceHandle(character.id, instance);
         // Unguarded load: drawer/import content becomes an autosaved working record.
         instance.getState().actions.loadCharacter(character, drawerItemId);
         // Opened from the drawer: it matches its saved copy, so it starts clean (the
         // change subscription dirties it on the first edit). An import (no link) stays dirty.
         if (drawerItemId) instance.getState().actions.setHasUnsavedChanges(false);
         appendAndActivate(character.id);
      },
      createBoardTab: async () => {
         // The board row must exist before we can key a tab/instance by its id.
         const board = await createBoard(DEFAULT_BOARD_NAME);
         const instance = getOrCreateBoardInstance(board.id);
         await instance.getState().actions.hydrate(board.id);
         appendAndActivateBoard(board.id);
      },
      openBoardTab: async (boardId) => {
         // Focus-or-add: an already-open board is focused, never re-hydrated.
         if (useTabManagerStore.getState().openTabs.some((tab) => tab.id === boardId)) {
            useTabManagerStore.getState().actions.setActiveTab(boardId);
            return;
         }
         const instance = getOrCreateBoardInstance(boardId);
         await instance.getState().actions.hydrate(boardId);
         appendAndActivateBoard(boardId);
      },
      createNoteTab: async () => {
         // The note row must exist before we can key a tab/instance by its id.
         const note = await createNote();
         const instance = getOrCreateNoteInstance(note.id);
         await instance.getState().actions.hydrate(note.id);
         appendAndActivateNote(note.id);
      },
      openNoteTab: async (noteId) => {
         // Focus-or-add: an already-open note is focused, never re-hydrated (which would
         // clobber its unsaved edits).
         if (useTabManagerStore.getState().openTabs.some((tab) => tab.id === noteId)) {
            useTabManagerStore.getState().actions.setActiveTab(noteId);
            return;
         }
         const instance = getOrCreateNoteInstance(noteId);
         await instance.getState().actions.hydrate(noteId);
         appendAndActivateNote(noteId);
      },
      closeTab: (id) => {
         const { openTabs, activeTabId } = useTabManagerStore.getState();
         const index = openTabs.findIndex((tab) => tab.id === id);
         if (index === -1) return;
         const closing = openTabs[index];

         // Closing is "for good": dispose the instance and delete the working record so
         // the store stays in sync with the open tabs. A drawer-saved copy survives and
         // reopens (boards: board-8); an unsaved one is gone. (Desktop only; mobile keeps it.)
         if (closing.type === 'board') {
            disposeBoardInstance(id);
            void deleteBoard(id).catch((error) => {
               console.error('Failed to delete closed board record:', error);
            });
         } else if (closing.type === 'note') {
            // A DRAWER-BACKED note's drawer item is the durable source, so its working row just reaps and any
            // board tile keeps resolving via the drawer item (a linked reference). A DRAWER-LESS (never-saved)
            // note has no such fallback, so before reaping we RE-FREEZE every board tile referencing it into a
            // self-contained copy carrying the note's latest content (the editor flushes on unmount, so the
            // in-memory `note` holds it) - the tile becomes a static copy (re-adoptable), nothing drawer-less
            // survives close, and the "linked" badge stays honest (shown only for a reachable source).
            const state = getOrCreateNoteInstance(id).getState();
            const drawerItemId = state.drawerItemId;
            const latestNote = state.note;
            disposeNoteInstance(id);
            if (drawerItemId) {
               void deleteNote(id).catch((error) => {
                  console.error('Failed to delete closed note record:', error);
               });
            } else {
               void (latestNote ? refreezeDrawerlessNoteReferences(id, latestNote) : Promise.resolve())
                  .then(() => deleteNote(id))
                  .catch((error) => { console.error('Failed to re-freeze/reap closed note record:', error); });
            }
         } else {
            // Discard the handle WITHOUT flushing (no point saving what we delete).
            discardPersistenceHandle(id);
            disposeInstance(id);
            void deleteCharacter(id).catch((error) => {
               console.error('Failed to delete closed character record:', error);
            });
         }

         const remaining = openTabs.filter((tab) => tab.id !== id);

         if (activeTabId !== id) {
            // Closed a background tab: the active one is untouched.
            useTabManagerStore.setState({ openTabs: remaining });
            persistWorkspace();
            return;
         }

         // Closed the active tab: activate the right neighbour, else the left, else the
         // menu - coordinating both pointers for whichever kind the new active tab is.
         const nextTab = openTabs[index + 1] ?? openTabs[index - 1] ?? null;
         if (nextTab) {
            activatePointersForTab(nextTab);
            useTabManagerStore.setState({ openTabs: remaining, activeTabId: nextTab.id });
         } else {
            activateMenuPointers();
            useTabManagerStore.setState({ openTabs: remaining, activeTabId: null });
         }
         persistWorkspace();
      },
      closeActiveTab: () => {
         const { activeTabId } = useTabManagerStore.getState();
         if (activeTabId !== null) useTabManagerStore.getState().actions.closeTab(activeTabId);
      },
      setActiveTab: (id) => {
         const tab = useTabManagerStore.getState().openTabs.find((openTab) => openTab.id === id);
         if (!tab) return;

         if (tab.type === 'board') {
            const instance = getOrCreateBoardInstance(id);
            activateBoardPointers(id); // keep-alive: previous active instance is left intact
            useTabManagerStore.setState({ activeTabId: id });
            persistWorkspace();
            // Device-flip safety net: hydrate on demand if this board was never loaded.
            if (instance.getState().boardId === null) {
               void instance.getState().actions.hydrate(id);
            }
            return;
         }

         if (tab.type === 'note') {
            const instance = getOrCreateNoteInstance(id);
            activateNotePointers(id); // keep-alive: previous active instance is left intact
            useTabManagerStore.setState({ activeTabId: id });
            persistWorkspace();
            // Device-flip safety net: hydrate on demand if this note was never loaded.
            if (instance.getState().noteId === null) {
               void instance.getState().actions.hydrate(id);
            }
            return;
         }

         const instance = getOrCreateInstance(id);
         activateCharacterPointers(id); // keep-alive: previous active instance is left intact
         useTabManagerStore.setState({ activeTabId: id });
         persistWorkspace();
         // Device-flip safety net: if this tab has no live character (e.g. the user
         // resized mobile→desktop without a reload, so mobile only hydrated the active
         // one), hydrate it from storage on demand. A reload otherwise reconciles it.
         if (instance.getState().character === null) {
            void hydrateInstanceFromStorage(id);
         }
      },
      reorderTabs: (fromId, toId) => {
         if (fromId === toId) return;
         const { openTabs } = useTabManagerStore.getState();
         const fromIndex = openTabs.findIndex((tab) => tab.id === fromId);
         const toIndex = openTabs.findIndex((tab) => tab.id === toId);
         if (fromIndex === -1 || toIndex === -1) return;

         const next = [...openTabs];
         const [moved] = next.splice(fromIndex, 1);
         next.splice(toIndex, 0, moved);
         // Order only, `activeTabId` and every instance are untouched.
         useTabManagerStore.setState({ openTabs: next });
         persistWorkspace();
      },
      setTabZoom: (id, zoom) => {
         const clamped = clampSheetZoom(zoom);
         useTabManagerStore.setState((state) => ({
            openTabs: state.openTabs.map((tab) => (tab.id === id ? { ...tab, zoom: clamped } : tab)),
         }));
         persistWorkspace();
      },
      deactivate: () => {
         // Desktop "Return to Menu": no disposal, tabs and instances stay live.
         deactivateToMenu();
      },

      rekeyEntityTab: async (kind, oldId, newId) => {
         if (oldId === newId) return;

         // Bring the NEW instance up from the working rows the fork just wrote (a character also gets
         // its persistence handle attached here). Undo history is intentionally NOT carried over: a
         // board's undo commands name the OLD item ids (re-minted by the fork, so they no longer exist),
         // and a character's zundo snapshots hold the OLD identity (undoing past the fork would restore -
         // and autosave - the old id, re-opening the very conflation the fork closes). A fresh hydrate
         // starts both stacks empty, which is the safe branch point for a "save an independent copy".
         await hydrateTabFromStorage({ id: newId, type: kind });

         const wasActive = useTabManagerStore.getState().activeTabId === oldId;
         useTabManagerStore.setState((state) => ({
            openTabs: state.openTabs.map((tab) => (tab.id === oldId ? { id: newId, type: kind, zoom: tab.zoom } : tab)),
            activeTabId: wasActive ? newId : state.activeTabId,
            journey: rekeyJourneyEntity(state.journey, oldId, newId),
         }));
         // Point the registries at the new instance before disposing the old, so the active pointer is
         // never momentarily dangling (and disposing the old can't clear the freshly-set new pointer).
         if (wasActive) activatePointersForTab({ id: newId, type: kind });

         // Tear down the OLD instance WITHOUT flushing. A character's handle is discarded (drop the pending
         // debounce, never write back to the old id / original drawer item); boards/notes just dispose.
         if (kind === 'board') disposeBoardInstance(oldId);
         else if (kind === 'note') disposeNoteInstance(oldId);
         else {
            discardPersistenceHandle(oldId);
            disposeInstance(oldId);
         }

         // Reap the old working rows: the original is a durable drawer item, so a reopen re-materializes it
         // from that saved copy (any pre-fork uncommitted edits stayed with the fork, by design).
         if (kind === 'board') await deleteBoard(oldId);
         else if (kind === 'note') await deleteNote(oldId);
         else await deleteCharacter(oldId);

         persistWorkspace();
      },

      // ==================
      //  Portal trail (ephemeral journey)
      // ==================
      // Thin wrappers over the pure `journey.ts` reducers; the slice is never persisted (see the file header).
      pushJourney: (from, to) => {
         useTabManagerStore.setState((state) => ({ journey: pushJourney(state.journey, from, to) }));
      },
      goToJourneyIndex: (index) => {
         const { slice, entry } = goToJourneyIndex(useTabManagerStore.getState().journey, index);
         useTabManagerStore.setState({ journey: slice });
         return entry;
      },
      journeyBack: () => {
         const { slice, entry } = journeyBack(useTabManagerStore.getState().journey);
         useTabManagerStore.setState({ journey: slice });
         return entry;
      },
      journeyForward: () => {
         const { slice, entry } = journeyForward(useTabManagerStore.getState().journey);
         useTabManagerStore.setState({ journey: slice });
         return entry;
      },
      dropJourneyEntry: (entityId) => {
         useTabManagerStore.setState((state) => ({ journey: dropJourneyEntry(state.journey, entityId) }));
      },
      clearJourney: () => {
         useTabManagerStore.setState({ journey: EMPTY_JOURNEY });
      },

      // ==================
      //  Mobile (single live character instance)
      // ==================
      mobileOpenCharacter: (character, drawerItemId) => {
         // Already the live active character → nothing to do.
         if (useTabManagerStore.getState().activeTabId === character.id) return;
         disposeLiveCharacterInstances();
         const instance = getOrCreateInstance(character.id);
         attachPersistenceHandle(character.id, instance);
         instance.getState().actions.loadCharacter(character, drawerItemId);
         if (drawerItemId) instance.getState().actions.setHasUnsavedChanges(false);
         appendAndActivate(character.id);
      },
      mobileReplaceWithNewCharacter: (game) => {
         // TRUE overwrite: discard the outgoing working copy (never flush), then build the new one.
         discardLiveCharacterInstances();
         const character = buildNewCharacter(game);
         const instance = getOrCreateInstance(character.id);
         attachPersistenceHandle(character.id, instance);
         instance.getState().actions.loadCharacter(character);
         appendAndActivate(character.id);
      },
      mobileReplaceWithImportedCharacter: (character) => {
         // An import is a fresh identity: re-id the whole aggregate (new character/card/journal ids,
         // sheetLayout remapped, journal pages/bookmarks + asset hashes preserved, drawer link cleared).
         // The fresh id also keeps the async delete of the outgoing row from reaping the freshly-loaded one.
         const incoming = reIdCharacterAggregate(character);
         // TRUE overwrite with an imported sheet: discard the outgoing working copy, then load the
         // import (no drawer link, so it starts dirty).
         discardLiveCharacterInstances();
         const instance = getOrCreateInstance(incoming.id);
         attachPersistenceHandle(incoming.id, instance);
         instance.getState().actions.loadCharacter(incoming);
         appendAndActivate(incoming.id);
      },
      mobileReturnToMenu: () => {
         // Dispose the live character (don't surface a hidden neighbour), then show
         // the menu while keeping the shared `openTabs`.
         disposeLiveCharacterInstances();
         deactivateToMenu();
      },
      mobileCloseSheet: () => {
         // Discard the live character (prune its tab + drop its working row, no flush), then show the
         // menu. The discard never flushes, so a Save & Close must finish its save before calling this.
         discardLiveCharacterInstances();
         deactivateToMenu();
      },
   },
}));

/** Selector hook for the TabManager action bag (a stable reference). */
export const useTabManagerActions = () => useTabManagerStore((state) => state.actions);

/** The active tab's sheet zoom factor (default 1). Reactive. */
export const useActiveSheetZoom = (): number =>
   useTabManagerStore((state) => state.openTabs.find((tab) => tab.id === state.activeTabId)?.zoom ?? DEFAULT_SHEET_ZOOM);

/** Non-reactive read of the active tab's sheet zoom, for imperative math (e.g. resize deltas). */
export function getActiveSheetZoom(): number {
   const { openTabs, activeTabId } = useTabManagerStore.getState();
   return openTabs.find((tab) => tab.id === activeTabId)?.zoom ?? DEFAULT_SHEET_ZOOM;
}

/**
 * Describes the currently-active tab as a {@link JourneyEntry} (kind, id, live name), or `null` at the menu.
 * Read SYNCHRONOUSLY by portal activation to capture the trail's `from` origin BEFORE the async open flips the
 * active pointer. The name resolves from the tab's own live registry instance.
 */
export function getActiveTabJourneyEntry(): JourneyEntry | null {
   const { openTabs, activeTabId } = useTabManagerStore.getState();
   if (activeTabId === null) return null;
   const tab = openTabs.find((openTab) => openTab.id === activeTabId);
   if (!tab) return null;
   return { tabKind: tab.type, entityId: tab.id, name: resolveTabName(tab) };
}

/** The live display name for a tab, read from its own registry instance ('' when unresolved). */
function resolveTabName(tab: OpenTab): string {
   if (tab.type === 'board') return getOrCreateBoardInstance(tab.id).getState().name ?? '';
   if (tab.type === 'note') return getOrCreateNoteInstance(tab.id).getState().note?.title ?? '';
   return getOrCreateInstance(tab.id).getState().character?.name ?? '';
}

/**
 * Creates the instance for stored character `id`, attaches its handle, and hydrates
 * it from IndexedDB under the handle's guard (so the just-restored state is not
 * written straight back). Does NOT touch tab state or the active pointer, the boot
 * loop manages ordering and activation. Returns `false` when no record exists.
 */
async function hydrateInstanceFromStorage(id: string): Promise<boolean> {
   const record = await getCharacter(id);
   if (!record) return false;

   const harmonized = harmonizeData(record.character, 'FULL_CHARACTER_SHEET');
   const instance = getOrCreateInstance(id);
   const handle = attachPersistenceHandle(id, instance);
   handle.hydrate(harmonized, record.drawerItemId ?? undefined);
   return true;
}

/**
 * Board counterpart of {@link hydrateInstanceFromStorage}: creates the board instance
 * and loads it from IndexedDB. Boards have no persistence handle (item mutations persist
 * via commands; the viewport saves inside the store). Returns `false` when no record
 * exists, so boot prunes a stale board tab.
 */
async function hydrateBoardInstanceFromStorage(id: string): Promise<boolean> {
   if (!(await loadBoard(id))) return false;
   const instance = getOrCreateBoardInstance(id);
   await instance.getState().actions.hydrate(id);
   return true;
}

/**
 * Note counterpart of {@link hydrateBoardInstanceFromStorage}: creates the note instance
 * and loads it from IndexedDB. Notes have no persistence handle (the note store
 * debounce-saves onto its row). Returns `false` when no record exists, so boot prunes a
 * stale note tab.
 */
async function hydrateNoteInstanceFromStorage(id: string): Promise<boolean> {
   if (!(await getNote(id))) return false;
   const instance = getOrCreateNoteInstance(id);
   await instance.getState().actions.hydrate(id);
   return true;
}

/** Hydrates `tab` from storage by kind. Returns `false` when its record is missing. */
function hydrateTabFromStorage(tab: OpenTab): Promise<boolean> {
   if (tab.type === 'board') return hydrateBoardInstanceFromStorage(tab.id);
   if (tab.type === 'note') return hydrateNoteInstanceFromStorage(tab.id);
   return hydrateInstanceFromStorage(tab.id);
}

/**
 * Resolves the id boot should activate. A `null` stored active is intentional
 * (desktop "Return to Menu" deactivated while keeping tabs) and is preserved
 * as `null` (boot to the menu). A non-null-but-stale active (its tab is gone) falls
 * back to the first tab. Returns `null` when there are no tabs.
 */
function resolveIntendedActiveId(workspace: Workspace): string | null {
   if (workspace.activeId === null) return null; // deactivated: stay at the menu
   if (workspace.openTabs.some((tab) => tab.id === workspace.activeId)) return workspace.activeId;
   return workspace.openTabs[0]?.id ?? null; // stale active → first tab
}

/**
 * Desktop boot: hydrate the intended-active tab FIRST and lift
 * the loading gate immediately, then hydrate the rest just behind it in order,
 * pruning any whose record is missing. Persists the pruned workspace.
 */
async function bootDesktop(workspace: Workspace): Promise<void> {
   const tabs = workspace.openTabs;
   const intendedActiveId = resolveIntendedActiveId(workspace);
   const intendedActiveTab = intendedActiveId !== null ? tabs.find((tab) => tab.id === intendedActiveId) ?? null : null;

   const survivors: OpenTab[] = [];

   if (intendedActiveTab && (await hydrateTabFromStorage(intendedActiveTab))) {
      survivors.push(intendedActiveTab);
      // Coordinate both pointers for whichever kind the intended-active tab is.
      activatePointersForTab(intendedActiveTab);
      useTabManagerStore.setState({ openTabs: [...survivors], activeTabId: intendedActiveTab.id });
   }
   // Active is ready (or there was nothing to restore): paint now; the rest follow.
   finishBootHydration();

   for (const tab of tabs) {
      if (tab.id === intendedActiveId) continue;
      if (await hydrateTabFromStorage(tab)) survivors.push(tab);
   }
   const ordered = tabs.filter((tab) => survivors.some((survivor) => survivor.id === tab.id));

   let activeId = useTabManagerStore.getState().activeTabId;
   if (activeId === null) {
      if (intendedActiveId !== null && ordered.length > 0) {
         // We intended to restore a tab but its record was stale → first survivor.
         activatePointersForTab(ordered[0]);
         activeId = ordered[0].id;
      } else {
         // Deactivated (intended the menu), or nothing survived → menu.
         activateMenuPointers();
      }
   }
   useTabManagerStore.setState({ openTabs: ordered, activeTabId: activeId });
   writeWorkspace({ openTabs: ordered, activeId });
}

/**
 * Mobile boot: preserve the full `openTabs` list (never prune the
 * shared desktop set) but hydrate ONLY the active tab's instance, leaving the others
 * as ids without live instances. Lands on the menu if the active record is missing.
 */
async function bootMobile(workspace: Workspace): Promise<void> {
   const tabs = workspace.openTabs;
   const intendedActiveId = resolveIntendedActiveId(workspace);
   const intendedActiveTab = intendedActiveId !== null ? tabs.find((tab) => tab.id === intendedActiveId) ?? null : null;

   let activeId: string | null = null;
   // Boards and notes are desktop-only: never hydrate or activate one on mobile (they stay
   // dormant ids in `openTabs`). A board/note intended-active lands on the menu instead.
   if (intendedActiveTab?.type === 'character' && (await hydrateInstanceFromStorage(intendedActiveTab.id))) {
      activeId = intendedActiveTab.id;
      activateCharacterPointers(activeId);
   } else {
      activateMenuPointers();
   }
   finishBootHydration();

   useTabManagerStore.setState({ openTabs: tabs, activeTabId: activeId });
   writeWorkspace({ openTabs: tabs, activeId });
}

/**
 * Boot step run by `AppStartManager` after the character migration: restore the
 * workspace, platform-aware (desktop hydrates all tabs active-first; mobile hydrates
 * only the active one). The device check is non-hook (boot runs outside
 * React). Always lifts the boot loading gate (the inner boots lift it early; the
 * `finally` is the safety net), so first paint resolves to the active sheet or the
 * menu without a flash.
 */
export async function runCharacterBoot(): Promise<void> {
   try {
      const workspace = readWorkspace();
      if (getEffectiveDeviceType() === 'mobile') {
         await bootMobile(workspace);
      } else {
         await bootDesktop(workspace);
      }
   } finally {
      finishBootHydration();
   }
}
