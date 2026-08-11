// -- React Imports --
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';

// -- Utils Imports --
import { getDrawerItemDisplayPath } from '@/lib/drawer/drawerItemPath';
import { saveBoardImageAsToDrawer, saveBoardItemAsToDrawer, saveBoardItemToLinkedDrawerItem } from '@/lib/board/boardItemSaveBack';

// -- Store Imports --
import { useDrawerStore } from '@/lib/stores/drawerStore';
import { useAppGeneralStateStore, useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';

// -- Type Imports --
import type { ImageBoardContent, RollTableBoardContent } from '@/lib/types/board';

/*
 * Save-back for a board card/tracker copy, shared by the item's overflow menu AND the command palette so the
 * entry points can't drift. Save writes the copy's edited inner aggregate back to its linked drawer item by
 * id; a dangling link falls back to Save As transparently. Save As mints a fresh drawer item, opens the
 * drawer's naming window, and adopts the new id onto the board item so a later Save writes back. The adopt
 * is optimistic (before the name is confirmed - a cancelled name leaves a harmless dangling source that Save
 * just re-forks) and NON-undoable (bookkeeping, not a user edit; Ctrl+Z must undo the real prior board edit,
 * not silently unlink the twin). Toasts confirm the write.
 *
 * The orchestration lives in the two plain `runSaveItem*` functions so both the hook (toolbar kebab, its deps
 * from React state) and a non-hook caller (the palette's board-action handler in BoardView, reading store
 * state directly for the current selection) run ONE implementation. The hook only binds the React deps.
 */

/** The copy content a save targets: its origin link and inner aggregate. */
interface BoardItemSaveContent {
   sourceDrawerItemId?: string;
   data: unknown;
}

/** Ambient deps the save orchestration needs, threaded so a non-hook caller can supply them from store state. */
interface BoardItemSaveDeps {
   t: TFunction;
   /** The drawer folder a Save As mints into (its current folder). */
   drawerCurrentFolderId: string | null;
   isDrawerOpen: boolean;
   setDrawerOpen: (open: boolean) => void;
   /** Adopts the minted drawer id onto the copy's source link via a direct (non-undoable) write. */
   onAdoptSource: (sourceDrawerItemId: string) => void;
}

/** Mints a fresh drawer item from the copy, adopts its id, and opens the drawer's naming window. */
export function runSaveItemToDrawerAs(content: BoardItemSaveContent, deps: BoardItemSaveDeps): void {
   const newId = saveBoardItemAsToDrawer(content.data, deps.drawerCurrentFolderId ?? undefined);
   if (!newId) {
      toast.error(deps.t('Notifications.drawer.actionFailed'));
      return;
   }
   // Adopt the minted id now (optimistic, non-undoable), so a later Save writes back.
   deps.onAdoptSource(newId);
   // The naming window renders inside the drawer; open it so the flow is visible (like the sheet Save As).
   if (!deps.isDrawerOpen) deps.setDrawerOpen(true);
}

/** Writes the copy's edited inner aggregate back to its linked drawer item; a dangling link forks to Save As. */
export async function runSaveItemToDrawer(content: BoardItemSaveContent, deps: BoardItemSaveDeps): Promise<void> {
   const sourceId = content.sourceDrawerItemId;
   if (!sourceId) {
      runSaveItemToDrawerAs(content, deps);
      return;
   }
   try {
      const { linkedItemUpdated } = await saveBoardItemToLinkedDrawerItem(sourceId, content.data);
      if (linkedItemUpdated) {
         const itemPath = await getDrawerItemDisplayPath(sourceId);
         toast.success(`${deps.t('Notifications.board.itemSaved')} ${itemPath}`);
         void useDrawerStore.getState().actions.reloadCurrentFolder();
      } else {
         // The linked drawer item was deleted: fall back to Save As + notify.
         runSaveItemToDrawerAs(content, deps);
         toast(deps.t('Notifications.board.itemLinkedItemMissing'));
      }
   } catch {
      toast.error(deps.t('Notifications.drawer.actionFailed'));
   }
}

/**
 * "Save As" of a board IMAGE: mint a game-agnostic IMAGE_CARD into the drawer and open the naming window.
 * Mint only - a board image has no source link and no editable aggregate, so there is no write-back and no
 * adopt (unlike a card/tracker copy). A source-less image guards to a toast (nothing to save).
 */
export function runSaveImageToDrawerAs(
   image: ImageBoardContent,
   deps: Pick<BoardItemSaveDeps, 't' | 'drawerCurrentFolderId' | 'isDrawerOpen' | 'setDrawerOpen'>,
): void {
   const title = deps.t('BoardView.imageDefaultTitle');
   const newId = saveBoardImageAsToDrawer(image, title, deps.drawerCurrentFolderId ?? undefined);
   if (!newId) {
      // A board image with no asset has nothing to save.
      toast.error(deps.t('Notifications.board.imageNotSaveable'));
      return;
   }
   if (!deps.isDrawerOpen) deps.setDrawerOpen(true);
}

/**
 * "Save As" of a board roll table: mint the bare aggregate (its `kind` stripped, so the drawer stores the
 * game-agnostic `RollTableContent`) as a NEUTRAL drawer item and open the naming window. Mint only - a roll
 * table keeps its aggregate inline with no source link, so there is no write-back and no adopt (like a board
 * image); Save and Save As both mint.
 */
export function runSaveRollTableToDrawerAs(
   content: RollTableBoardContent,
   deps: Pick<BoardItemSaveDeps, 't' | 'drawerCurrentFolderId' | 'isDrawerOpen' | 'setDrawerOpen'>,
): void {
   const { kind: _kind, ...table } = content;
   const newId = saveBoardItemAsToDrawer(table, deps.drawerCurrentFolderId ?? undefined);
   if (!newId) {
      toast.error(deps.t('Notifications.board.itemNotSaveable'));
      return;
   }
   if (!deps.isDrawerOpen) deps.setDrawerOpen(true);
}

interface UseBoardItemSaveBackArgs {
   /** The current copy content (its `sourceDrawerItemId` and inner `data`). */
   content: BoardItemSaveContent;
   /** Adopts the minted drawer id onto the copy's source link via a direct (non-undoable) write. */
   onAdoptSource: (sourceDrawerItemId: string) => void;
}

export function useBoardItemSaveBack({ content, onAdoptSource }: UseBoardItemSaveBackArgs) {
   const { t } = useTranslation();
   const drawerCurrentFolderId = useDrawerStore((state) => state.currentFolderId);
   const isDrawerOpen = useAppGeneralStateStore((state) => state.isDrawerOpen);
   const { setDrawerOpen } = useAppGeneralStateActions();

   const deps: BoardItemSaveDeps = { t, drawerCurrentFolderId, isDrawerOpen, setDrawerOpen, onAdoptSource };

   const saveItemAs = useCallback(() => {
      runSaveItemToDrawerAs(content, deps);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` is a fresh object each render; its members are the real deps.
   }, [content, drawerCurrentFolderId, isDrawerOpen, onAdoptSource, setDrawerOpen, t]);

   const saveItem = useCallback(async () => {
      await runSaveItemToDrawer(content, deps);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` is a fresh object each render; its members are the real deps.
   }, [content, drawerCurrentFolderId, isDrawerOpen, onAdoptSource, setDrawerOpen, t]);

   return { saveItem, saveItemAs };
}
