// -- Other Library Imports --
import { create } from 'zustand';

// -- Notes Data Layer Imports --
import { getNote, linkNoteToDrawerItem, patchNote, saveNoteToLinkedDrawerItem } from '@/lib/notes/noteRepository';
import { recordToNote } from '@/lib/notes/noteRecords';

// -- Store Imports --
import { useAppGeneralStateStore } from './appGeneralStateStore';

// -- Type Imports --
import type { Note, NoteCover } from '@/lib/types/board';
import type { SaveNoteToDrawerResult } from '@/lib/notes/noteRepository';
import type { NoteHeading } from '@/lib/notes/noteOutline';

/*
 * Note store - the React-facing, in-memory view of ONE open Note, backed by the note
 * repository. A Note is a single flat document, so there is no command engine and no undo
 * stack (the editor is a plain textarea, not a spatial canvas): title/body edits apply in
 * memory and debounce-persist onto the note row. It mirrors the per-instance factory shape
 * of the board store (one store per open note), minus the item/command machinery.
 */

/** How long a title/body edit settles before it is written back to the note record. */
const NOTE_SAVE_DEBOUNCE_MS = 400;

export interface NoteState {
   /** The open note's id, or `null` before the first successful hydrate. */
   noteId: string | null;
   /** The live document. */
   note: Note | null;
   /** The linked drawer `NOTE` item, or `null` when this note was never saved. */
   drawerItemId: string | null;
   /** True when the note differs from its saved drawer copy, or was never saved. */
   hasUnsavedChanges: boolean;
   /**
    * Whether the note editor's shared undo/redo timeline has a step available. Transient, editor-derived (the
    * timeline lives in CM6, not the store): the mounted editor pushes these via {@link NoteState.actions.setUndoAvailability};
    * both are `false` in Reading mode / when no editor is mounted. The sidebar undo/redo control reads them,
    * mirroring the board's `canUndo`/`canRedo` (see `NoteUndoRedoControls`).
    */
   canUndo: boolean;
   canRedo: boolean;
   isLoading: boolean;
   error: string | null;
   actions: {
      /** Loads a note into the store from its record. Tolerates a missing note. */
      hydrate: (noteId: string) => Promise<void>;
      /** Seeds the store from an in-hand aggregate (a freshly created note), linking its drawer item if any. */
      loadNote: (note: Note, drawerItemId?: string | null) => void;
      /** Updates the title in memory and debounce-persists it; marks the note dirty. */
      updateTitle: (title: string) => void;
      /** Updates the body in memory and debounce-persists it; marks the note dirty. */
      updateBody: (body: string) => void;
      /** Sets a fresh note-level cover (hash + box width/aspect) in memory and debounce-persists it; marks the note dirty. */
      setCover: (cover: NoteCover) => void;
      /** Patches the current cover's box (width and/or aspect) in memory and debounce-persists it; marks the note dirty. No-op with no cover. */
      updateCover: (patch: Partial<Pick<NoteCover, 'width' | 'aspect'>>) => void;
      /** Clears the note-level cover in memory and debounce-persists it; marks the note dirty. */
      clearCover: () => void;
      /** Sets the unsaved-changes flag directly (e.g. a save site marks the note clean). */
      setHasUnsavedChanges: (value: boolean) => void;
      /**
       * Registers (or clears with `null`) the mounted editor's undo/redo, so the sidebar control can drive the
       * CM6 timeline through the store. Clearing also resets availability to `false` (Reading mode / no editor).
       */
      setUndoController: (controller: { undo: () => void; redo: () => void } | null) => void;
      /** Pushes the editor's current undo/redo availability into the store (fires on every history change). */
      setUndoAvailability: (canUndo: boolean, canRedo: boolean) => void;
      /** Undoes the latest step in the note's shared timeline (body/title/cover), via the registered editor. No-op with none. */
      undo: () => void;
      /** Redoes the latest reverted step, via the registered editor. No-op with none. */
      redo: () => void;
      /**
       * Registers (or clears with `null`) the mounted note surface's outline-jump handler, so the command palette
       * can jump to a heading regardless of the editor/reading DOM. The surface routes it per mode (scroll the CM6
       * editor in Live/Source, scroll to the `#slug` element in Reading).
       */
      setOutlineJump: (jump: ((heading: NoteHeading) => void) | null) => void;
      /** Jumps the note surface to a heading (from the palette's Jump-to-section picker). No-op when no surface is mounted. */
      jumpToHeading: (heading: NoteHeading) => void;
      /**
       * Registers (or clears with `null`) the mounted note surface's link-picker opener, so the command palette's
       * "Insert link" can open the SAME toolbar picker. The surface's opener flips to an editable mode first.
       */
      setLinkPickerOpener: (open: (() => void) | null) => void;
      /** Opens the note surface's link picker (from the palette's Insert-link command). No-op when no surface is mounted. */
      openLinkPicker: () => void;
      /**
       * Immediately persists the current document onto its row AND disarms any pending debounce.
       * The Note tab surface calls this on unmount (a tab switch fires no blur), and eviction calls it
       * before disposing the instance, so the last keystroke lands and no stale timer can fire late.
       */
      flush: () => void;
      /**
       * Saves the note to its LINKED drawer item (if any), flushing the live document.
       * Marks the note clean on success. Returns the outcome, or `null` when no note is
       * loaded; `{ linkedItemUpdated: false }` means the caller should "Save As".
       */
      saveToDrawer: () => Promise<SaveNoteToDrawerResult | null>;
      /**
       * Links the note to a new drawer item id (for "Save As"), flushes the document,
       * marks the note clean, and returns the aggregate to seed that drawer item.
       */
      linkToDrawerItem: (drawerItemId: string) => Promise<Note | null>;
   };
}

