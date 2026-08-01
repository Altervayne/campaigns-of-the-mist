// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { forwardRef } from 'react';

/*
 * The mobile note surface renders the note name in the top bar, opens in Edit (the CM6 editor is mounted),
 * and the top-bar toggle flips to Reading (the rendered document) and back.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/stores/appSettingsStore', () => ({
   useAppSettingsStore: (selector: (state: { mobileHandedness: string; isMobileFABMode: boolean }) => unknown) =>
      selector({ mobileHandedness: 'right', isMobileFABMode: false }),
}));
// The CM6 editor + the react-markdown document are stubbed - the surface's chrome + mode model is what matters here.
vi.mock('@/components/organisms/note/NoteEditor', () => ({
   NoteEditor: forwardRef<unknown, unknown>(function NoteEditor(_props, _ref) {
      return <div data-testid="note-editor" />;
   }),
}));
vi.mock('@/components/molecules/NoteDocument', () => ({
   NoteDocument: ({ body }: { body: string }) => <div data-testid="note-document">{body}</div>,
}));
vi.mock('@/hooks/useNoteImageInsertion', () => ({
   useNoteImageInsertion: () => ({
      fileInputRef: { current: null },
      open: vi.fn(),
      isProcessing: false,
      handleFileSelected: vi.fn(),
      handleImageEvent: vi.fn(),
      cropperDialog: null,
   }),
}));

import { ActiveNoteStoreContext } from '@/lib/notes/ActiveNoteStoreContext';
import { createNoteStore } from '@/lib/stores/noteStore';
import MobileNoteSurface from './MobileNoteSurface';
import type { Note } from '@/lib/types/board';

function buildStore() {
   const store = createNoteStore();
   const note: Note = { id: 'n1', title: 'My Note', body: 'Hello world' };
   store.getState().actions.loadNote(note, null);
   return store;
}

function renderSurface() {
   const store = buildStore();
   return render(
      <ActiveNoteStoreContext.Provider value={store}>
         <MobileNoteSurface onOpenSwitcher={() => {}} />
      </ActiveNoteStoreContext.Provider>,
   );
}

afterEach(cleanup);

describe('MobileNoteSurface', () => {
   it('shows the note name in the top bar and opens in Edit', () => {
      const { getByText, getByTestId, queryByTestId } = renderSurface();

      expect(getByText('My Note')).not.toBeNull();
      // Default mode is Edit (Live), so the editor is mounted and the document is not.
      expect(getByTestId('note-editor')).not.toBeNull();
      expect(queryByTestId('note-document')).toBeNull();
   });

   it('toggles Reading <-> Edit from the top bar', () => {
      const { getByLabelText, getByTestId, queryByTestId } = renderSurface();

      // In Edit, the toggle offers Reading.
      fireEvent.click(getByLabelText('NoteView.mobile.read'));
      expect(getByTestId('note-document')).not.toBeNull();
      expect(queryByTestId('note-editor')).toBeNull();

      // Back to Edit.
      fireEvent.click(getByLabelText('NoteView.mobile.edit'));
      expect(getByTestId('note-editor')).not.toBeNull();
      expect(queryByTestId('note-document')).toBeNull();
   });
});
