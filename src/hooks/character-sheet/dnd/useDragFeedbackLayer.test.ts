// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

// -- Utils Imports --
import { SPRING_HOLD_MS } from '@/lib/utils/dragFeedback';

// -- Type Imports --
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';

/*
 * Pins the timing half of the drag-feedback layer: the spring dwell, the post-navigation grace, the
 * change-gated mirror of the resolved drop target into state, and - the load-bearing one - the fact that
 * `handleDragEnd` reads the RESOLVED TARGET REF, snapshotted before the teardown clears it.
 *
 * Two failure modes are invisible in a diff and cannot be produced in a preview. Moving the snapshot
 * below `clearDragFeedback()` makes every resolver-routed drop no-op; reading the mirrored STATE instead
 * of the ref makes a fast drop land in the folder the cursor was over one commit ago. Both are asserted
 * through the routed destination, which is the only place they are observable.
 */

const mocks = vi.hoisted(() => ({
   character: null as Record<string, unknown> | null,
   currentFolderId: null as string | null,
   currentFolderView: null as { items: { id: string }[] } | null,
   generalState: { isDrawerExpanded: false, isDrawerReceded: false },
   drawerActions: {
      initiateItemDrop: vi.fn(),
      moveFolder: vi.fn(),
      reorderFolders: vi.fn(),
      moveItem: vi.fn(),
      reorderItems: vi.fn(),
      setDrawerCurrentFolderId: vi.fn(),
   },
   characterActions: {
      reorderSheetLayout: vi.fn(), reorderStatuses: vi.fn(), reorderStoryTags: vi.fn(), reorderStoryThemes: vi.fn(),
      addImportedCard: vi.fn(), addImportedTracker: vi.fn(), addImportedJournal: vi.fn(),
   },
   tabActions: {
      openCharacterTab: vi.fn(), openBoardTab: vi.fn(), openNoteTab: vi.fn(), reorderTabs: vi.fn(), setActiveTab: vi.fn(),
   },
   settingsActions: { setContextualGame: vi.fn() },
   generalActions: { setDrawerOpen: vi.fn(), setDrawerReceded: vi.fn(), contractDrawer: vi.fn() },
   morph: {
      captureGrab: vi.fn(), setCursor: vi.fn(), setMorph: vi.fn(), setIdentity: vi.fn(),
      reset: vi.fn(), renderClone: vi.fn(), renderCluster: vi.fn(),
   },
}));

