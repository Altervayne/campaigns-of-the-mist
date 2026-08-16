// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { RollTableReadView } from './RollTableReadView';
import type { RollTableEntry } from '@/lib/rolltable/types';

/*
 * The read view keeps the last result's row lit by entry id, so it follows the entry through reorders and
 * edits and drops out only when that row is deleted. A live roll's landing row wins while the animation runs.
 */

const entries: RollTableEntry[] = [
   { id: 'a', weight: 1, text: 'Alpha' },
   { id: 'b', weight: 1, text: 'Beta' },
   { id: 'c', weight: 1, text: 'Gamma' },
];
const labels = ['1', '2', '3'];
const lit = (container: HTMLElement) =>
   Array.from(container.querySelectorAll('li')).map((li) => li.className.includes('bg-primary/15'));

afterEach(cleanup);

describe('RollTableReadView highlight', () => {
   it('lights the row whose id matches highlightId at rest', () => {
      const { container } = render(<RollTableReadView entries={entries} labels={labels} liveIndex={null} highlightId="b" entryPlaceholder="" />);
      expect(lit(container)).toEqual([false, true, false]);
   });

   it('follows the id to its new position after a reorder', () => {
      const reordered = [entries[2], entries[0], entries[1]]; // 'b' now last
      const { container } = render(<RollTableReadView entries={reordered} labels={labels} liveIndex={null} highlightId="b" entryPlaceholder="" />);
      expect(lit(container)).toEqual([false, false, true]);
   });

   it('lights nothing once the highlighted row is gone', () => {
      const { container } = render(<RollTableReadView entries={entries} labels={labels} liveIndex={null} highlightId="removed" entryPlaceholder="" />);
      expect(lit(container)).toEqual([false, false, false]);
   });

   it('lets a live roll row win over the resting highlight', () => {
      const { container } = render(<RollTableReadView entries={entries} labels={labels} liveIndex={0} highlightId="b" entryPlaceholder="" />);
      expect(lit(container)).toEqual([true, false, false]);
   });
});
