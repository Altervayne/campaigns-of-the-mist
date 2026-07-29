// @vitest-environment jsdom

// -- Library Imports --
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

// -- Component Imports --
import { WorkspaceDialogStack } from './WorkspaceDialogStack';

// -- Utils Imports --
import { ACCEPT_SHEET_IMPORT } from '@/lib/utils/fileAccept';

/*
 * The palette's "Import file" picker routes through the same `useCharacterSheetFileImport` router as the
 * sheet's drop zone, so it has to offer what that router can parse. Everything else in the stack is mocked:
 * this covers the hidden picker, not the dialogs above it.
 */

vi.mock('@/components/organisms/command-palette/CommandPalette', () => ({ CommandPalette: () => <div /> }));
vi.mock('@/components/organisms/dialogs/CreateCardDialog', () => ({ CreateCardDialog: () => <div /> }));
vi.mock('@/components/organisms/dialogs/ChallengeCardEditor', () => ({ ChallengeCardEditor: () => <div /> }));
vi.mock('@/components/organisms/dialogs/settings/SettingsShell', () => ({ SettingsShell: () => <div /> }));

describe('WorkspaceDialogStack import picker', () => {
   it('offers the character sheet import family', () => {
      const fileInputRef = createRef<HTMLInputElement>();
      render(
         <WorkspaceDialogStack
            formRef={createRef<HTMLFormElement>()}
            fileInputRef={fileInputRef}
            onFileSelected={() => {}}
            noteMarkdownDialogs={null}
            commands={[]}
            isCardDialogOpen={false}
            onCardDialogOpenChange={() => {}}
            onCardDialogConfirm={() => {}}
            cardDialogMode="create"
            cardToEdit={null}
            game="LEGENDS"
            challengeCardToEdit={null}
            onCloseChallengeEditor={() => {}}
            isSettingsOpen={false}
            onSettingsOpenChange={() => {}}
         />
      );

      expect(fileInputRef.current?.getAttribute('accept')).toBe(ACCEPT_SHEET_IMPORT);
   });
});
