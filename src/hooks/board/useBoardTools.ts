// -- React Imports --
import { useCallback, useRef, useState } from 'react';

// -- Store Imports --
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';

// -- Type Imports --
import type { ActiveTool } from '@/lib/types/board';

/*
 * The tool mode + drawing settings. Owns the active pointer tool, the sticky last-Draw gesture, the current
 * drawing layer strokes append to, the regular-polygon side count, and the persisted pen settings the toolbar
 * reads. `resetForBoard` clears the tool/layer half on a board switch; the parent orchestrates the drawing-state
 * half alongside it.
 */
export function useBoardTools() {
   // The active pointer TOOL and the current drawing LAYER strokes append to - both ephemeral (same
   // family as the selection), never persisted or routed through commands. `select` is the default
   // (click-through overlay); every other value is a Draw gesture that owns the pointer. Only freehand +
   // eraser are wired today. A first stroke with no active layer mints one.
   const [activeTool, setActiveTool] = useState<ActiveTool>('select');
   // The last Draw gesture chosen, so re-entering Draw from Select restores it (default freehand). Ephemeral.
   const lastDrawToolRef = useRef<Exclude<ActiveTool, 'select'>>('freehand');
   /** Enters a Draw gesture and remembers it, so leaving to Select and clicking Draw returns to that gesture. */
   const chooseDrawTool = useCallback((tool: Exclude<ActiveTool, 'select'>) => {
      lastDrawToolRef.current = tool;
      setActiveTool(tool);
   }, []);
   const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
   // The regular polygon's side count, read at press time by its center-out drag. Ephemeral tool setting.
   const [polygonSides, setPolygonSides] = useState(5);
   // The pen/highlighter settings (brush, ink, per-brush widths), persisted in app settings. Every new
   // stroke and the live preview read the CURRENT values, so the pickers actually drive the ink.
   const penSettings = useAppSettingsStore((state) => state.penSettings);
   const { setPenBrush, setPenColor, setPenWidth, setShapeBase, setShapeFilled } = useAppSettingsActions();

   /** Resets the tool/layer half on a board switch: back to Select with no active layer, so neither leaks
    *  across boards (the canvas stays mounted, a new `store` prop, no remount). */
   const resetForBoard = useCallback(() => {
      setActiveTool('select');
      setActiveLayerId(null);
   }, []);

   return {
      activeTool,
      setActiveTool,
      lastDrawToolRef,
      chooseDrawTool,
      activeLayerId,
      setActiveLayerId,
      polygonSides,
      setPolygonSides,
      penSettings,
      setPenBrush,
      setPenColor,
      setPenWidth,
      setShapeBase,
      setShapeFilled,
      resetForBoard,
   };
}
