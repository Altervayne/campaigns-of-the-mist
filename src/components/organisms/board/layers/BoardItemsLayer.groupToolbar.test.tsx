// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

// -- Component Imports --
import { BoardItemsLayer } from './BoardItemsLayer';

// -- Utils Imports --
import { TOOLBAR_EDGE_CLEARANCE, TOOLBAR_TOP_CLEARANCE } from '@/lib/board/boardCoordinates';

// -- Type Imports --
import type { BoardState } from '@/lib/stores/boardStore';
import type { Viewport } from '@/lib/types/board';

/*
 * Locks the multi-selection group toolbar's host-level contracts.
 *
 * Its anchor spans the whole selection bounding box at the top z-index band, so it must stay inert or it
 * swallows every press inside the box - which makes dragging the selection by an item body impossible and
 * leaves the bar's own grip as the only way to move it. The bar re-arms pointer events on itself.
 *
 * The bar is also clamped off the top edge like the per-item one. The group bbox already carries the live
 * move delta, so the clamp must read it raw: adding a delta here counts it twice and the bar drifts mid-drag.
 *
 * Sideways it is clamped inside the clip's left/right edges, where the sidebar / drawer / navigator begin -
 * the clip is overflow-hidden, so an unclamped bar is CUT OFF there rather than drawn over the panel. This
 * bar is LEFT-aligned to the bbox (the per-item one is centred), so it clips at a different point than the
 * item bar at the same anchor, and it is measured rather than assumed: its width is not a constant.
 */

// Echo the i18n key instead of standing up a provider - only labels are read here.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// jsdom has no ResizeObserver and reports every layout metric as 0, so the bar could never measure itself.
// Fire the callback on observe (as the real one does) and report a fixed bar width off its left-aligned
// anchor, which is what the group bar's own geometry gives.
const BAR_WIDTH = 200;
class ResizeObserverStub {
   callback: () => void;
   constructor(callback: () => void) { this.callback = callback; }
   observe() { this.callback(); }
   unobserve() {}
   disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => BAR_WIDTH });
Object.defineProperty(HTMLElement.prototype, 'offsetLeft', { configurable: true, get: () => 0 });

afterEach(cleanup);

const MOVE_LABEL = 'BoardView.moveItem';

/** A clip wide enough that only a deliberately placed bbox reaches an edge. */
const CLIP_WIDTH = 1000;
/** A clip tall enough the off-bottom clamp never engages, so these tests pin the top/side behavior. */
const CLIP_HEIGHT = 100000;

/** The layer with nothing but a multi-selection: no items to paint, so only the group toolbar renders. */
function renderLayer(overrides: {
   viewport: Viewport;
   groupBbox: { x: number; y: number; width: number; height: number };
   clipWidth?: number;
   clipHeight?: number;
   moveDeltaFor?: (id: string) => { x: number; y: number } | null;
   handleMoveStart?: (id: string) => void;
   handleDuplicateSelection?: () => Promise<void>;
   handleDeleteSelection?: () => void;
}) {
   return render(
      <BoardItemsLayer
         viewport={overrides.viewport}
         clipWidth={overrides.clipWidth ?? CLIP_WIDTH}
         clipHeight={overrides.clipHeight ?? CLIP_HEIGHT}
         items={{}}
         nonZoneItems={[]}
         zoneItems={[]}
         connectionItems={[]}
         collapsedZoneIds={new Set()}
         selectedIds={new Set(['a', 'b'])}
         soleSelectedId={null}
         editingId={null}
         layerRank={new Map()}
         layerCount={2}
         moveDeltaFor={overrides.moveDeltaFor ?? (() => null)}
         interacting={false}
         groupBbox={overrides.groupBbox}
         groupDrag={null}
         snapGuides={[]}
         snapBadges={[]}
         resizeSnapTargetsFor={() => []}
         onResizeSnapGuides={() => {}}
         connectPreview={null}
         penPreview={null}
         polygonPreview={null}
         transform={null}
         strokeStyleToolbar={null}
         onPreviewStrokeStyle={() => {}}
         onCommitStrokeStyle={() => {}}
         onFlipStrokes={() => {}}
         penSettings={{ brush: 'pen', color: null, width: 2, shapeBase: 'circle', shapeFilled: false }}
         activeTool="select"
         focusLayer={undefined}
         hoveredItem={undefined}
         actions={{ selectItem: () => {} } as unknown as BoardState['actions']}
         handleItemPointerDown={() => {}}
         handleItemDoubleClick={() => {}}
         handleMoveStart={overrides.handleMoveStart ?? (() => {})}
         handleDelete={() => {}}
         handleConnectStart={() => {}}
         handleRequestEditPortal={() => {}}
         handleRequestRelinkPortal={() => {}}
         handleDuplicateSelection={overrides.handleDuplicateSelection ?? (async () => {})}
         handleDeleteSelection={overrides.handleDeleteSelection ?? (() => {})}
         alignableCount={2}
         onAlign={() => {}}
         onDistribute={() => {}}
      />,
   );
}

