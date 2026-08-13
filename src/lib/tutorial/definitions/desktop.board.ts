// -- Icon Imports --
import { LayoutDashboard } from 'lucide-react';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';
import { getActiveBoardStore } from '@/lib/board/boardStoreRegistry';

// -- Local Imports --
import { createDemoBoard } from '../demo/demoBoard';

// -- Type Imports --
import type { TutorialDefinition } from '../tutorialTypes';

/**
 * D3 - The Board. A hands-on tour of the freeform canvas: what it is, panning and zooming, the two
 * work modes, then three real actions on a throwaway demo board - drop an element, draw a stroke, open
 * the Layers panel - with the drawing tools, connections, and the dice tray taught around them. The
 * board has no edit mode and its tool lives in component state, so every mode switch is DRIVEN through
 * the `{type:'board'}` bridge (the same one the command palette uses); there is no store signal to gate
 * a tool change on, so the gates land on the RESULTS - an item added, a stroke committed, the panel
 * opened - which all read fresh off the active demo board store. Each `onArrive` idempotently
 * re-establishes its step's tool/panel so back-navigation restores it (the D2 persist pattern). The
 * full-canvas working beats run `scrim:'none'` + `anchor-only` so the board stays lit and live under the
 * user's hands; the bottom-bar and panel beats keep the dim, and the add-menu / dice-tray beats drop it
 * because their surfaces sit under the tutorial scrim. `needsDemo:'board'` seeds the isolated board.
 */

// The demo board's item + stroke baselines, derived from the fixture itself so a fixture change can
// never leave a gate pre-satisfied (an item already present) or unreachable. The item count feeds the
// drop gate; the drawing stroke total feeds the draw gate - counted as STROKES, not drawing items,
// because the fixture ships one shape as a drawing item, so an "any drawing exists" check is already true.
const demoBoardFixture = createDemoBoard();
const DEMO_ITEM_BASELINE = demoBoardFixture.items.length;
const DEMO_STROKE_BASELINE = demoBoardFixture.items.reduce(
   (total, item) => total + (item.content.kind === 'drawing' ? item.content.strokes.length : 0),
   0,
);

/** Item count on the active (demo) board, read fresh for a gate. Zero before the board mounts. */
function boardItemCount(): number {
   const items = getActiveBoardStore()?.getState().items;
   return items ? Object.keys(items).length : 0;
}

/** Total committed strokes across every drawing item on the active (demo) board, read fresh for a gate. */
function boardStrokeCount(): number {
   const items = getActiveBoardStore()?.getState().items;
   if (!items) return 0;
   return Object.values(items).reduce(
      (total, item) => total + (item.content.kind === 'drawing' ? item.content.strokes.length : 0),
      0,
   );
}

