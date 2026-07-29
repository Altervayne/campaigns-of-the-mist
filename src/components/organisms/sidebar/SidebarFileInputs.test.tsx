// @vitest-environment jsdom

// -- Library Imports --
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

// -- Component Imports --
import { SidebarFileInputs } from './SidebarFileInputs';

// -- Utils Imports --
import { ACCEPT_ENTITY_IMPORT, ACCEPT_NOTE_IMPORT, ACCEPT_WORKSPACE_IMPORT } from '@/lib/utils/fileAccept';

/*
 * This one component hosts three picker families, so it is where a family could be mis-wired without any
 * other test noticing: each input has to offer what its own handler can parse, and the entity inputs must
 * NOT pick up the Markdown the note and workspace inputs offer.
 */

const refs = () => ({
   characterImportInputRef: createRef<HTMLInputElement>(),
   characterFormRef: createRef<HTMLFormElement>(),
   componentImportInputRef: createRef<HTMLInputElement>(),
   componentFormRef: createRef<HTMLFormElement>(),
   boardImportInputRef: createRef<HTMLInputElement>(),
   boardFormRef: createRef<HTMLFormElement>(),
   characterUpdateInputRef: createRef<HTMLInputElement>(),
   characterUpdateFormRef: createRef<HTMLFormElement>(),
   boardUpdateInputRef: createRef<HTMLInputElement>(),
   boardUpdateFormRef: createRef<HTMLFormElement>(),
   noteImportInputRef: createRef<HTMLInputElement>(),
   noteFormRef: createRef<HTMLFormElement>(),
   noteUpdateInputRef: createRef<HTMLInputElement>(),
   noteUpdateFormRef: createRef<HTMLFormElement>(),
   workspaceImportInputRef: createRef<HTMLInputElement>(),
   workspaceFormRef: createRef<HTMLFormElement>(),
});

const noop = () => {};

function renderInputs() {
   const inputRefs = refs();
   render(
      <SidebarFileInputs
         {...inputRefs}
         onCharacterFileSelected={noop}
         onComponentFileSelected={noop}
         onBoardFileSelected={noop}
         onCharacterUpdateFileSelected={noop}
         onBoardUpdateFileSelected={noop}
         onNoteFileSelected={noop}
         onNoteUpdateFileSelected={noop}
         onWorkspaceFileSelected={noop}
      />
   );
   return inputRefs;
}

describe('SidebarFileInputs accept strings', () => {
   it('offers the envelope alone on every entity import and update', () => {
      const r = renderInputs();
      const entityInputs = [r.characterImportInputRef, r.componentImportInputRef, r.boardImportInputRef, r.characterUpdateInputRef, r.boardUpdateInputRef];
      for (const ref of entityInputs) {
         expect(ref.current?.getAttribute('accept')).toBe(ACCEPT_ENTITY_IMPORT);
      }
   });

   it('offers Markdown on the note and workspace inputs only', () => {
      const r = renderInputs();
      expect(r.noteImportInputRef.current?.getAttribute('accept')).toBe(ACCEPT_NOTE_IMPORT);
      expect(r.noteUpdateInputRef.current?.getAttribute('accept')).toBe(ACCEPT_NOTE_IMPORT);
      expect(r.workspaceImportInputRef.current?.getAttribute('accept')).toBe(ACCEPT_WORKSPACE_IMPORT);
      expect(r.characterImportInputRef.current?.getAttribute('accept')).not.toMatch(/markdown/);
   });
});
