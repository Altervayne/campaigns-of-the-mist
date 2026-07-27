// -- React Imports --
import { useCallback, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';
import cuid from 'cuid';

// -- Utils Imports --
import { screenToWorld } from '@/lib/board/boardCoordinates';
import { zoneContaining } from '@/lib/board/zoneMembership';
import { nextScopeZ } from '@/lib/board/boardTree';
import { EMBEDDED_TRACKER_SIZES, EMBEDDED_CARD_SIZE, embeddedSpecForDrawerItem } from '@/lib/board/embedDrawerItem';
import { getItem } from '@/lib/drawer/drawerRepository';
import { emptyTracker, type TrackerType } from '@/lib/trackers/emptyTracker';
import { buildCard } from '@/lib/cards/buildCard';
import { CREATABLE_BY_KIND, type CreatableKind } from '@/lib/creation/creatableRegistry';
import { makePortalContent, portalTargetFromInsert } from '@/lib/creation/portalContent';
import { PORTAL_MIN_SIZE } from '@/lib/board/portalSizing';
import { runSaveImageToDrawerAs, runSaveItemToDrawer, runSaveItemToDrawerAs } from '@/hooks/board/useBoardItemSaveBack';
import { BOARD_WINDOW_MARGIN } from '@/components/organisms/board/windows/BoardFloatingWindow';
import { isTextEditableKind } from '@/components/organisms/board/boardCanvasConstants';

// -- Store Imports --
import { useAppGeneralStateStore, useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';
import { useDrawerStore } from '@/lib/stores/drawerStore';

// -- Type Imports --
import type { BoardState, BoardStore } from '@/lib/stores/boardStore';
import type { BoardItem, BoardItemContent, PortalStyle, PortalTarget, Viewport } from '@/lib/types/board';
import type { Point } from '@/lib/board/boardConnections';
import type { GameSystem } from '@/lib/types/drawer';
import type { ChallengeGame } from '@/lib/types/common';
import type { CreateCardOptions } from '@/lib/types/creation';
import type { LinkInsertTarget } from '@/lib/portals/buildLinkToken';

interface UseBoardCreationArgs {
   store: BoardStore;
   actions: BoardState['actions'];
   items: BoardState['items'];
   zoneItems: BoardItem[];
   selectedIds: Set<string>;
   viewCenter: Point;
   currentViewCenter: () => Point;
   clipRef: RefObject<HTMLDivElement | null>;
   viewportRef: RefObject<Viewport>;
   setEditingId: (id: string | null) => void;
}

/*
 * Item creation + the portal flow + save-back to the drawer, plus the three creation-UI window states
 * (`pendingCard`, `portalPicker`, `portalEditor`) the parent renders their windows from. The create handlers
 * are plain closures over the live `items`/`zoneItems` (rebuilt each render, like the Add menu / radial that
 * call them); the portal Edit/Relink handlers and `commitPortalStyle` stay memoized so they never break the
 * item-box memoization. The camera pieces (`viewCenter`, `currentViewCenter`, `clipRef`, `viewportRef`) come
 * from the viewport hook and `setEditingId` from the selection hook, so a fresh text kind opens into editing.
 */
export function useBoardCreation({
   store,
   actions,
   items,
   zoneItems,
   selectedIds,
   viewCenter,
   currentViewCenter,
   clipRef,
   viewportRef,
   setEditingId,
}: UseBoardCreationArgs) {
   const { t } = useTranslation();
   const { setDrawerOpen } = useAppGeneralStateActions();

   // A pending board card creation: the chosen game, the world point to drop at, and the screen point
   // the creation window opens at (near the toolbar when menu-triggered, the cursor from the radial).
   // Null when closed.
   const [pendingCard, setPendingCard] = useState<{ game: GameSystem; world: Point; screen: { x: number; y: number } } | null>(null);

   // The target picker: anchored at `screen`. On CREATE it drops a new portal at `world`; on RETARGET
   // (`retargetItemId` set, opened from the editor) it swaps that portal's target and keeps its style. Null
   // when closed. A portal picks its target FIRST, then drops styled.
   const [portalPicker, setPortalPicker] = useState<{ world: Point; screen: { x: number; y: number }; retargetItemId?: string } | null>(null);

   // The open portal restyle editor: the item being edited + the screen point its window opens at (the Edit
   // click). Null when closed. The window itself is a `BoardFloatingWindow` rendered below.
   const [portalEditor, setPortalEditor] = useState<{ itemId: string; screen: { x: number; y: number } } | null>(null);

   /** Opens the portal restyle editor for `itemId`, anchored at the Edit click. Stable so it never breaks
    *  the item box memoization (every box would otherwise re-render on each pan). */
   const handleRequestEditPortal = useCallback((itemId: string, screen: { x: number; y: number }) => {
      setPortalEditor({ itemId, screen });
   }, []);

   /** Relinks a dead portal: reopens the shared picker in retarget mode (swaps the target, keeps the style).
    *  `world` is unused on a retarget; stable for the same box-memoization reason as the Edit handler. */
   const handleRequestRelinkPortal = useCallback((itemId: string, screen: { x: number; y: number }) => {
      setPortalPicker({ world: { x: 0, y: 0 }, screen, retargetItemId: itemId });
   }, []);

   /**
    * Creates a new item of `kind` centered on `worldCenter`, joining a zone it lands in, then selects it.
    * A text kind opens straight into editing so it's typeable on creation. `contentOverride` lets a
    * picker-first kind (a portal) supply its already-targeted content instead of the registry's empty
    * factory; everything else about the placement/z/zone/select path is identical.
    */
   const createItemAt = (kind: CreatableKind, worldCenter: Point, contentOverride?: BoardItemContent) => {
      const size = CREATABLE_BY_KIND[kind].defaultSize;
      const id = cuid();
      const placement = { id, x: worldCenter.x - size.width / 2, y: worldCenter.y - size.height / 2, width: size.width, height: size.height };
      // A non-zone item created over a zone joins it (same center-in-rectangle rule as a drop).
      const zoneId = kind === 'zone' ? undefined : zoneContaining(placement, zoneItems) ?? undefined;
      const z = nextScopeZ(items, zoneId ?? null);
      void actions.addItem({ ...placement, kind, z, zoneId, content: contentOverride ?? CREATABLE_BY_KIND[kind].makeContent() });
      actions.setSelection([id]);
      if (isTextEditableKind(kind)) setEditingId(id);
   };

   /** Drops a portal (target picked in the list) at `worldCenter` with the smart-default icon+text style. */
   const createPortalAt = (target: PortalTarget, defaultName: string, worldCenter: Point) => {
      createItemAt('portal', worldCenter, makePortalContent(target, defaultName));
   };

   /** The portal picker's pick handler: classifies the row to a portal target, then drops (create) or swaps
    *  the target of an existing portal (retarget, keeping its style + label), then closes. */
   const handlePortalPick = (target: LinkInsertTarget, defaultName: string) => {
      if (!portalPicker) return;
      const portalTarget = portalTargetFromInsert(target);
      if (!portalTarget) return; // a section row (note-only) is never offered here.
      if (portalPicker.retargetItemId) {
         const existing = store.getState().items[portalPicker.retargetItemId];
         if (existing && existing.content.kind === 'portal') {
            void actions.updateItemContent(existing.id, { ...existing.content, target: portalTarget });
         }
      } else {
         createPortalAt(portalTarget, defaultName, portalPicker.world);
      }
      setPortalPicker(null);
   };

   /** Opens the portal target picker for a menu/palette create (no cursor point): drop at the view center, window near the top-left. */
   const openPortalPickerAtViewCenter = () => {
      const rect = clipRef.current?.getBoundingClientRect();
      if (!rect) { setPortalPicker({ world: viewCenter, screen: { x: 0, y: 0 } }); return; }
      const world = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2, { left: rect.left, top: rect.top }, viewportRef.current);
      setPortalPicker({ world, screen: { x: rect.left + BOARD_WINDOW_MARGIN, y: rect.top + BOARD_WINDOW_MARGIN } });
   };

   /**
    * Commits a portal STYLE edit as one undoable command, reading the item LIVE at commit time and patching
    * only its style - so a deferred label flush can't clobber a target/visual change made meanwhile (and vice
    * versa). No-op if the item is gone or is no longer a portal.
    */
   const commitPortalStyle = useCallback(
      (itemId: string, updater: (style: PortalStyle) => PortalStyle) => {
         const live = store.getState().items[itemId];
         if (!live || live.content.kind !== 'portal') return;
         const content = { ...live.content, style: updater(live.content.style) };
         // A poster wears the crop shape: reshape the box to the aspect (keep width, derive height) in the
         // SAME undoable write so the full image shows and undo reverts box + visual together. Composed keeps
         // its box (it holds the label); the thumbnail alone takes the aspect.
         const visual = content.style.visual;
         if (visual?.kind === 'image' && visual.mode === 'poster') {
            const width = Math.max(PORTAL_MIN_SIZE.width, live.width);
            const height = Math.max(PORTAL_MIN_SIZE.height, Math.round(width / visual.aspect));
            void actions.updateItemContentAndSize(itemId, content, { width, height });
            return;
         }
         void actions.updateItemContent(itemId, content);
      },
      [store, actions],
   );

   /**
    * Creates a fresh, game-agnostic tracker at `worldCenter`: a board-native COPY (no drawer source),
    * sized to the tracker's native footprint, then selects it. It renders through the interactive
    * embed host (a NEUTRAL synthetic character), so it's app-themed and editable with no extra wiring.
    */
   const createTrackerAt = (trackerType: TrackerType, worldCenter: Point) => {
      const size = EMBEDDED_TRACKER_SIZES[trackerType];
      const id = cuid();
      const placement = { id, x: worldCenter.x - size.width / 2, y: worldCenter.y - size.height / 2, width: size.width, height: size.height };
      const zoneId = zoneContaining(placement, zoneItems) ?? undefined;
      const z = nextScopeZ(items, zoneId ?? null);
      void actions.addItem({ ...placement, kind: 'tracker', z, zoneId, content: { kind: 'tracker', mode: 'copy', data: emptyTracker(trackerType) } });
      actions.setSelection([id]);
   };

   /**
    * Creates a card from the dialog's options at `worldCenter`: a board-native COPY (no drawer source)
    * of the chosen game, sized to the card's native footprint, then selects it. The embed host seeds
    * the synthetic character with the card's own game, so it themes by that game (not NEUTRAL).
    */
   const createCardAt = (game: GameSystem, options: CreateCardOptions, worldCenter: Point) => {
      const card = buildCard(game, options);
      if (!card) return;
      const { width, height } = EMBEDDED_CARD_SIZE;
      const id = cuid();
      const placement = { id, x: worldCenter.x - width / 2, y: worldCenter.y - height / 2, width, height };
      const zoneId = zoneContaining(placement, zoneItems) ?? undefined;
      const z = nextScopeZ(items, zoneId ?? null);
      void actions.addItem({ ...placement, kind: 'card', z, zoneId, content: { kind: 'card', mode: 'copy', data: card } });
      actions.setSelection([id]);
   };

   /**
    * Mints a fresh Challenge Card at `worldCenter`: a board-native COPY (no drawer source, no creation
    * form - a challenge has none of the theme wizardry), selected AND dropped straight into its Expanded
    * display mode so a GM goes from "wants a threat" to typing its name with no extra click. Expanded is
    * a persisted card field, so the item keeps its stored portrait footprint for when it collapses back.
    */
   const createChallengeAt = (game: ChallengeGame, worldCenter: Point) => {
      const card = buildCard(game, { cardType: 'CHALLENGE_CARD', powerTagsCount: 0, weaknessTagsCount: 0 });
      if (!card) return;
      const { width, height } = EMBEDDED_CARD_SIZE;
      const id = cuid();
      const placement = { id, x: worldCenter.x - width / 2, y: worldCenter.y - height / 2, width, height };
      const zoneId = zoneContaining(placement, zoneItems) ?? undefined;
      const z = nextScopeZ(items, zoneId ?? null);
      void actions.addItem({ ...placement, kind: 'card', z, zoneId, content: { kind: 'card', mode: 'copy', data: { ...card, expanded: true } } });
      actions.setSelection([id]);
   };

   /**
    * Embeds a saved note at `worldCenter` as a live reference tile: loads the drawer NOTE item and builds
    * the SAME reference spec the drag-drop path uses ({@link embeddedSpecForDrawerItem}), then drops + selects
    * it. Async (a drawer read); a deleted source no-ops. Keyed on the note's drawer item id (from the picker).
    */
   const embedNoteAt = (drawerItemId: string, worldCenter: Point) => {
      void getItem(drawerItemId).then((item) => {
         if (!item) return;
         const spec = embeddedSpecForDrawerItem(item);
         if (!spec) return;
         const id = cuid();
         const placement = { id, x: worldCenter.x - spec.width / 2, y: worldCenter.y - spec.height / 2, width: spec.width, height: spec.height };
         const zoneId = zoneContaining(placement, zoneItems) ?? undefined;
         const z = nextScopeZ(items, zoneId ?? null);
         void actions.addItem({ ...placement, kind: spec.kind, z, zoneId, content: spec.content });
         actions.setSelection([id]);
      });
   };

   /*
    * Saves the sole-selected item to the drawer via the same orchestration the toolbar affordances run.
    * A copy card/tracker: `asNew` = Save As, else Save with a transparent Save-As fallback for a dangling
    * source. An image is Save-As only (mint an IMAGE_CARD, no source to write back to), so a Save request
    * on an image transparently mints too - mirroring a source-less card. The canvas owns the selection, so
    * the palette routes here rather than reaching into board state. No-op with an explanatory toast when
    * nothing usable is selected; the remaining kinds (pin/post-it/journal/character ref) have no drawer
    * save yet.
    */
   const saveSelectedItemToDrawer = (asNew: boolean) => {
      const id = selectedIds.size === 1 ? [...selectedIds][0] : null;
      const item = id ? items[id] : undefined;
      const content = item?.content;
      if (!content) {
         toast.error(t('Notifications.board.itemNotSaveable'));
         return;
      }

      const drawerState = useDrawerStore.getState();
      const baseDeps = {
         t,
         drawerCurrentFolderId: drawerState.currentFolderId,
         isDrawerOpen: useAppGeneralStateStore.getState().isDrawerOpen,
         setDrawerOpen,
      };

      // A board image is mint-only (no source, no adopt); Save and Save As both mint an IMAGE_CARD.
      if (content.kind === 'image') {
         runSaveImageToDrawerAs(content, baseDeps);
         return;
      }

      if ((content.kind !== 'card' && content.kind !== 'tracker' && content.kind !== 'post-it' && content.kind !== 'journal') || content.mode !== 'copy') {
         toast.error(t('Notifications.board.itemNotSaveable'));
         return;
      }
      const deps = {
         ...baseDeps,
         onAdoptSource: (sourceDrawerItemId: string) => { void actions.adoptItemDrawerSource(id!, sourceDrawerItemId); },
      };
      if (asNew) runSaveItemToDrawerAs(content, deps);
      else void runSaveItemToDrawer(content, deps);
   };

   /** Palette add: drop the new item centered in the current view (the radial uses the cursor point). */
   const handleAddItem = (kind: CreatableKind) => {
      createItemAt(kind, currentViewCenter());
   };

   /**
    * The "Add Game Element" menu's card row: open the card creation window for `game`. The drop still
    * lands at the view center on confirm, but the window opens near the toolbar (upper-left) rather than
    * mid-canvas - the menu isn't cursor-placed, so a mid-canvas panel would cover the drop point.
    */
   const handlePickCardGame = (game: GameSystem) => {
      const el = clipRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const world = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2, { left: rect.left, top: rect.top }, viewportRef.current);
      const screen = { x: rect.left + 12, y: rect.top + 56 }; // just below the top-left toolbar
      setPendingCard({ game, world, screen });
   };

   return {
      pendingCard,
      setPendingCard,
      portalPicker,
      setPortalPicker,
      portalEditor,
      setPortalEditor,
      createItemAt,
      createPortalAt,
      createTrackerAt,
      createCardAt,
      createChallengeAt,
      embedNoteAt,
      handleAddItem,
      handlePickCardGame,
      handleRequestEditPortal,
      handleRequestRelinkPortal,
      handlePortalPick,
      openPortalPickerAtViewCenter,
      commitPortalStyle,
      saveSelectedItemToDrawer,
   };
}
