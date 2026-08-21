// -- React Imports --
import { useCallback, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Copy, Trash2 } from 'lucide-react';

// -- Utils Imports --
import { GAME_VISUALS, GAME_CARD_OPTIONS, CHALLENGE_GAME_OPTIONS } from '@/lib/constants/gameVisuals';
import { getItemTypeIconComponent } from '@/lib/utils/drawer-icons';
import { CREATABLE_BY_KIND, type CreatableKind } from '@/lib/creation/creatableRegistry';
import { CREATION_TAXONOMY } from '@/lib/creation/creationTaxonomy';
import { isEditableTarget } from '@/lib/utils/textEntry';

// -- Component Imports --
import type { RadialNode } from '@/components/organisms/board/BoardRadialMenu';

// -- Type Imports --
import type { BoardState, BoardStore } from '@/lib/stores/boardStore';
import type { Point } from '@/lib/board/boardConnections';
import type { ChallengeGame } from '@/lib/types/common';
import type { GameSystem } from '@/lib/types/drawer';
import type { TrackerType } from '@/lib/trackers/emptyTracker';

interface UseBoardRadialArgs {
   store: BoardStore;
   actions: BoardState['actions'];
   cursorToWorld: (clientX: number, clientY: number) => Point | null;
   selectedIds: Set<string>;
   createItemAt: (kind: CreatableKind, worldCenter: Point) => void;
   createTrackerAt: (trackerType: TrackerType, worldCenter: Point) => void;
   createChallengeAt: (game: ChallengeGame, worldCenter: Point) => void;
   setPendingCard: Dispatch<SetStateAction<{ game: GameSystem; world: Point; screen: { x: number; y: number } } | null>>;
   setPortalPicker: Dispatch<SetStateAction<{ world: Point; screen: { x: number; y: number }; retargetItemId?: string } | null>>;
   handleDuplicateSelection: () => Promise<void>;
   handleDeleteSelection: () => void;
}

/*
 * The right-click radial menu: the open state (cursor screen point + drop world point), the `contextmenu`
 * opener, and the node tree built from the same creation taxonomy the Add popover reads. It dispatches into
 * the creation + selection handlers injected from their hooks; `suppressRadialRef` (owned here, consumed by
 * the parent's right-drag capture handler) keeps a pan or a polygon-closing right-click from also opening it.
 */
