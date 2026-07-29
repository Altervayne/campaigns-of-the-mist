// -- React Imports --
import type { ChangeEvent, ReactNode, RefObject } from 'react';

// -- Component Imports --
import { CommandPalette } from '@/components/organisms/command-palette/CommandPalette';
import { CreateCardDialog } from '@/components/organisms/dialogs/CreateCardDialog';
import { ChallengeCardEditor } from '@/components/organisms/dialogs/ChallengeCardEditor';
import { SettingsShell } from '@/components/organisms/dialogs/settings/SettingsShell';

// -- Utils Imports --
import { ACCEPT_SHEET_IMPORT } from '@/lib/utils/fileAccept';

// -- Type Imports --
import type { CommandAction } from '@/hooks/useCommandPaletteActions';
import type { Card as CardData } from '@/lib/types/character';
import type { CreateCardOptions } from '@/lib/types/creation';
import type { GameSystem } from '@/lib/types/drawer';


interface WorkspaceDialogStackProps {
   /** The hidden picker the palette's "Import file" command clicks. */
   formRef: RefObject<HTMLFormElement | null>;
   fileInputRef: RefObject<HTMLInputElement | null>;
   onFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
   /** The note Markdown export warning, already built by its own hook. */
   noteMarkdownDialogs: ReactNode;
   commands: CommandAction[];
   isCardDialogOpen: boolean;
   onCardDialogOpenChange: (isOpen: boolean) => void;
   onCardDialogConfirm: (options: CreateCardOptions, cardId?: string) => void;
   cardDialogMode: 'create' | 'edit';
   cardToEdit: CardData | null;
   game: GameSystem;
   challengeCardToEdit: CardData | null;
   onCloseChallengeEditor: () => void;
   isSettingsOpen: boolean;
   onSettingsOpenChange: (isOpen: boolean) => void;
}

/**
 * The workspace's modal layer: the command palette, the card dialogs, the settings hub, and the
 * hidden import form they share. Each owner opens its own dialog; they are mounted together so the
 * shell has one place to look for anything that renders over the whole app.
 */
export function WorkspaceDialogStack({ formRef, fileInputRef, onFileSelected, noteMarkdownDialogs, commands, isCardDialogOpen, onCardDialogOpenChange, onCardDialogConfirm, cardDialogMode, cardToEdit, game, challengeCardToEdit, onCloseChallengeEditor, isSettingsOpen, onSettingsOpenChange }: WorkspaceDialogStackProps) {
   return (
      <>
         {/* Hidden picker for the palette's "Import file" command; routes through the shared drop importer. */}
         <form ref={formRef} className="hidden">
            <input ref={fileInputRef} type="file" accept={ACCEPT_SHEET_IMPORT} onChange={onFileSelected} />
         </form>

         {/* The images-won't-travel warning for note Markdown export (sidebar + palette share it). */}
         {noteMarkdownDialogs}

         {/* DIALOGS START */}
         <CommandPalette
            commands={commands}
         />
         <CreateCardDialog
            isOpen={isCardDialogOpen}
            onOpenChange={onCardDialogOpenChange}
            onConfirm={onCardDialogConfirm}
            mode={cardDialogMode}
            cardData={cardToEdit ?? undefined}
            modal={true}
            game={game}
         />
         <ChallengeCardEditor
            isOpen={!!challengeCardToEdit}
            onOpenChange={(open) => { if (!open) onCloseChallengeEditor(); }}
            card={challengeCardToEdit}
            modal={true}
         />
         <SettingsShell
            isOpen={isSettingsOpen}
            onOpenChange={onSettingsOpenChange}
         />
         {/* DIALOGS END */}
      </>
   );
}
