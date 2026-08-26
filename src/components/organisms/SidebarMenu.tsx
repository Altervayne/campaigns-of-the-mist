// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { SidebarHeader } from './sidebar/SidebarHeader';
import { SidebarSubmenuToggles } from './sidebar/SidebarSubmenuToggles';
import { SidebarPlayAreaActions } from './sidebar/SidebarPlayAreaActions';
import { SidebarBoardActions } from './sidebar/SidebarBoardActions';
import { SidebarNoteActions } from './sidebar/SidebarNoteActions';
import { SidebarPdfActions } from './sidebar/SidebarPdfActions';
import { SidebarMainMenuActions } from './sidebar/SidebarMainMenuActions';
import { SidebarBottomActions } from './sidebar/SidebarBottomActions';
import { SidebarFileInputs } from './sidebar/SidebarFileInputs';
import { SidebarUpdateDialogs } from './sidebar/SidebarUpdateDialogs';

// -- Store and Hook Imports --
import { useCharacterActions, useCharacterStore } from '@/lib/stores/characterStore';
import { useTabManagerActions } from '@/lib/character/tabManagerStore';
import { useSaveToDrawer } from '@/hooks/useSaveToDrawer';
import { useSidebarFileIO } from '@/hooks/sidebar/useSidebarFileIO';

// -- Type Imports --
import type { ActiveWindow } from '@/lib/character/activeWindow';



interface SidebarMenuProps {
   isEditing: boolean;
   isDrawerOpen: boolean;
   isCollapsed: boolean;
   activeWindow: ActiveWindow;
   onExportNoteMarkdown: () => void;
   onImportNoteMarkdownFile: (file: File) => Promise<void>;
   onToggleEditing: () => void;
   onToggleDrawer: () => void;
   onToggleCollapse: () => void;
   onOpenSettings: () => void;
   onOpenWhatsNew: () => void;
   onOpenHelp: () => void;
}