export function useBoardRadial({
   store,
   actions,
   cursorToWorld,
   selectedIds,
   createItemAt,
   createTrackerAt,
   createChallengeAt,
   setPendingCard,
   setPortalPicker,
   handleDuplicateSelection,
   handleDeleteSelection,
}: UseBoardRadialArgs) {
   const { t } = useTranslation();

   // A right-click that just finished a polygon must not also open the radial; set on the finishing
   // pointerdown, consumed by the matching context-menu.
   const suppressRadialRef = useRef(false);

   // The open right-click radial menu: the cursor's screen point (positions the ring) + its world
   // point (where a create action drops the new item). Null when closed.
   const [radial, setRadial] = useState<{ screen: { x: number; y: number }; world: Point } | null>(null);

   /** Opens the radial at a screen point (create-at-cursor + selection actions). A right-click on an
    *  unselected item selects it first so the actions target it; an empty press keeps the current selection. */
   const openRadial = useCallback((itemId: string | null, clientX: number, clientY: number) => {
      if (itemId && !store.getState().selectedIds.has(itemId)) actions.setSelection([itemId]);
      const world = cursorToWorld(clientX, clientY);
      if (!world) return;
      setRadial({ screen: { x: clientX, y: clientY }, world });
   }, [store, actions, cursorToWorld]);

   /**
    * Opens the radial from the native context-menu event - reliable on every real right-click, every
    * platform (the right-button pointerup is NOT, around a context menu). Over a text field it does nothing
    * (native edit menu stays); right-clicking an unselected item selects it first. A right-drag pan sets
    * `suppressRadialRef` (consumed here) so a drag never opens the menu.
    */
   const handleContextMenu = (event: ReactMouseEvent) => {
      // A modal dialog (the stencil picker, a confirm) covers the board, but its right-clicks bubble here
      // through the portal via React's event tree - opening the radial UNDER the modal, which then traps it.
      // Bail so the dialog keeps its own native context behavior and no menu opens beneath it.
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      // A right-drag pan (or a right-click that just finished a freeform polygon) already decided the menu
      // should stay closed; consume the flag and swallow the event so nothing reopens.
      if (suppressRadialRef.current) { suppressRadialRef.current = false; event.preventDefault(); event.stopPropagation(); return; }
      // Over a live text editor: leave the native edit menu (copy/paste) intact.
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      const itemId = event.target instanceof Element ? event.target.closest('[data-board-item-id]')?.getAttribute('data-board-item-id') ?? null : null;
      openRadial(itemId, event.clientX, event.clientY);
   };

   // The radial's node tree: the three creation groups (Basic / Rich / Game) as flat root branches,
   // each opening straight to its leaves, plus duplicate + delete leaves at the root when something is
   // selected. Built only while the menu is open, from the same taxonomy the Add popover reads.
   const radialRoot: RadialNode[] = radial
      ? [
           ...CREATION_TAXONOMY.map((group): RadialNode => {
              const GroupIcon = group.icon;
              if (group.key === 'game') {
                 return {
                    id: `group-${group.key}`,
                    icon: <GroupIcon className="h-5 w-5" />,
                    label: t(group.labelKey),
                    children: group.rows.map((row): RadialNode => {
                       const RowIcon = row.icon;
                       if (row.kind === 'trackers') {
                          return {
                             id: 'trackers',
                             icon: <RowIcon className="h-5 w-5" />,
                             label: t(row.labelKey),
                             children: row.rows.map(({ id, trackerType, itemType, labelKey }) => {
                                const Icon = getItemTypeIconComponent(itemType);
                                return { id, icon: <Icon className="h-5 w-5" />, label: t(labelKey), onSelect: () => createTrackerAt(trackerType, radial.world) };
                             }),
                          };
                       }
                       if (row.kind === 'cards') {
                          return {
                             id: 'cards',
                             icon: <RowIcon className="h-5 w-5" />,
                             label: t(row.labelKey),
                             children: GAME_CARD_OPTIONS.map(({ game }) => {
                                const { Icon } = GAME_VISUALS[game];
                                // Open the creation popover for that game; the drop happens on confirm.
                                return { id: `card-${game}`, icon: <Icon className="h-5 w-5" />, label: t(`Drawer.Types.${game}`), onSelect: () => setPendingCard({ game, world: radial.world, screen: radial.screen }) };
                             }),
                          };
                       }
                       // A challenge picks its game (each variant drops immediately, no theme wizardry).
                       return {
                          id: 'challenge',
                          icon: <RowIcon className="h-5 w-5" />,
                          label: t(row.labelKey),
                          children: CHALLENGE_GAME_OPTIONS.map((game) => {
                             const { Icon } = GAME_VISUALS[game];
                             return { id: `challenge-${game}`, icon: <Icon className="h-5 w-5" />, label: t(`Drawer.Types.${game}`), onSelect: () => createChallengeAt(game, radial.world) };
                          }),
                       };
                    }),
                 };
              }
              return {
                 id: `group-${group.key}`,
                 icon: <GroupIcon className="h-5 w-5" />,
                 label: t(group.labelKey),
                 children: group.kinds.map((kind) => {
                    const { icon: Icon, labelKey, requiresPicker } = CREATABLE_BY_KIND[kind];
                    return {
                       id: kind,
                       icon: <Icon className="h-5 w-5" />,
                       label: t(`BoardView.${labelKey}`),
                       // A picker-first kind (a portal) opens its target picker before it drops.
                       onSelect: () => (requiresPicker ? setPortalPicker({ world: radial.world, screen: radial.screen }) : createItemAt(kind, radial.world)),
                    };
                 }),
              };
           }),
           ...(selectedIds.size > 0
              ? [
                   { id: 'duplicate', icon: <Copy className="h-5 w-5" />, label: t('BoardView.duplicateSelection'), onSelect: () => void handleDuplicateSelection() },
                   { id: 'delete', icon: <Trash2 className="h-5 w-5" />, label: t('BoardView.deleteSelection'), destructive: true, onSelect: handleDeleteSelection },
                ]
              : []),
        ]
      : [];

   return {
      radial,
      setRadial,
      suppressRadialRef,
      radialRoot,
      handleContextMenu,
   };
}