const initialState: Pick<NoteState, 'noteId' | 'note' | 'drawerItemId' | 'hasUnsavedChanges' | 'canUndo' | 'canRedo' | 'isLoading' | 'error'> = {
   noteId: null,
   note: null,
   drawerItemId: null,
   hasUnsavedChanges: false,
   canUndo: false,
   canRedo: false,
   isLoading: false,
   error: null,
};

/** Normalizes a thrown value into the store's `error` message string. */
function toErrorMessage(error: unknown): string {
   return error instanceof Error ? error.message : String(error);
}

/** Marks the note store as the most recently modified, so Ctrl/Cmd+Z routing skips the drawer. */
function markNoteModified(): void {
   useAppGeneralStateStore.getState().actions.setLastModifiedStore('note');
}

/**
 * A trailing-edge debouncer with an explicit `cancel`, so `flush` can write-now AND disarm the pending
 * timer. Without the cancel, an evicted-then-revisited note could let a stale late write clobber a fresh
 * edit. At most one timer in flight. No new dependency.
 */
function createDebouncer<T>(delay: number, run: (value: T) => void): { run: (value: T) => void; cancel: () => void } {
   let timer: ReturnType<typeof setTimeout> | null = null;
   return {
      run: (value: T) => {
         if (timer) clearTimeout(timer);
         timer = setTimeout(() => {
            timer = null;
            run(value);
         }, delay);
      },
      cancel: () => {
         if (timer) {
            clearTimeout(timer);
            timer = null;
         }
      },
   };
}

/**
 * Builds a note store instance: the in-memory document plus the action API. Each open
 * note tab owns its own instance (like a board), so two notes never share mutable state.
 * The `saveDebounceMs` option exists for tests; production uses the default.
 */
