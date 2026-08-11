// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

// -- Component Imports --
import { BoardItemsLayer } from './BoardItemsLayer';

// -- Type Imports --
import type { BoardState } from '@/lib/stores/boardStore';
import type { BoardItem, Viewport } from '@/lib/types/board';

/*
 * Locks how the layer feeds the SOLE-selected item's toolbar its sideways clamp.
 *
 * Two things here are easy to get wrong by copying the group toolbar's call, and both are silent:
 *
 * The per-item bar is CENTRED over its box while the group bar is left-aligned, so the same anchor clips at
 * a different point for each. Passing the group's alignment leaves the item bar cut off at the left edge.
 *
 * `item.x` is the STORED left, so a live move has to be added or the bar lags the box mid-drag. The group
 * path is the mirror image: its bbox already carries the delta, so adding one there counts it twice.
 */

// Echo the i18n key instead of standing up a provider - only labels are read here.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// jsdom has no ResizeObserver and reports every layout metric as 0, so the bar could never measure itself.
// A 200px bar centred over a 200px box puts its anchor half the box in, which is what the browser resolves.
const BAR_WIDTH = 200;
const ANCHOR_OFFSET = 100;
class ResizeObserverStub {
   callback: () => void;
   constructor(callback: () => void) { this.callback = callback; }
   observe() { this.callback(); }
   unobserve() {}
   disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => BAR_WIDTH });
Object.defineProperty(HTMLElement.prototype, 'offsetLeft', { configurable: true, get: () => ANCHOR_OFFSET });

afterEach(cleanup);

const MOVE_LABEL = 'BoardView.moveItem';

/** Sits at the clip's left edge, so a centred bar overhangs it and a left-aligned one does not. */
const ITEM = { id: 'a', kind: 'postit', x: 0, y: 400, width: 200, height: 200, content: {}, zoneId: null, rotation: 0 } as unknown as BoardItem;

function renderLayer(overrides: { viewport?: Viewport; moveDeltaFor?: (id: string) => { x: number; y: number } | null }) {
   const result = render(
      <BoardItemsLayer
         viewport={overrides.viewport ?? { x: 0, y: 0, zoom: 1 }}
         clipWidth={1000}
         items={{ a: ITEM }}
         nonZoneItems={[ITEM]}
         zoneItems={[]}
         connectionItems={[]}
         collapsedZoneIds={new Set()}
         selectedIds={new Set(['a'])}
         soleSelectedId="a"
         editingId={null}
         layerRank={new Map([['a', 0]])}
         layerCount={1}
         moveDeltaFor={overrides.moveDeltaFor ?? (() => null)}
         interacting={false}
         groupBbox={null}
         groupDrag={null}
         snapGuides={[]}
         snapBadges={[]}
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
         handleMoveStart={() => {}}
         handleDelete={() => {}}
         handleConnectStart={() => {}}
         handleRequestEditPortal={() => {}}
         handleRequestRelinkPortal={() => {}}
         handleDuplicateSelection={async () => {}}
         handleDeleteSelection={() => {}}
      />,
   );
   // The grip, then the bar's own positioned root two wrappers up.
   const grip = result.getByLabelText(MOVE_LABEL);
   return grip.parentElement!.parentElement!.parentElement!;
}

describe('per-item toolbar clamp wiring', () => {
   it('clamps the bar as CENTRED, so a box at the left edge still shows its whole bar', () => {
      // Anchor 100, half-width 100 -> the bar starts at 0 and needs the edge clearance back.
      // Read as left-aligned it would start at 100, fit, and never clamp at all.
      expect(renderLayer({}).style.transform).toContain('8px');
   });

   it('folds the live move delta into the anchor, so the bar tracks the box mid-drag', () => {
      // Dragged 100 left: the anchor lands on the clip edge and the bar needs 108 back, not 8.
      const root = renderLayer({ moveDeltaFor: () => ({ x: -100, y: 0 }) });

      expect(root.style.transform).toContain('108px');
   });

   it('leaves a box with room to spare unclamped', () => {
      const root = renderLayer({ viewport: { x: 400, y: 0, zoom: 1 } });

      expect(root.style.transform).toContain('translateX(-50%)');
      expect(root.style.transform).not.toContain('px)');
   });
});
