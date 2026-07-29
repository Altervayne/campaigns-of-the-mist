// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

// -- Component Imports --
import { BoardItemsLayer } from './BoardItemsLayer';

// -- Utils Imports --
import { TOOLBAR_TOP_CLEARANCE } from '@/lib/board/boardCoordinates';

// -- Type Imports --
import type { BoardState } from '@/lib/stores/boardStore';
import type { Viewport } from '@/lib/types/board';

/*
 * Locks the multi-selection group toolbar's two host-level contracts.
 *
 * Its anchor spans the whole selection bounding box at the top z-index band, so it must stay inert or it
 * swallows every press inside the box - which makes dragging the selection by an item body impossible and
 * leaves the bar's own grip as the only way to move it. The bar re-arms pointer events on itself.
 *
 * The bar is also clamped off the top edge like the per-item one. The group bbox already carries the live
 * move delta, so the clamp must read it raw: adding a delta here counts it twice and the bar drifts mid-drag.
 */

// Echo the i18n key instead of standing up a provider - only labels are read here.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(cleanup);

const MOVE_LABEL = 'BoardView.moveItem';

/** The layer with nothing but a multi-selection: no items to paint, so only the group toolbar renders. */
function renderLayer(overrides: {
   viewport: Viewport;
   groupBbox: { x: number; y: number; width: number; height: number };
   moveDeltaFor?: (id: string) => { x: number; y: number } | null;
   handleMoveStart?: (id: string) => void;
   handleDuplicateSelection?: () => Promise<void>;
   handleDeleteSelection?: () => void;
}) {
   return render(
      <BoardItemsLayer
         viewport={overrides.viewport}
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
         connectPreview={null}
         penPreview={null}
         polygonPreview={null}
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
