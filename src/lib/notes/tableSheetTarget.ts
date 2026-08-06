/*
 * The mobile table sheet's caret-follow logic, kept PURE so it can be unit-tested without CM6. After a
 * structural op the sheet advances its logical target so consecutive taps walk the same cell (never refocusing
 * a DOM cell, which would re-raise the keyboard). Delete ops clamp into the post-op dimensions.
 */

/** A cell target: `row` is a body-row index, or -1 for the header row. */
export interface TableTarget {
   row: number;
   col: number;
}

/** The table's dimensions used to clamp a target after a delete. */
export interface TableDims {
   bodyRows: number;
   cols: number;
}

/** The structural ops that move the target (align does not move the caret; deleteTable closes the sheet). */
export type TableTargetOp =
   | 'insertRowAbove'
   | 'insertRowBelow'
   | 'insertColumnLeft'
   | 'insertColumnRight'
   | 'moveRowUp'
   | 'moveRowDown'
   | 'moveColumnLeft'
   | 'moveColumnRight'
   | 'deleteRow'
   | 'deleteColumn';

/**
 * The target cell after `op`. `dims` is the table's dimensions AFTER the op (used only by the deletes to clamp
 * a target that fell off the end). Move ops assume the caller gated them at the edges, so they don't clamp.
 */
export function advanceTarget(op: TableTargetOp, target: TableTarget, dims: TableDims | null): TableTarget {
   const { row, col } = target;
   switch (op) {
      // The moved cell keeps the caret: it now sits one step over.
      case 'moveRowUp':
         return { row: row - 1, col };
      case 'moveRowDown':
         return { row: row + 1, col };
      case 'moveColumnLeft':
         return { row, col: col - 1 };
      case 'moveColumnRight':
         return { row, col: col + 1 };
      // An insert above/left pushes the original cell down/right by one; below/right leaves it in place.
      case 'insertRowAbove':
         return { row: row >= 0 ? row + 1 : row, col };
      case 'insertColumnLeft':
         return { row, col: col + 1 };
      case 'insertRowBelow':
      case 'insertColumnRight':
         return { row, col };
      // A delete can drop the last row/column; clamp the target into the shrunk table.
      case 'deleteRow':
         return { row: dims ? Math.min(row, dims.bodyRows - 1) : row, col };
      case 'deleteColumn':
         return { row, col: dims ? Math.min(col, dims.cols - 1) : col };
   }
}