export const DESKTOP_BOARD_TUTORIAL: TutorialDefinition = {
   id: 'desktop.board',
   platform: 'desktop',
   system: 'board',
   titleKey: 'TutorialsDialog.tutorials.board.title',
   teachKey: 'TutorialsDialog.tutorials.board.teach',
   icon: LayoutDashboard,
   needsDemo: 'board',
   steps: [
      {
         id: 'welcome',
         titleKey: 'Tutorial.board.welcome_title',
         bodyKey: 'Tutorial.board.welcome_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         // A read-only look at the whole canvas: full-surface anchor, so the card floats centered and
         // the dim rings the board's edges. Blocked - nothing to touch yet.
         id: 'canvas',
         anchorKey: 'board-canvas',
         titleKey: 'Tutorial.board.canvas_title',
         bodyKey: 'Tutorial.board.canvas_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         // Move / select / marquee / edit on the lit, live canvas. Drive the select tool so items are
         // movable and back-nav restores it; the fixture's items sit in the framed opening view, ready
         // to grab. `scrim:'none'` + `anchor-only`, then click Next. Placed before pan/zoom so the
         // "try it" pan can't scroll those items out of reach first.
         id: 'handle-items',
         onArrive: { type: 'board', action: 'setTool:select' },
         anchorKey: 'board-canvas',
         titleKey: 'Tutorial.board.handleItems_title',
         bodyKey: 'Tutorial.board.handleItems_body',
         placement: 'center',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Shift-drag snapping, on the lit canvas. Drive select so a move actually snaps and back-nav
         // restores it. The guides are transient mid-drag with no store signal, so it narrates then clicks
         // Next; no gesture cue, since that is a touch affordance and this is a mouse + Shift interaction.
         id: 'align-snap',
         onArrive: { type: 'board', action: 'setTool:select' },
         anchorKey: 'board-canvas',
         titleKey: 'Tutorial.board.alignSnap_title',
         bodyKey: 'Tutorial.board.alignSnap_body',
         placement: 'center',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Pan/zoom invitation: the canvas is the anchor and the whole surface, so it runs lit
         // (`scrim:'none'`) + `anchor-only` and the user can drag/scroll it freely, then click Next.
         id: 'pan-zoom',
         anchorKey: 'board-canvas',
         titleKey: 'Tutorial.board.panZoom_title',
         bodyKey: 'Tutorial.board.panZoom_body',
         placement: 'center',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         id: 'toolbar',
         anchorKey: 'board-toolbar',
         titleKey: 'Tutorial.board.toolbar_title',
         bodyKey: 'Tutorial.board.toolbar_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         // The Add menu lives in Elements mode, so ensure the select tool is active for this and the
         // gate that follows (back-nav from Drawing re-establishes it).
         id: 'modes',
         onArrive: { type: 'board', action: 'setTool:select' },
         anchorKey: 'board-mode-segment',
         titleKey: 'Tutorial.board.modes_title',
         bodyKey: 'Tutorial.board.modes_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         id: 'add-menu',
         onArrive: { type: 'board', action: 'setTool:select' },
         anchorKey: 'board-add-menu',
         titleKey: 'Tutorial.board.addMenu_title',
         bodyKey: 'Tutorial.board.addMenu_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         // Gate: the user opens Add and drops a one-click element (a Post-it or a Pin drops immediately;
         // a Card or Portal opens a second dialog and would not fire this count gate). The drop lands at
         // the view center, which the fixture keeps clear. The Add button sits in the bottom-center bar, so
         // its menu flips upward and left-aligns to the button; the coach sits to the LEFT to clear that
         // column. No dim - the menu would otherwise vanish under the scrim.
         id: 'drop-element',
         onArrive: { type: 'board', action: 'setTool:select' },
         anchorKey: 'board-add-menu',
         titleKey: 'Tutorial.board.dropElement_title',
         bodyKey: 'Tutorial.board.dropElement_body',
         placement: 'left',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => boardItemCount() > DEMO_ITEM_BASELINE },
         },
      },
      {
         // The right-click radial is a transient quick-add that opens at the cursor and closes on select,
         // so there is no element to ring and no store signal to gate on. Narrate it over the lit, live
         // canvas (the pan/zoom pattern) and invite a try, then Next. Stay in Elements mode for back-nav.
         id: 'radial-menu',
         onArrive: { type: 'board', action: 'setTool:select' },
         anchorKey: 'board-canvas',
         titleKey: 'Tutorial.board.radialMenu_title',
         bodyKey: 'Tutorial.board.radialMenu_body',
         placement: 'center',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Drive into the freehand pen so the drawing settings bar mounts and its anchor resolves.
         id: 'draw-tools',
         onArrive: { type: 'board', action: 'setTool:pen' },
         anchorKey: 'board-draw-tools',
         titleKey: 'Tutorial.board.drawTools_title',
         bodyKey: 'Tutorial.board.drawTools_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         // Gate: the user draws a stroke on the lit canvas. Drive the pen first so a press-drag commits a
         // stroke; the fixture's one shape sets the baseline, so counting STROKES (not drawing items) keeps
         // the gate honest. `scrim:'none'` + `anchor-only` so the whole board stays live under the pointer.
         id: 'draw-stroke',
         onArrive: { type: 'board', action: 'setTool:pen' },
         anchorKey: 'board-canvas',
         titleKey: 'Tutorial.board.drawStroke_title',
         bodyKey: 'Tutorial.board.drawStroke_body',
         placement: 'center',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => boardStrokeCount() > DEMO_STROKE_BASELINE },
         },
      },
      {
         // Shapes are an invitation, not a gate: drive the shape tool, keep the canvas lit so the user can
         // drag one out if they like, then click Next. The settings bar (with the shape controls) is anchored.
         id: 'shapes',
         onArrive: { type: 'board', action: 'setTool:shape' },
         anchorKey: 'board-draw-tools',
         titleKey: 'Tutorial.board.shapes_title',
         bodyKey: 'Tutorial.board.shapes_body',
         placement: 'top',
         interaction: 'anchor-only',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         // Back to Elements: drive the select tool so the mode segment reads Elements and the add cluster
         // returns. Dim - the segment sits in the normal bottom bar.
         id: 'back-to-elements',
         onArrive: { type: 'board', action: 'setTool:select' },
         anchorKey: 'board-mode-segment',
         titleKey: 'Tutorial.board.backToElements_title',
         bodyKey: 'Tutorial.board.backToElements_body',
         placement: 'top',
         advance: { on: 'next-click' },
      },
      {
         // Gate: the user opens the Layers panel. The toggle sits in the bottom bar, so the dim cutout
         // reveals it in the hole (like D1's drawer toggle). Read the settings flag fresh.
         id: 'layers-toggle',
         onArrive: { type: 'setLayersPanel', open: false },
         anchorKey: 'board-layers-toggle',
         titleKey: 'Tutorial.board.layersToggle_title',
         bodyKey: 'Tutorial.board.layersToggle_body',
         placement: 'top',
         interaction: 'anchor-only',
         advance: {
            on: 'user-action',
            signal: { kind: 'store', predicate: () => useAppSettingsStore.getState().layersPanelOpen },
         },
      },
      {
         // Read the panel: ensure it is open on arrive (back-nav re-opens it), close it on the way forward
         // so the next canvas beat is unobstructed. The panel is a real rect on the right edge - dim is fine.
         id: 'layers-panel',
         onArrive: { type: 'setLayersPanel', open: true },
         onForward: { type: 'setLayersPanel', open: false },
         anchorKey: 'board-layers-panel',
         titleKey: 'Tutorial.board.layersPanel_title',
         bodyKey: 'Tutorial.board.layersPanel_body',
         placement: 'left',
         advance: { on: 'next-click' },
      },
      {
         // Connections are narrated, not gated: the connect handle is a transient hover affordance that
         // cannot be spotlighted, so this teaches against the fixture's pre-made link. `frameConnections`
         // re-frames the viewport on the linked cards (so an earlier pan/zoom can't leave them off-screen)
         // and restores select mode. Full-canvas anchor, dim - a read beat.
         id: 'connections',
         onArrive: { type: 'board', action: 'frameConnections' },
         anchorKey: 'board-canvas',
         titleKey: 'Tutorial.board.connections_title',
         bodyKey: 'Tutorial.board.connections_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
      {
         // The dice tray as a live example (D1 already gates opening it): self-open on arrive, close on
         // leave whichever way the step is left. No dim - the z-50 tray sits under the scrim.
         id: 'dice',
         onArrive: { type: 'setDiceTray', open: true },
         onLeave: { type: 'setDiceTray', open: false },
         anchorKey: 'dice-tray-panel',
         titleKey: 'Tutorial.board.dice_title',
         bodyKey: 'Tutorial.board.dice_body',
         placement: 'top',
         scrim: 'none',
         advance: { on: 'next-click' },
      },
      {
         id: 'wrap',
         titleKey: 'Tutorial.board.wrap_title',
         bodyKey: 'Tutorial.board.wrap_body',
         placement: 'center',
         advance: { on: 'next-click' },
      },
   ],
};