vi.mock('@/lib/stores/characterStore', () => ({
   useCharacterStore: Object.assign(
      (selector: (state: { character: unknown }) => unknown) => selector({ character: mocks.character }),
      { getState: () => ({ character: mocks.character }) },
   ),
   useCharacterActions: () => mocks.characterActions,
}));
vi.mock('@/lib/stores/drawerStore', () => ({
   useDrawerStore: Object.assign(
      (selector: (state: { currentFolderView: unknown }) => unknown) => selector({ currentFolderView: mocks.currentFolderView }),
      { getState: () => ({ currentFolderId: mocks.currentFolderId, currentFolderView: mocks.currentFolderView }) },
   ),
   useDrawerActions: () => mocks.drawerActions,
}));
vi.mock('@/lib/character/tabManagerStore', () => ({
   useTabManagerActions: () => mocks.tabActions,
   useTabManagerStore: { getState: () => ({ openTabs: [], activeTabId: null }) },
}));
vi.mock('@/lib/stores/appSettingsStore', () => ({ useAppSettingsActions: () => mocks.settingsActions }));
vi.mock('@/lib/stores/appGeneralStateStore', () => ({
   useAppGeneralStateActions: () => mocks.generalActions,
   useAppGeneralStateStore: { getState: () => mocks.generalState },
}));
vi.mock('@/lib/board/boardStoreRegistry', () => ({ getActiveBoardStore: () => null, getOrCreateBoardInstance: () => null }));
vi.mock('@/lib/character/characterStoreRegistry', () => ({ getOrCreateInstance: () => ({ getState: () => ({ character: null }) }) }));
vi.mock('@/lib/notes/noteStoreRegistry', () => ({ getOrCreateNoteInstance: () => ({ getState: () => ({ noteId: null, note: null }) }) }));
vi.mock('@/lib/board/boardRepository', () => ({ importBoard: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/notes/noteRepository', () => ({ importNote: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/board/refreezeNoteReferences', () => ({ stampNoteReferencesDrawerSource: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/drawer/drawerFolderTree', () => ({
   getChildFolders: () => [],
   getParentFolderId: () => null,
   whenFolderTreeSettled: () => Promise.resolve(),
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/molecules/drag-morph/useDragMorph', () => ({ useDragMorph: () => mocks.morph }));
vi.mock('@/hooks/character-sheet/buildDragIdentity', () => ({ buildDragIdentity: () => null }));

import { useCharacterSheetDnD } from '../useCharacterSheetDnD';

type Data = Record<string, unknown>;

/** An element the live-geometry resolvers can hit-test, with its rect stubbed (jsdom measures nothing). */
function mountRect(attribute: string, box: { left: number; top: number; right: number; bottom: number }): void {
   const el = document.createElement('div');
   const [name, value] = attribute.split('=');
   el.setAttribute(name, value ?? '');
   el.getBoundingClientRect = () => ({
      ...box, width: box.right - box.left, height: box.bottom - box.top, x: box.left, y: box.top, toJSON: () => ({}),
   }) as DOMRect;
   document.body.appendChild(el);
}

const startEvent = (id: string, data: Data) =>
   ({ active: { id, data: { current: data }, rect: { current: { initial: null } } }, activatorEvent: null }) as unknown as DragStartEvent;
const endEvent = (id: string, data: Data) =>
   ({ active: { id, data: { current: data } }, over: null }) as unknown as DragEndEvent;
const pointerMove = (x: number, y: number) => new MouseEvent('pointermove', { clientX: x, clientY: y });

const drawerItem = (id: string) => ({ id, type: 'CHARACTER_CARD', game: 'LEGENDS', content: {} });
const itemDrag = (id: string) => ({ type: 'drawer-item', isDrawer: true, item: drawerItem(id) });

/** The drawer panel plus two adjacent folder rows and an items body, laid out so a cursor y picks the target. */
function mountDrawer(): void {
   mountRect('data-drawer-panel', { left: 0, top: 0, right: 300, bottom: 900 });
   mountRect('data-folder-id=f2', { left: 10, top: 100, right: 290, bottom: 140 });
   mountRect('data-folder-id=f3', { left: 10, top: 141, right: 290, bottom: 180 });
   mountRect('data-drawer-items-area', { left: 0, top: 400, right: 300, bottom: 880 });
}

function mountDnD() {
   let renders = 0;
   const view = renderHook(() => { renders += 1; return useCharacterSheetDnD(); });
   return {
      view,
      renders: () => renders,
      start: (id: string, data: Data) => act(() => { view.result.current.handleDragStart(startEvent(id, data)); }),
      move: (x: number, y: number) => act(() => { window.dispatchEvent(pointerMove(x, y)); }),
      end: (id: string, data: Data) => act(() => { view.result.current.handleDragEnd(endEvent(id, data)); }),
      cancel: () => act(() => { view.result.current.handleDragCancel(); }),
      hold: (ms: number) => act(() => { vi.advanceTimersByTime(ms); }),
   };
}

beforeEach(() => {
   vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
   vi.clearAllMocks();
   mocks.character = null;
   mocks.currentFolderId = null;
   mocks.currentFolderView = null;
   mocks.generalState = { isDrawerExpanded: false, isDrawerReceded: false };
   mountDrawer();
});
afterEach(() => {
   cleanup();
   document.body.innerHTML = '';
   vi.useRealTimers();
});

describe('spring navigation dwell', () => {
   it('drills into a folder row held for the full dwell', () => {
      const dnd = mountDnD();

      dnd.start('i1', itemDrag('i1'));
      dnd.move(150, 120);
      dnd.hold(SPRING_HOLD_MS);

      expect(mocks.drawerActions.setDrawerCurrentFolderId).toHaveBeenCalledWith('f2');
   });

   it('does not drill when the row is released before the dwell completes', () => {
      const dnd = mountDnD();

      dnd.start('i1', itemDrag('i1'));
      dnd.move(150, 120);
      dnd.hold(SPRING_HOLD_MS - 100);
      dnd.end('i1', itemDrag('i1'));
      dnd.hold(SPRING_HOLD_MS);

      expect(mocks.drawerActions.setDrawerCurrentFolderId).not.toHaveBeenCalled();
   });
});

/*
 * The in-flight guard. A spring nav is async, so the guard blocks a re-fire until the navigation settles -
 * but it must release on the navigation's own promise (a nav that never clears it kills spring-nav for the
 * rest of the drag), and the tab branch must sit ahead of it (a tab switch is synchronous and unrelated to
 * the drawer view, so a folder nav in flight must not swallow it).
 */
describe('in-flight navigation guard', () => {
   it('drills a second time once the first navigation settles', async () => {
      const dnd = mountDnD();

      dnd.start('i1', itemDrag('i1'));
      dnd.move(150, 120);
      dnd.hold(SPRING_HOLD_MS);
      // The guard releases on the navigation's promise, not on the next move.
      await act(async () => {});
      mocks.currentFolderId = 'f2';

      dnd.move(150, 160);
      dnd.hold(SPRING_HOLD_MS);

      expect(mocks.drawerActions.setDrawerCurrentFolderId).toHaveBeenNthCalledWith(1, 'f2');
      expect(mocks.drawerActions.setDrawerCurrentFolderId).toHaveBeenNthCalledWith(2, 'f3');
   });

   it('switches tabs on a dwell while a folder navigation is still in flight', () => {
      mountRect('data-tab-id=t2', { left: 400, top: 20, right: 600, bottom: 60 });
      const dnd = mountDnD();

      dnd.start('i1', itemDrag('i1'));
      dnd.move(150, 120);
      dnd.hold(SPRING_HOLD_MS);
      // No microtask flush: the folder navigation is still unsettled when the tab dwell completes.
      dnd.move(500, 40);
      dnd.hold(SPRING_HOLD_MS);

      expect(mocks.tabActions.setActiveTab).toHaveBeenCalledWith('t2');
   });
});

/*
 * The post-navigation grace. After a drill-in the view reflows under a stationary cursor, so a row that
 * slid into place must not become the drop target; the target is forced to the folder just navigated to
 * until the cursor genuinely leaves the anchor. Both halves are read through the routed destination.
 */
describe('post-navigation grace', () => {
   // Dwells the lower edge of the first row, so the SECOND row sits a few pixels away - the reflow the
   // grace exists for. Inside the radius the drop must still resolve to the folder just navigated to.
   const navigateInto = (dnd: ReturnType<typeof mountDnD>) => {
      dnd.start('i1', itemDrag('i1'));
      dnd.move(150, 138);
      dnd.hold(SPRING_HOLD_MS);
      mocks.currentFolderId = 'f2';
      mocks.currentFolderView = { items: [] };
   };

   it('forces the current folder while the cursor sits within the grace radius', () => {
      const dnd = mountDnD();

      navigateInto(dnd);
      dnd.move(150, 150);
      dnd.end('i1', itemDrag('i1'));

      expect(mocks.drawerActions.moveItem).toHaveBeenCalledWith('i1', 'f2');
   });

   it('honors a folder row again once the cursor leaves the grace radius', () => {
      const dnd = mountDnD();

      navigateInto(dnd);
      dnd.move(150, 170);
      dnd.end('i1', itemDrag('i1'));

      expect(mocks.drawerActions.moveItem).toHaveBeenCalledWith('i1', 'f3');
   });
});

describe('drop-target mirror', () => {
   it('commits one state update for a run of moves within the same row', () => {
      const dnd = mountDnD();

      dnd.start('i1', itemDrag('i1'));
      dnd.move(150, 110);
      const settled = dnd.renders();
      for (let step = 0; step < 20; step += 1) dnd.move(150 + step, 111 + (step % 20));

      expect(dnd.renders()).toBe(settled);
      expect(dnd.view.result.current.drawerDropTarget).toEqual({ kind: 'folder', id: 'f2' });
   });

   it('stays null for a sheet drag, whose drop target rides dnd-kit rather than the resolver', () => {
      mocks.character = { id: 'cA', game: 'LEGENDS', cards: [], journals: [], trackers: { statuses: [], storyTags: [], storyThemes: [] } };
      const dnd = mountDnD();

      dnd.start('sc1', { type: 'sheet-card' });
      dnd.move(150, 120);

      expect(dnd.view.result.current.drawerDropTarget).toBeNull();
   });
});

describe('drop-time reads', () => {
   it('routes to the resolved folder and leaves the layer torn down afterwards', () => {
      const dnd = mountDnD();

      dnd.start('i1', itemDrag('i1'));
      dnd.move(150, 120);
      dnd.end('i1', itemDrag('i1'));
      dnd.end('i1', itemDrag('i1'));

      expect(mocks.drawerActions.moveItem).toHaveBeenCalledTimes(1);
      expect(mocks.drawerActions.moveItem).toHaveBeenCalledWith('i1', 'f2');
      expect(dnd.view.result.current.drawerDropTarget).toBeNull();
   });

   it('routes to the row under the cursor at release, not the one the mirrored state still holds', () => {
      const dnd = mountDnD();

      dnd.start('i1', itemDrag('i1'));
      dnd.move(150, 120);
      // One commit behind: the move onto the second row and the release land in the same batch, so the
      // mirrored state still reads the first row while the ref already reads the second.
      act(() => {
         window.dispatchEvent(pointerMove(150, 160));
         dnd.view.result.current.handleDragEnd(endEvent('i1', itemDrag('i1')));
      });

      expect(mocks.drawerActions.moveItem).toHaveBeenCalledWith('i1', 'f3');
   });
});

describe('drag cancel', () => {
   it('aborts both dwell timers and restores a receded drawer', () => {
      mocks.generalState = { isDrawerExpanded: true, isDrawerReceded: true };
      mountRect('data-reexpand-drawer', { left: 0, top: 940, right: 300, bottom: 980 });
      const dnd = mountDnD();

      dnd.start('i1', itemDrag('i1'));
      dnd.move(150, 120);
      dnd.move(150, 960);
      dnd.cancel();
      dnd.hold(SPRING_HOLD_MS * 2);

      expect(mocks.drawerActions.setDrawerCurrentFolderId).not.toHaveBeenCalled();
      expect(mocks.generalActions.setDrawerReceded).toHaveBeenCalledTimes(1);
      expect(mocks.generalActions.setDrawerReceded).toHaveBeenCalledWith(false);
   });
});
