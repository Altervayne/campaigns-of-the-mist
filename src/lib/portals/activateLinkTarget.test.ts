// -- Library Imports --
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The shared activation glues four services together; each is mocked so the trail wiring can be exercised
// without a real tab manager, drawer, or DOM. `runLinkAction` + `resolveLinkAction` stay REAL (they are pure).
vi.mock('@/lib/portals/openEntityTab', () => ({ openEntityTab: vi.fn() }));
vi.mock('@/lib/portals/revealDrawerItem', () => ({ revealDrawerItem: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/board/spawnBesideItem', () => ({ spawnDrawerItemBeside: vi.fn() }));
vi.mock('@/lib/character/tabManagerStore', () => ({ getActiveTabJourneyEntry: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

import toast from 'react-hot-toast';
import { activateLinkTarget } from './activateLinkTarget';
import { openEntityTab } from './openEntityTab';
import { revealDrawerItem } from './revealDrawerItem';
import { spawnDrawerItemBeside } from '@/lib/board/spawnBesideItem';
import { getActiveTabJourneyEntry } from '@/lib/character/tabManagerStore';

// -- Type Imports --
import type { LinkTarget } from './linkTarget';
import type { JourneyEntry } from '@/lib/character/journey';

/*
 * Tests for the headless activation core - the seam a board portal AND a Navigator jump both ride, so their
 * trail is provably one trail. The correctness lives in the trail ordering (`from` captured before the async
 * open) and the edge policy (an entity nav pushes; a self-edge, a dead target, and a non-entity push nothing).
 */

const openTab = vi.mocked(openEntityTab);
const reveal = vi.mocked(revealDrawerItem);
const spawnBeside = vi.mocked(spawnDrawerItemBeside);
const activeEntry = vi.mocked(getActiveTabJourneyEntry);
const toastError = vi.mocked(toast.error);

const pushJourney = vi.fn();
/** A minimal tab-actions bag: only `pushJourney` is read here (the rest reach the mocked services). */
const actions = { pushJourney } as unknown as Parameters<typeof activateLinkTarget>[1]['actions'];

const from: JourneyEntry = { tabKind: 'board', entityId: 'board-origin', name: 'Origin Board' };

/** A per-test unique origin id keeps the module reentrancy guard from carrying state between cases. */
let originSeq = 0;
const nextOrigin = () => `origin-${++originSeq}`;

beforeEach(() => {
   vi.clearAllMocks();
   activeEntry.mockReturnValue(from);
   // Default: the open succeeds and fires its navigated callback (the trail-push path).
   openTab.mockImplementation((_entity, _id, deps) => { deps.onNavigated?.(); return Promise.resolve(); });
});

describe('activateLinkTarget - entity nav + trail', () => {
   it('opens the entity tab and pushes the from->to edge, naming the crumb from toName', () => {
      const target: LinkTarget = { kind: 'entity', entity: 'note', id: 'note-dest' };
      activateLinkTarget(target, { host: { kind: 'tab' }, actions, t: (k) => k, originItemId: nextOrigin(), toName: 'Dest Note' });

      expect(openTab).toHaveBeenCalledTimes(1);
      expect(openTab).toHaveBeenCalledWith('note', 'note-dest', expect.objectContaining({ actions }), undefined);
      expect(pushJourney).toHaveBeenCalledTimes(1);
      expect(pushJourney).toHaveBeenCalledWith(from, { tabKind: 'note', entityId: 'note-dest', name: 'Dest Note' });
   });

   it('builds the SAME edge from a board-embed host as from a tab host (one shared trail)', () => {
      const target: LinkTarget = { kind: 'entity', entity: 'character', id: 'char-9' };
      activateLinkTarget(target, { host: { kind: 'tab' }, actions, t: (k) => k, originItemId: nextOrigin(), toName: 'Hero' });
      const fromTab = pushJourney.mock.calls[0];

      pushJourney.mockClear();
      activateLinkTarget(target, { host: { kind: 'board-embed', boardId: 'b1', itemId: nextOrigin() }, actions, t: (k) => k, toName: 'Hero' });
      const fromBoard = pushJourney.mock.calls[0];

      expect(fromBoard).toEqual(fromTab);
   });

   it('skips the push on a self-edge (jumping to the tab you are already on) but still opens it', () => {
      activeEntry.mockReturnValue({ tabKind: 'board', entityId: 'same', name: 'Same' });
      const target: LinkTarget = { kind: 'entity', entity: 'board', id: 'same' };
      activateLinkTarget(target, { host: { kind: 'tab' }, actions, t: (k) => k, originItemId: nextOrigin() });

      expect(openTab).toHaveBeenCalledTimes(1);
      expect(pushJourney).not.toHaveBeenCalled();
   });

   it('skips the push at the menu (no active tab / no from)', () => {
      activeEntry.mockReturnValue(null);
      const target: LinkTarget = { kind: 'entity', entity: 'note', id: 'note-x' };
      activateLinkTarget(target, { host: { kind: 'tab' }, actions, t: (k) => k, originItemId: nextOrigin(), toName: 'X' });

      expect(openTab).toHaveBeenCalledTimes(1);
      expect(pushJourney).not.toHaveBeenCalled();
   });

   it('toasts and pushes nothing on a dead target', () => {
      openTab.mockImplementation((_entity, _id, deps) => { deps.onMissing(); return Promise.resolve(); });
      const target: LinkTarget = { kind: 'entity', entity: 'note', id: 'gone' };
      activateLinkTarget(target, { host: { kind: 'tab' }, actions, t: (k) => k, originItemId: nextOrigin(), toName: 'Gone' });

      expect(toastError).toHaveBeenCalledTimes(1);
      expect(pushJourney).not.toHaveBeenCalled();
   });
});

describe('activateLinkTarget - element split by host', () => {
   it('reveals in the drawer from a tab host, never spawns, pushes no edge', () => {
      const target: LinkTarget = { kind: 'element', drawerItemId: 'el-1' };
      activateLinkTarget(target, { host: { kind: 'tab' }, actions, t: (k) => k, originItemId: nextOrigin() });

      expect(reveal).toHaveBeenCalledTimes(1);
      expect(reveal).toHaveBeenCalledWith('el-1', expect.anything());
      expect(spawnBeside).not.toHaveBeenCalled();
      expect(openTab).not.toHaveBeenCalled();
      expect(pushJourney).not.toHaveBeenCalled();
   });

   it('spawns beside the origin tile from a board-embed host, pushes no edge', () => {
      const itemId = nextOrigin();
      const target: LinkTarget = { kind: 'element', drawerItemId: 'el-2' };
      activateLinkTarget(target, { host: { kind: 'board-embed', boardId: 'b1', itemId }, actions, t: (k) => k, originItemId: itemId });

      expect(spawnBeside).toHaveBeenCalledTimes(1);
      expect(spawnBeside).toHaveBeenCalledWith('el-2', itemId, expect.any(Function));
      expect(reveal).not.toHaveBeenCalled();
      expect(pushJourney).not.toHaveBeenCalled();
   });
});

describe('activateLinkTarget - reentrancy guard', () => {
   it('collapses a double-fire on the same origin while the open is in flight into one open', () => {
      // The open never settles, so the guard stays held across the second call.
      openTab.mockImplementation(() => new Promise<void>(() => {}));
      const origin = nextOrigin();
      const target: LinkTarget = { kind: 'entity', entity: 'note', id: 'note-dup' };
      const ctx = { host: { kind: 'tab' as const }, actions, t: (k: string) => k, originItemId: origin, toName: 'Dup' };

      activateLinkTarget(target, ctx);
      activateLinkTarget(target, ctx);

      expect(openTab).toHaveBeenCalledTimes(1);
   });
});
