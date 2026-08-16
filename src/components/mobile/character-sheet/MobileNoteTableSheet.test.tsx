// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { MobileNoteTableSheet } from './MobileNoteTableSheet';
import type { TableActions, TableContextRequest } from '@/components/organisms/note/live/tableWidget';

/*
 * The sheet re-resolves its action bag against a walking target: after an op it advances the target and asks
 * `resolveFor` for the new cell (never refocusing DOM, which would re-raise the keyboard). Edge-disabled moves,
 * and Done / delete-table close it. The request is mocked - the CM6 focus/keyboard side is device-verified.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

/** A spy action bag; the `canMove*` flags are computed from the resolved (row, col) so edges disable realistically. */
function bagFor(spies: Record<string, ReturnType<typeof vi.fn>>, row: number, col: number, bodyRows: number, cols: number): TableActions {
   return {
      insertRowAbove: spies.insertRowAbove,
      insertRowBelow: spies.insertRowBelow,
      insertColumnLeft: spies.insertColumnLeft,
      insertColumnRight: spies.insertColumnRight,
      moveRowUp: spies.moveRowUp,
      moveRowDown: spies.moveRowDown,
      moveColumnLeft: spies.moveColumnLeft,
      moveColumnRight: spies.moveColumnRight,
      deleteRow: spies.deleteRow,
      deleteColumn: spies.deleteColumn,
      alignColumn: spies.alignColumn,
      deleteTable: spies.deleteTable,
      canDeleteRow: row >= 0 && bodyRows > 1,
      canDeleteColumn: cols > 1,
      canMoveRowUp: row >= 1,
      canMoveRowDown: row >= 0 && row < bodyRows - 1,
      canMoveColumnLeft: col >= 1,
      canMoveColumnRight: col < cols - 1,
   };
}

function makeRequest(row: number, col: number) {
   const spies = Object.fromEntries(
      ['insertRowAbove', 'insertRowBelow', 'insertColumnLeft', 'insertColumnRight', 'moveRowUp', 'moveRowDown', 'moveColumnLeft', 'moveColumnRight', 'deleteRow', 'deleteColumn', 'alignColumn', 'deleteTable'].map(
         (k) => [k, vi.fn()],
      ),
   ) as Record<string, ReturnType<typeof vi.fn>>;
   const resolveFor = vi.fn((r: number, c: number) => bagFor(spies, r, c, 3, 3));
   const request: TableContextRequest = {
      x: 0,
      y: 0,
      row,
      col,
      tablePos: 0,
      actions: bagFor(spies, row, col, 3, 3),
      resolveFor,
      getDims: () => ({ bodyRows: 3, cols: 3 }),
   };
   return { request, spies, resolveFor };
}

afterEach(cleanup);

describe('MobileNoteTableSheet', () => {
   it('runs an op and walks the target to the next cell', () => {
      const { request, spies, resolveFor } = makeRequest(1, 1);
      render(<MobileNoteTableSheet request={request} onClose={() => {}} />);

      fireEvent.click(document.querySelector('[aria-label="NoteView.tableSheet.moveRowUp"]')!);

      expect(spies.moveRowUp).toHaveBeenCalledTimes(1);
      // The target advanced to the row above, so the bag re-resolved for (0, 1).
      expect(resolveFor).toHaveBeenLastCalledWith(0, 1);
   });

   it('disables moves at the edges (stable layout, greyed)', () => {
      const { request } = makeRequest(0, 0);
      render(<MobileNoteTableSheet request={request} onClose={() => {}} />);

      expect(document.querySelector('[aria-label="NoteView.tableSheet.moveRowUp"]')).toHaveProperty('disabled', true);
      expect(document.querySelector('[aria-label="NoteView.tableSheet.moveColumnLeft"]')).toHaveProperty('disabled', true);
      expect(document.querySelector('[aria-label="NoteView.tableSheet.moveRowDown"]')).toHaveProperty('disabled', false);
   });

   it('closes on Done and on delete table', () => {
      const onClose = vi.fn();
      const { request, spies } = makeRequest(0, 0);
      const { getByText } = render(<MobileNoteTableSheet request={request} onClose={onClose} />);

      fireEvent.click(getByText('NoteView.tableSheet.done'));
      expect(onClose).toHaveBeenCalledTimes(1);

      fireEvent.click(document.querySelector('[aria-label="Common.table"]')!);
      expect(spies.deleteTable).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(2);
   });

   it('renders nothing when there is no request', () => {
      const { container } = render(<MobileNoteTableSheet request={null} onClose={() => {}} />);
      expect(container.querySelector('[aria-label="NoteView.tableSheet.moveRowUp"]')).toBeNull();
   });
});
