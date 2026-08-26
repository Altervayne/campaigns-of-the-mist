// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { InternalLinkChip } from './InternalLinkChip';
import type { LinkTarget } from '@/lib/portals/linkTarget';
import type { LinkMetadata } from '@/lib/portals/linkMetadata';

/*
 * The dead-chip re-point affordance: a confirmed-missing, re-pointable target renders the "Broken link" popover
 * trigger ONLY when `onRePoint` is supplied; every other case keeps the plain anchor (a live chip, or a dead one
 * with no re-point host). The interactive Radix open + pick is verified here through fireEvent; the full reading
 * flow is a cursor-check.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The chip reads liveness from `useLinkMetadata`; a mutable stub drives dead vs live per test.
let mockMetadata: LinkMetadata | undefined;
vi.mock('@/hooks/useLinkMetadata', () => ({ useLinkMetadata: () => mockMetadata }));

const PDF_TARGET: LinkTarget = { kind: 'entity', entity: 'pdf', id: 'goneId' };

function renderChip(onRePoint?: (target: LinkTarget) => void) {
   return render(
      <InternalLinkChip
         target={PDF_TARGET}
         href="cotm://pdf/goneId"
         headings={[]}
         authorLabel="Rulebook"
         deadTooltip="Target not found"
         onActivate={vi.fn()}
         onRePoint={onRePoint}
      >
         Rulebook
      </InternalLinkChip>,
   );
}

afterEach(() => { mockMetadata = undefined; cleanup(); });

describe('InternalLinkChip re-point', () => {
   it('renders the popover trigger (button, not anchor) for a dead re-pointable target with onRePoint', () => {
      mockMetadata = { exists: false } as LinkMetadata;
      const { container } = renderChip(vi.fn());
      expect(container.querySelector('a')).toBeNull();
      expect(container.querySelector('button')).not.toBeNull();
   });

   it('keeps the plain dead anchor when onRePoint is not supplied', () => {
      mockMetadata = { exists: false } as LinkMetadata;
      const { container } = renderChip(undefined);
      const anchor = container.querySelector('a');
      expect(anchor).not.toBeNull();
      expect(anchor?.getAttribute('title')).toBe('Target not found');
      expect(container.querySelector('button')).toBeNull();
   });

   it('renders a plain anchor for a live target even with onRePoint', () => {
      mockMetadata = { exists: true } as LinkMetadata;
      const { container } = renderChip(vi.fn());
      expect(container.querySelector('a')).not.toBeNull();
      expect(container.querySelector('button')).toBeNull();
   });

   it('re-points with the dead target when the popover Re-point action is used', () => {
      mockMetadata = { exists: false } as LinkMetadata;
      const onRePoint = vi.fn();
      renderChip(onRePoint);
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByRole('button', { name: 'NoteView.linkRepair.rePoint' }));
      expect(onRePoint).toHaveBeenCalledWith(PDF_TARGET);
   });
});
