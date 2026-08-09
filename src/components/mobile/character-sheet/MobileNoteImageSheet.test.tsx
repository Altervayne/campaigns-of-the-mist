// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { MobileNoteImageSheet } from './MobileNoteImageSheet';
import type { ImageRequest } from '@/components/organisms/note/live/assetImageWidget';
import type { NoteImageLayout } from '@/lib/notes/noteImageHint';

/*
 * The image options sheet: align/width chips fire their setters and stay open so tweaks chain; Remove fires and
 * closes. Active chips reflect the live hint; the width group greys out for a full-width image. The real
 * tap-to-open (the image overlay) is device-verified.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function makeRequest(hint: NoteImageLayout | null): ImageRequest & {
   getHint: ReturnType<typeof vi.fn>;
   setAlign: ReturnType<typeof vi.fn>;
   setWidth: ReturnType<typeof vi.fn>;
   remove: ReturnType<typeof vi.fn>;
} {
   return { index: 5, getHint: vi.fn(() => hint), setAlign: vi.fn(), setWidth: vi.fn(), remove: vi.fn() };
}

afterEach(cleanup);

describe('MobileNoteImageSheet', () => {
   it('sets an align preset and stays open', () => {
      const request = makeRequest({ align: 'center', widthPct: 50, aspect: null });
      const onClose = vi.fn();
      const { getByLabelText } = render(<MobileNoteImageSheet request={request} onClose={onClose} />);

      fireEvent.click(getByLabelText('NoteView.imageSheet.alignLeft'));

      expect(request.setAlign).toHaveBeenCalledWith('left');
      expect(onClose).not.toHaveBeenCalled();
   });

   it('sets a width preset and stays open', () => {
      const request = makeRequest({ align: 'center', widthPct: 50, aspect: null });
      const onClose = vi.fn();
      const { getByText } = render(<MobileNoteImageSheet request={request} onClose={onClose} />);

      fireEvent.click(getByText('75%'));

      expect(request.setWidth).toHaveBeenCalledWith(75);
      expect(onClose).not.toHaveBeenCalled();
   });

   it('fires Remove and closes', () => {
      const request = makeRequest({ align: 'center', widthPct: 50, aspect: null });
      const onClose = vi.fn();
      const { getByLabelText } = render(<MobileNoteImageSheet request={request} onClose={onClose} />);

      fireEvent.click(getByLabelText('NoteView.imageSheet.remove'));

      expect(request.remove).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
   });

   it('highlights the chips matching the current hint', () => {
      const request = makeRequest({ align: 'right', widthPct: 75, aspect: null });
      const { getByLabelText, getByText } = render(<MobileNoteImageSheet request={request} onClose={vi.fn()} />);

      expect(getByLabelText('NoteView.imageSheet.alignRight').getAttribute('aria-pressed')).toBe('true');
      expect(getByLabelText('NoteView.imageSheet.alignLeft').getAttribute('aria-pressed')).toBe('false');
      expect(getByText('75%').closest('button')?.getAttribute('aria-pressed')).toBe('true');
      expect(getByText('30%').closest('button')?.getAttribute('aria-pressed')).toBe('false');
   });

   it('greys the width group for a full-width image', () => {
      const request = makeRequest({ align: 'full', widthPct: 100, aspect: null });
      const { getByLabelText, getByText } = render(<MobileNoteImageSheet request={request} onClose={vi.fn()} />);

      expect(getByLabelText('NoteView.imageSheet.alignFull').getAttribute('aria-pressed')).toBe('true');
      expect((getByText('50%').closest('button') as HTMLButtonElement).disabled).toBe(true);
      expect((getByText('100%').closest('button') as HTMLButtonElement).disabled).toBe(true);
   });

   it('renders nothing without a request', () => {
      const { container } = render(<MobileNoteImageSheet request={null} onClose={vi.fn()} />);
      expect(container.querySelector('[aria-label="NoteView.imageSheet.alignLeft"]')).toBeNull();
   });

   it('renders nothing when the hint is gone (image removed under it)', () => {
      const request = makeRequest(null);
      const { container } = render(<MobileNoteImageSheet request={request} onClose={vi.fn()} />);
      expect(container.querySelector('[aria-label="NoteView.imageSheet.alignLeft"]')).toBeNull();
   });
});