/** The bar's grip, plus the two hosts above it: the bar's own root and the bbox-spanning anchor. */
function groupToolbarParts(getByLabelText: (label: string) => HTMLElement) {
   const grip = getByLabelText(MOVE_LABEL);
   const barRoot = grip.parentElement!.parentElement!.parentElement!;
   return { grip, barRoot, anchor: barRoot.parentElement! };
}

describe('group toolbar anchor', () => {
   it('is inert, so a press inside the selection box reaches the item under it', () => {
      const { getByLabelText } = renderLayer({ viewport: { x: 0, y: 0, zoom: 1 }, groupBbox: { x: 0, y: 200, width: 400, height: 300 } });
      const { anchor } = groupToolbarParts(getByLabelText);

      expect(anchor.className).toContain('pointer-events-none');
      // The anchor really is the bbox-spanning box, not some inner wrapper that happens to be inert.
      expect(anchor.style.width).toBe('400px');
      expect(anchor.style.height).toBe('300px');
   });

   it('re-arms pointer events on the bar itself, so its controls stay reachable', () => {
      const { getByLabelText } = renderLayer({ viewport: { x: 0, y: 0, zoom: 1 }, groupBbox: { x: 0, y: 200, width: 400, height: 300 } });
      const { barRoot } = groupToolbarParts(getByLabelText);

      expect(barRoot.className).toContain('pointer-events-auto');
   });

   it('still wires the grip, duplicate, and delete controls', () => {
      const handleMoveStart = vi.fn();
      const handleDuplicateSelection = vi.fn(async () => {});
      const handleDeleteSelection = vi.fn();
      const { getByLabelText } = renderLayer({
         viewport: { x: 0, y: 0, zoom: 1 },
         groupBbox: { x: 0, y: 200, width: 400, height: 300 },
         handleMoveStart,
         handleDuplicateSelection,
         handleDeleteSelection,
      });

      fireEvent.pointerDown(getByLabelText(MOVE_LABEL));
      fireEvent.click(getByLabelText('BoardView.duplicateSelection'));
      fireEvent.click(getByLabelText('BoardView.deleteSelection'));

      expect(handleMoveStart).toHaveBeenCalledWith('a', expect.anything());
      expect(handleDuplicateSelection).toHaveBeenCalledTimes(1);
      expect(handleDeleteSelection).toHaveBeenCalledTimes(1);
   });
});

