// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { MobileNoteCoverSheet } from './MobileNoteCoverSheet';
import { MobileNoteEditingBar } from './MobileNoteEditingBar';
import type { NoteCover } from '@/lib/types/board';

/*
 * The cover options sheet: Change/Remove close it (nothing left to act on / cropper takes over); aspect and width
 * chips fire their setters and stay open so tweaks chain. Active chips reflect the current cover. The picker/crop
 * and the real tap-to-open are device-verified.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const cover: NoteCover = { hash: 'abc', width: 40, aspect: 1 };

function callbacks() {
   return { onClose: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(), onSetAspect: vi.fn(), onSetWidth: vi.fn() };
}

afterEach(cleanup);

describe('MobileNoteCoverSheet', () => {
   it('fires Change and closes', () => {
      const cb = callbacks();
      const { getByLabelText } = render(<MobileNoteCoverSheet isOpen cover={cover} {...cb} />);

      fireEvent.click(getByLabelText('NoteView.cover.change'));

      expect(cb.onChange).toHaveBeenCalledTimes(1);
      expect(cb.onClose).toHaveBeenCalledTimes(1);
   });

   it('fires Remove and closes', () => {
      const cb = callbacks();
      const { getByLabelText } = render(<MobileNoteCoverSheet isOpen cover={cover} {...cb} />);

      fireEvent.click(getByLabelText('NoteView.cover.remove'));

      expect(cb.onRemove).toHaveBeenCalledTimes(1);
      expect(cb.onClose).toHaveBeenCalledTimes(1);
   });

   it('sets an aspect preset and stays open', () => {
      const cb = callbacks();
      const { getByLabelText } = render(<MobileNoteCoverSheet isOpen cover={cover} {...cb} />);

      fireEvent.click(getByLabelText('NoteView.cover.aspectSquare'));

      expect(cb.onSetAspect).toHaveBeenCalledWith(1);
      expect(cb.onClose).not.toHaveBeenCalled();
   });

   it('sets a width preset (with the current aspect) and stays open', () => {
      const cb = callbacks();
      const { getByLabelText } = render(<MobileNoteCoverSheet isOpen cover={cover} {...cb} />);

      fireEvent.click(getByLabelText('NoteView.cover.widthLarge'));

      expect(cb.onSetWidth).toHaveBeenCalledWith(60, cover.aspect);
      expect(cb.onClose).not.toHaveBeenCalled();
   });

   it('highlights the chips matching the current cover', () => {
      const cb = callbacks();
      const { getByLabelText } = render(<MobileNoteCoverSheet isOpen cover={cover} {...cb} />);

      // Square (1) and Medium (40%) match this cover; a non-matching preset reads unpressed.
      expect(getByLabelText('NoteView.cover.aspectSquare').getAttribute('aria-pressed')).toBe('true');
      expect(getByLabelText('NoteView.cover.widthMedium').getAttribute('aria-pressed')).toBe('true');
      expect(getByLabelText('NoteView.cover.widthFull').getAttribute('aria-pressed')).toBe('false');
   });

   it('renders nothing without a cover', () => {
      const cb = callbacks();
      const { container } = render(<MobileNoteCoverSheet isOpen cover={null} {...cb} />);
      expect(container.querySelector('[aria-label="NoteView.cover.change"]')).toBeNull();
   });
});

describe('MobileNoteEditingBar cover button', () => {
   const base = {
      getEditor: () => null,
      onInsertImage: () => {},
      isImageProcessing: false,
      canUndo: false,
      canRedo: false,
      onUndo: () => {},
      onRedo: () => {},
      canOpenTable: false,
      onOpenTable: () => {},
      isLeftHanded: false,
      isMobileFABMode: false,
   };

   it('reads "Add cover" and adds when there is no cover', () => {
      const onCoverButton = vi.fn();
      const { getByLabelText, queryByLabelText } = render(
         <MobileNoteEditingBar {...base} hasCover={false} onCoverButton={onCoverButton} />,
      );

      expect(queryByLabelText('NoteView.cover.label')).toBeNull();
      fireEvent.click(getByLabelText('NoteView.cover.add'));
      expect(onCoverButton).toHaveBeenCalledTimes(1);
   });

   it('reads "Cover" when a cover exists', () => {
      const onCoverButton = vi.fn();
      const { getByLabelText, queryByLabelText } = render(
         <MobileNoteEditingBar {...base} hasCover onCoverButton={onCoverButton} />,
      );

      expect(queryByLabelText('NoteView.cover.add')).toBeNull();
      fireEvent.click(getByLabelText('NoteView.cover.label'));
      expect(onCoverButton).toHaveBeenCalledTimes(1);
   });
});
