// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { MobileNoteLinkSheet } from './MobileNoteLinkSheet';
import { MobileNoteEditingBar } from './MobileNoteEditingBar';
import type { NoteEditorHandle } from '@/components/organisms/note/NoteEditor';
import type { LinkNodeInfo } from '@/components/organisms/note/live/linkNode';

/*
 * The link options sheet: Open follows the link, Change-target seeds the picker, Edit-label + Remove run through
 * the editor handle - each closes the sheet. The editing bar's Link chip is context-aware (in a link vs not).
 * The real tap-to-follow + caret-landing-in-a-link are device-verified.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const LINK: LinkNodeInfo = { from: 4, to: 22, label: 'Goblin', labelFrom: 5, labelTo: 11, href: 'cotm://character/g1' };

function makeEditor(): NoteEditorHandle & { editLinkLabel: ReturnType<typeof vi.fn>; removeLink: ReturnType<typeof vi.fn> } {
   return { editLinkLabel: vi.fn(), removeLink: vi.fn() } as unknown as NoteEditorHandle & {
      editLinkLabel: ReturnType<typeof vi.fn>;
      removeLink: ReturnType<typeof vi.fn>;
   };
}

afterEach(cleanup);

describe('MobileNoteLinkSheet', () => {
   it('follows the link on Open and closes', () => {
      const onOpen = vi.fn();
      const onClose = vi.fn();
      const { getByLabelText } = render(
         <MobileNoteLinkSheet isOpen link={LINK} getEditor={() => makeEditor()} onClose={onClose} onOpen={onOpen} onChangeTarget={vi.fn()} />,
      );

      fireEvent.click(getByLabelText('NoteView.linkEdit.open'));

      expect(onOpen).toHaveBeenCalledWith('cotm://character/g1');
      expect(onClose).toHaveBeenCalledTimes(1);
   });

   it('seeds the picker on Change target and closes', () => {
      const onChangeTarget = vi.fn();
      const onClose = vi.fn();
      const { getByLabelText } = render(
         <MobileNoteLinkSheet isOpen link={LINK} getEditor={() => makeEditor()} onClose={onClose} onOpen={vi.fn()} onChangeTarget={onChangeTarget} />,
      );

      fireEvent.click(getByLabelText('NoteView.linkEdit.changeTarget'));

      expect(onChangeTarget).toHaveBeenCalledWith({ from: 4, to: 22, label: 'Goblin', href: 'cotm://character/g1' });
      expect(onClose).toHaveBeenCalledTimes(1);
   });

   it('edits the label through the handle and closes', () => {
      const editor = makeEditor();
      const onClose = vi.fn();
      const { getByLabelText } = render(
         <MobileNoteLinkSheet isOpen link={LINK} getEditor={() => editor} onClose={onClose} onOpen={vi.fn()} onChangeTarget={vi.fn()} />,
      );

      fireEvent.click(getByLabelText('NoteView.linkEdit.editLabel'));

      expect(editor.editLinkLabel).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
   });

   it('removes the link through the handle and closes', () => {
      const editor = makeEditor();
      const onClose = vi.fn();
      const { getByLabelText } = render(
         <MobileNoteLinkSheet isOpen link={LINK} getEditor={() => editor} onClose={onClose} onOpen={vi.fn()} onChangeTarget={vi.fn()} />,
      );

      fireEvent.click(getByLabelText('NoteView.linkEdit.remove'));

      expect(editor.removeLink).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
   });

   it('renders nothing without a link', () => {
      const { container } = render(
         <MobileNoteLinkSheet isOpen link={null} getEditor={() => null} onClose={vi.fn()} onOpen={vi.fn()} onChangeTarget={vi.fn()} />,
      );
      expect(container.querySelector('[aria-label="NoteView.linkEdit.open"]')).toBeNull();
   });
});

describe('MobileNoteEditingBar link chip', () => {
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
      hasCover: false,
      onCoverButton: () => {},
      isLeftHanded: false,
      isMobileFABMode: false,
   };

   it('reads "Insert link" and opens the picker with no caret link', () => {
      const onLinkChip = vi.fn();
      const { getByLabelText, queryByLabelText } = render(
         <MobileNoteEditingBar {...base} linkCaret={null} onLinkChip={onLinkChip} />,
      );

      expect(queryByLabelText('NoteView.mobile.linkChip')).toBeNull();
      fireEvent.click(getByLabelText('NoteView.toolbar.insertLink'));
      expect(onLinkChip).toHaveBeenCalledTimes(1);
   });

   it('reads "Link" and opens the options sheet in a link', () => {
      const onLinkChip = vi.fn();
      const { getByLabelText, queryByLabelText } = render(
         <MobileNoteEditingBar {...base} linkCaret={LINK} onLinkChip={onLinkChip} />,
      );

      expect(queryByLabelText('NoteView.toolbar.insertLink')).toBeNull();
      fireEvent.click(getByLabelText('NoteView.mobile.linkChip'));
      expect(onLinkChip).toHaveBeenCalledTimes(1);
   });
});