describe('group toolbar off-top clamp', () => {
   it('anchors at the box top while the selection sits below the clearance line', () => {
      const { getByLabelText } = renderLayer({ viewport: { x: 0, y: 0, zoom: 1 }, groupBbox: { x: 0, y: 200, width: 400, height: 300 } });
      const { barRoot } = groupToolbarParts(getByLabelText);

      expect(barRoot.style.bottom).toBe('100%');
   });

   it('lowers the bar by the world-px overshoot when the selection runs off the top', () => {
      const { getByLabelText } = renderLayer({ viewport: { x: 0, y: 0, zoom: 2 }, groupBbox: { x: 0, y: -100, width: 400, height: 300 } });
      const { barRoot } = groupToolbarParts(getByLabelText);

      // Top at world -100, zoom 2 -> screen -200; overshoot (48 + 200) screen px = 124 world px.
      expect(barRoot.style.bottom).toBe(`calc(100% - ${(TOOLBAR_TOP_CLEARANCE + 200) / 2}px)`);
   });

   it('reads the bbox raw, so a live move delta is not counted twice', () => {
      const { getByLabelText } = renderLayer({
         viewport: { x: 0, y: 0, zoom: 1 },
         // The bbox the selection hook hands down already has the drag folded in.
         groupBbox: { x: 0, y: -20, width: 400, height: 300 },
         moveDeltaFor: () => ({ x: 0, y: -80 }),
      });
      const { barRoot } = groupToolbarParts(getByLabelText);

      expect(barRoot.style.bottom).toBe(`calc(100% - ${TOOLBAR_TOP_CLEARANCE + 20}px)`);
   });
});

describe('group toolbar off-edge clamp', () => {
   it('leaves the bar left-aligned on the bbox while it sits clear of both edges', () => {
      const { getByLabelText } = renderLayer({ viewport: { x: 0, y: 0, zoom: 1 }, groupBbox: { x: 100, y: 200, width: 400, height: 300 } });
      const { barRoot } = groupToolbarParts(getByLabelText);

      expect(barRoot.style.transform).toBe('scale(1)');
   });

   it('slides the bar right when it runs off the clip left edge', () => {
      const { getByLabelText } = renderLayer({ viewport: { x: 0, y: 0, zoom: 1 }, groupBbox: { x: -50, y: 200, width: 400, height: 300 } });
      const { barRoot } = groupToolbarParts(getByLabelText);

      expect(barRoot.style.transform).toBe(`translateX(${TOOLBAR_EDGE_CLEARANCE + 50}px) scale(1)`);
   });

   it('slides the bar left when it runs off the clip right edge', () => {
      // Left-aligned at screen 880, so the 200px bar ends at 1080 - past the 1000px clip.
      const { getByLabelText } = renderLayer({ viewport: { x: 0, y: 0, zoom: 1 }, groupBbox: { x: 880, y: 200, width: 400, height: 300 } });
      const { barRoot } = groupToolbarParts(getByLabelText);

      expect(barRoot.style.transform).toBe(`translateX(-${80 + TOOLBAR_EDGE_CLEARANCE}px) scale(1)`);
   });

   it('measures the bar in screen px but shifts it in world px', () => {
      // Bbox at world -50, zoom 2 -> screen -100. The bar stays 200 SCREEN px (it counter-scales), so the
      // overshoot is 108 screen px = 54 world px. Treating the measured width as world units drifts here.
      const { getByLabelText } = renderLayer({ viewport: { x: 0, y: 0, zoom: 2 }, groupBbox: { x: -50, y: 200, width: 400, height: 300 } });
      const { barRoot } = groupToolbarParts(getByLabelText);

      expect(barRoot.style.transform).toBe(`translateX(${(TOOLBAR_EDGE_CLEARANCE + 100) / 2}px) scale(0.5)`);
   });

   it('reads the bbox raw sideways too, so a live move delta is not counted twice', () => {
      const { getByLabelText } = renderLayer({
         viewport: { x: 0, y: 0, zoom: 1 },
         // The bbox the selection hook hands down already has the drag folded in.
         groupBbox: { x: -20, y: 200, width: 400, height: 300 },
         moveDeltaFor: () => ({ x: -80, y: 0 }),
      });
      const { barRoot } = groupToolbarParts(getByLabelText);

      expect(barRoot.style.transform).toBe(`translateX(${TOOLBAR_EDGE_CLEARANCE + 20}px) scale(1)`);
   });
});
