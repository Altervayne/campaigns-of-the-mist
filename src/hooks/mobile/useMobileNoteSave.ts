// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';
import cuid from 'cuid';

// -- Utils Imports --
import { getDrawerItemDisplayPath } from '@/lib/drawer/drawerItemPath';
import { getActiveNoteStore } from '@/lib/notes/noteStoreRegistry';
import { stampNoteReferencesDrawerSource } from '@/lib/board/refreezeNoteReferences';
import { forkNoteToDrawerItem } from '@/lib/saveAs/forkToDrawer';

// -- Store Imports --
import { useDrawerActions, useDrawerStore } from '@/lib/stores/drawerStore';

// -- Type Imports --
import type { TFunction } from 'i18next';
import type { NoteStore } from '@/lib/stores/noteStore';
import type { Note } from '@/lib/types/board';
import type { GameSystem, GeneralItemType } from '@/lib/types/drawer';

/*
 * Mobile note Save / Save-As to the drawer. Mirrors the note semantics of `useSaveToDrawer`, but drives a
 * mobile name sheet and adds the drawer item directly instead of the sidebar's naming window. Save overwrites
 * the linked drawer item; Save-As on a linked note FORKS a fresh identity; a first save (no link) links + adds
 * one drawer item. Making the note drawer-backed is the point: a drawer-backed note survives closing its tab
 * (the drawer copy stays) instead of being reaped with it.
 *
 * The branch logic sits in standalone functions so it is unit-testable without React; the hook is the thin
 * wrapper that owns the name-sheet state.
 */

type AddDrawerItem = (
   name: string,
   game: GameSystem,
   type: GeneralItemType,
   content: Note,
   parentFolderId?: string,
   presetId?: string,
) => Promise<string>;

interface NoteSaveContext {
   store: NoteStore | null;
   addItem: AddDrawerItem;
   currentFolderId: string | null;
   t: TFunction;
}

/**
 * First-save / dangling-link path: keep the note's id, link a fresh drawer item, add it, and stamp any board
 * reference at the new item so a tile pointing at this note stays live across the save.
 */
async function firstSaveNote(ctx: NoteSaveContext, noteId: string, newItemId: string, name: string): Promise<void> {
   if (!ctx.store) return;
   const aggregate = await ctx.store.getState().actions.linkToDrawerItem(newItemId);
   if (!aggregate) return;
   await ctx.addItem(name, 'NEUTRAL', 'NOTE', aggregate, ctx.currentFolderId ?? undefined, newItemId);
   await stampNoteReferencesDrawerSource(noteId, newItemId);
}

/**
 * Save the active note to its linked drawer item. Returns `{ needsName: true }` when the note is unlinked, so
 * the caller opens the name sheet (Save-As); a dangling link keeps the note's identity and links a fresh item.
 */
export async function saveNote(ctx: NoteSaveContext): Promise<{ needsName: boolean }> {
   const store = ctx.store;
   if (!store) return { needsName: false };
   const { noteId, note, drawerItemId } = store.getState();
   if (!noteId || !note) return { needsName: false };

   if (!drawerItemId) return { needsName: true };

   try {
      const result = await store.getState().actions.saveToDrawer();
      if (result?.linkedItemUpdated) {
         // Keep any board tile referencing this note pointed at its drawer item (self-healing).
         await stampNoteReferencesDrawerSource(noteId, drawerItemId);
         const itemPath = await getDrawerItemDisplayPath(drawerItemId);
         toast.success(`${ctx.t('Notifications.note.saved')} ${itemPath}`);
      } else {
         // Dangling link: keep this note's identity and link a fresh drawer item (a fork would strand
         // references resolving via the working record).
         await firstSaveNote(ctx, noteId, cuid(), note.title);
         toast(ctx.t('Notifications.note.linkedItemMissing'));
      }
   } catch {
      toast.error(ctx.t('Notifications.drawer.actionFailed'));
   }
   return { needsName: false };
}

/**
 * Save the active note under `name` as a new drawer item. A linked note FORKS to a fresh identity the tab
 * adopts (references stay on the original); an unlinked note links + adds one item.
 */
export async function saveNoteAs(ctx: NoteSaveContext, name: string): Promise<void> {
   const store = ctx.store;
   if (!store) return;
   const { noteId, note, drawerItemId } = store.getState();
   if (!noteId || !note) return;
   const newItemId = cuid();

   try {
      if (drawerItemId) {
         const forked = await forkNoteToDrawerItem(newItemId);
         if (!forked) return;
         await ctx.addItem(name, 'NEUTRAL', 'NOTE', forked, ctx.currentFolderId ?? undefined, newItemId);
      } else {
         await firstSaveNote(ctx, noteId, newItemId, name);
      }
      const itemPath = await getDrawerItemDisplayPath(newItemId);
      toast.success(`${ctx.t('Notifications.note.saved')} ${itemPath}`);
   } catch {
      toast.error(ctx.t('Notifications.drawer.actionFailed'));
   }
}

/**
 * Owns the mobile note Save / Save-As flow and the name-sheet state. `save` overwrites the linked item (or
 * opens the name sheet on a first save); `openSaveAs` prompts for a name; `confirmSaveAs` runs the Save-As.
 */
export function useMobileNoteSave() {
   const { t } = useTranslation();
   const { addItem } = useDrawerActions();
   const currentFolderId = useDrawerStore((state) => state.currentFolderId);

   const [isNameSheetOpen, setIsNameSheetOpen] = useState(false);
   const [nameSheetDefault, setNameSheetDefault] = useState('');

   const buildContext = (): NoteSaveContext => ({ store: getActiveNoteStore(), addItem, currentFolderId, t });

   const openSaveAs = () => {
      setNameSheetDefault(getActiveNoteStore()?.getState().note?.title ?? '');
      setIsNameSheetOpen(true);
   };

   const save = async () => {
      const { needsName } = await saveNote(buildContext());
      if (needsName) openSaveAs();
   };

   const confirmSaveAs = (name: string) => {
      void saveNoteAs(buildContext(), name);
   };

   return { save, openSaveAs, confirmSaveAs, isNameSheetOpen, setIsNameSheetOpen, nameSheetDefault };
}