export function createNoteStore(options: { saveDebounceMs?: number } = {}) {
   const saveDebounceMs = options.saveDebounceMs ?? NOTE_SAVE_DEBOUNCE_MS;

   const useStore = create<NoteState>()((set, get) => {
      // The mounted editor's undo/redo, registered while a CM6 editor is up (editable modes). A function ref,
      // not reactive state - only the derived `canUndo`/`canRedo` are in state, for the sidebar to subscribe to.
      let undoController: { undo: () => void; redo: () => void } | null = null;
      // The mounted note surface's outline-jump handler (mode-aware), registered by `NoteView`. A function ref
      // (not state) - the palette calls `jumpToHeading` through it; the rail calls the surface's own fn directly.
      let outlineJump: ((heading: NoteHeading) => void) | null = null;
      // The mounted note surface's link-picker opener, registered by `NoteView` (flips to an editable mode, then
      // opens the toolbar picker). A function ref - the palette's Insert-link command calls it.
      let linkPickerOpener: (() => void) | null = null;

      /** Persists the current document onto its row. Best-effort; a missing row is a no-op. */
      const debouncedSave = createDebouncer<Note>(saveDebounceMs, (note) => {
         void patchNote(note.id, { title: note.title, body: note.body, cover: note.cover }).catch((error) => {
            console.error('Note save failed:', error);
         });
      });

      /** Marks a real edit: routes Ctrl/Cmd+Z here AND flags the note dirty (so close warns). */
      const markDirty = (): void => {
         markNoteModified();
         set({ hasUnsavedChanges: true });
      };

      return {
         ...initialState,
         actions: {
            hydrate: async (noteId) => {
               set({ isLoading: true, error: null });
               try {
                  const record = await getNote(noteId);
                  if (!record) {
                     set({ ...initialState, error: `Note not found: ${noteId}` });
                     return;
                  }
                  // Opened from its record: it matches its saved copy (if any), so it starts
                  // clean. The first edit dirties it.
                  set({ noteId, note: recordToNote(record), drawerItemId: record.drawerItemId ?? null, hasUnsavedChanges: false, isLoading: false, error: null });
               } catch (error) {
                  set({ isLoading: false, error: toErrorMessage(error) });
               }
            },

            loadNote: (note, drawerItemId) => {
               // Seeded from an in-hand aggregate: it matches its persisted row, so it starts clean.
               set({ noteId: note.id, note, drawerItemId: drawerItemId ?? null, hasUnsavedChanges: false, isLoading: false, error: null });
            },

            updateTitle: (title) => {
               const note = get().note;
               if (!note) return;
               const next = { ...note, title };
               markDirty();
               set({ note: next });
               debouncedSave.run(next);
            },

            updateBody: (body) => {
               const note = get().note;
               if (!note) return;
               const next = { ...note, body };
               markDirty();
               set({ note: next });
               debouncedSave.run(next);
            },

            setCover: (cover) => {
               const note = get().note;
               if (!note) return;
               const next = { ...note, cover };
               markDirty();
               set({ note: next });
               debouncedSave.run(next);
            },

            updateCover: (patch) => {
               const note = get().note;
               if (!note || !note.cover) return;
               const next = { ...note, cover: { ...note.cover, ...patch } };
               markDirty();
               set({ note: next });
               debouncedSave.run(next);
            },

            clearCover: () => {
               const note = get().note;
               if (!note || !note.cover) return;
               const next = { ...note, cover: undefined };
               markDirty();
               set({ note: next });
               debouncedSave.run(next);
            },

            setHasUnsavedChanges: (value) => {
               set({ hasUnsavedChanges: value });
            },

            setUndoController: (controller) => {
               undoController = controller;
               if (!controller) set({ canUndo: false, canRedo: false });
            },

            setUndoAvailability: (canUndo, canRedo) => {
               set({ canUndo, canRedo });
            },

            undo: () => undoController?.undo(),
            redo: () => undoController?.redo(),

            setOutlineJump: (jump) => { outlineJump = jump; },
            jumpToHeading: (heading) => outlineJump?.(heading),

            setLinkPickerOpener: (open) => { linkPickerOpener = open; },
            openLinkPicker: () => linkPickerOpener?.(),

            flush: () => {
               // Disarm the pending debounce FIRST, then write now: a still-armed timer holds a stale
               // snapshot that would fire late and clobber a fresher edit after a revisit.
               debouncedSave.cancel();
               const note = get().note;
               if (!note) return;
               void patchNote(note.id, { title: note.title, body: note.body, cover: note.cover }).catch((error) => {
                  console.error('Note flush failed:', error);
               });
            },

            saveToDrawer: async () => {
               const note = get().note;
               if (!note) return null;
               const result = await saveNoteToLinkedDrawerItem(note);
               if (result.linkedItemUpdated) set({ hasUnsavedChanges: false });
               return result;
            },

            linkToDrawerItem: async (drawerItemId) => {
               const note = get().note;
               if (!note) return null;
               const aggregate = await linkNoteToDrawerItem(note, drawerItemId);
               set({ drawerItemId, hasUnsavedChanges: false });
               return aggregate;
            },
         },
      };
   });

   return useStore;
}

/** A single note store instance: the in-memory document + actions. */
export type NoteStore = ReturnType<typeof createNoteStore>;
