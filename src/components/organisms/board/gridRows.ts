// -- Icon Imports --
import { Columns3, Grid3x3, Grip, Hexagon, Rows3, Square, type LucideIcon } from 'lucide-react';

// -- Type Imports --
import type { BoardGridType } from '@/lib/types/board';

/** The grid styles in menu order, each with its trigger/row icon and i18n label key. Shared by every grid picker. */
export const GRID_ROWS: { type: BoardGridType; icon: LucideIcon; labelKey: string }[] = [
   { type: 'none', icon: Square, labelKey: 'gridNone' },
   { type: 'dots', icon: Grip, labelKey: 'gridDots' },
   { type: 'lines', icon: Grid3x3, labelKey: 'gridCrosshatch' },
   { type: 'h-lines', icon: Rows3, labelKey: 'gridHorizontalLines' },
   { type: 'v-lines', icon: Columns3, labelKey: 'gridVerticalLines' },
   { type: 'hex', icon: Hexagon, labelKey: 'gridHex' },
];