export function SidebarMenu({ isEditing, isDrawerOpen, isCollapsed, activeWindow, onExportNoteMarkdown, onImportNoteMarkdownFile, onToggleEditing, onToggleDrawer, onToggleCollapse, onOpenSettings, onOpenWhatsNew, onOpenHelp }: SidebarMenuProps) {
   const { t: tNotifications } = useTranslation();

   const character = useCharacterStore((state) => state.character);
   const { resetCharacter } = useCharacterActions();
   const { deactivate } = useTabManagerActions();

   // Save-to-drawer (Save + Save-As, character + board + note) lives in a shared hook so the sidebar and
   // the command palette drive one implementation.
   const { saveCharacterToDrawer, saveCharacterAsToDrawer, saveBoardToDrawer, saveBoardAsToDrawer, saveNoteToDrawer, saveNoteAsToDrawer } = useSaveToDrawer();

   const {
      characterImportInputRef,
      characterFormRef,
      componentImportInputRef,
      componentFormRef,
      boardImportInputRef,
      boardFormRef,
      characterUpdateInputRef,
      characterUpdateFormRef,
      boardUpdateInputRef,
      boardUpdateFormRef,
      noteImportInputRef,
      noteFormRef,
      noteUpdateInputRef,
      noteUpdateFormRef,
      workspaceImportInputRef,
      workspaceFormRef,
      handleExportCharacter,
      handleExportBoard,
      handleExportNote,
      handleExportPdf,
      handleExportPdfAnnotations,
      handleApplyPdfMarkup,
      handleWorkspaceFileSelected,
      handleCharacterFileSelected,
      handleBoardFileSelected,
      handleNoteFileSelected,
      handleComponentFileSelected,
      handleCharacterUpdateFileSelected,
      handleBoardUpdateFileSelected,
      handleNoteUpdateFileSelected,
      pendingCharacterUpdate,
      setPendingCharacterUpdate,
      pendingBoardUpdate,
      setPendingBoardUpdate,
      pendingNoteUpdate,
      setPendingNoteUpdate,
      confirmCharacterUpdate,
      confirmBoardUpdate,
      confirmNoteUpdate,
   } = useSidebarFileIO({ onImportNoteMarkdownFile });

   const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
   const handleResetCharacter = () => {
      resetCharacter();
      toast.success(tNotifications('Notifications.character.reset'));
   };

   const handleOpenMenu = () => {
      // Show the main menu but keep every open tab and its live instance; this is a
      // view switch, not a close.
      deactivate();
   };



   return (
      <aside
         data-tutorial="sidebar-menu"
         className={cn(
            "hidden md:flex flex-col bg-card pt-2 border-r-2 border-border space-y-4 ease-in-out overflow-hidden",
            isCollapsed ? "w-14 items-center" : "w-60"
         )}
         style={{
            // The rail opens immediately but waits to CLOSE until the buttons have collapsed to one line
            // (the height-collapse, 200ms) - otherwise it would clip the still-wide buttons mid-collapse.
            transitionProperty: 'width',
            transitionDuration: '300ms',
            transitionTimingFunction: 'ease-in-out',
            transitionDelay: isCollapsed ? '200ms' : '0ms',
         }}
      >
         <div className="flex flex-col justify-between w-full h-full">
            <SidebarHeader isCollapsed={isCollapsed} activeWindow={activeWindow} onToggleCollapse={onToggleCollapse} />

            {/* Context-specific scrollable buttons */}
            <div className="flex flex-col grow w-full min-h-0 overflow-y-auto overscroll-contain">
               <SidebarSubmenuToggles isCollapsed={isCollapsed} isDrawerOpen={isDrawerOpen} onToggleDrawer={onToggleDrawer} />

               { activeWindow === 'PLAY_AREA' &&
                  <SidebarPlayAreaActions
                     isCollapsed={isCollapsed}
                     isEditing={isEditing}
                     canReset={!!character}
                     onToggleEditing={onToggleEditing}
                     saveCharacterToDrawer={saveCharacterToDrawer}
                     saveCharacterAsToDrawer={saveCharacterAsToDrawer}
                     onExportCharacter={handleExportCharacter}
                     characterImportInputRef={characterImportInputRef}
                     characterUpdateInputRef={characterUpdateInputRef}
                     componentImportInputRef={componentImportInputRef}
                     onOpenResetDialog={() => setIsResetDialogOpen(true)}
                  />
               }

               { activeWindow === 'BOARD' &&
                  <SidebarBoardActions
                     isCollapsed={isCollapsed}
                     saveBoardToDrawer={saveBoardToDrawer}
                     saveBoardAsToDrawer={saveBoardAsToDrawer}
                     onExportBoard={handleExportBoard}
                     boardImportInputRef={boardImportInputRef}
                     boardUpdateInputRef={boardUpdateInputRef}
                  />
               }

               { activeWindow === 'NOTE' &&
                  <SidebarNoteActions
                     isCollapsed={isCollapsed}
                     saveNoteToDrawer={saveNoteToDrawer}
                     saveNoteAsToDrawer={saveNoteAsToDrawer}
                     onExportNote={handleExportNote}
                     onExportNoteMarkdown={onExportNoteMarkdown}
                     noteImportInputRef={noteImportInputRef}
                     noteUpdateInputRef={noteUpdateInputRef}
                  />
               }

               { activeWindow === 'PDF' &&
                  <SidebarPdfActions
                     isCollapsed={isCollapsed}
                     onExportPdf={handleExportPdf}
                     onExportAnnotations={handleExportPdfAnnotations}
                     onApplyAnnotations={handleApplyPdfMarkup}
                  />
               }

               { activeWindow === 'MAIN_MENU' &&
                  <SidebarMainMenuActions isCollapsed={isCollapsed} workspaceImportInputRef={workspaceImportInputRef} />
               }
            </div>

            <SidebarBottomActions
               isCollapsed={isCollapsed}
               activeWindow={activeWindow}
               onOpenMenu={handleOpenMenu}
               onOpenSettings={onOpenSettings}
               onOpenWhatsNew={onOpenWhatsNew}
               onOpenHelp={onOpenHelp}
            />


            <SidebarFileInputs
               characterImportInputRef={characterImportInputRef}
               characterFormRef={characterFormRef}
               componentImportInputRef={componentImportInputRef}
               componentFormRef={componentFormRef}
               boardImportInputRef={boardImportInputRef}
               boardFormRef={boardFormRef}
               characterUpdateInputRef={characterUpdateInputRef}
               characterUpdateFormRef={characterUpdateFormRef}
               boardUpdateInputRef={boardUpdateInputRef}
               boardUpdateFormRef={boardUpdateFormRef}
               noteImportInputRef={noteImportInputRef}
               noteFormRef={noteFormRef}
               noteUpdateInputRef={noteUpdateInputRef}
               noteUpdateFormRef={noteUpdateFormRef}
               workspaceImportInputRef={workspaceImportInputRef}
               workspaceFormRef={workspaceFormRef}
               onCharacterFileSelected={handleCharacterFileSelected}
               onComponentFileSelected={handleComponentFileSelected}
               onBoardFileSelected={handleBoardFileSelected}
               onCharacterUpdateFileSelected={handleCharacterUpdateFileSelected}
               onBoardUpdateFileSelected={handleBoardUpdateFileSelected}
               onNoteFileSelected={handleNoteFileSelected}
               onNoteUpdateFileSelected={handleNoteUpdateFileSelected}
               onWorkspaceFileSelected={handleWorkspaceFileSelected}
            />
         </div>



         <SidebarUpdateDialogs
            isResetDialogOpen={isResetDialogOpen}
            setIsResetDialogOpen={setIsResetDialogOpen}
            onResetCharacter={handleResetCharacter}
            pendingCharacterUpdate={pendingCharacterUpdate}
            setPendingCharacterUpdate={setPendingCharacterUpdate}
            pendingBoardUpdate={pendingBoardUpdate}
            setPendingBoardUpdate={setPendingBoardUpdate}
            pendingNoteUpdate={pendingNoteUpdate}
            setPendingNoteUpdate={setPendingNoteUpdate}
            onConfirmCharacterUpdate={confirmCharacterUpdate}
            onConfirmBoardUpdate={confirmBoardUpdate}
            onConfirmNoteUpdate={confirmNoteUpdate}
         />
      </aside>
   );
}
