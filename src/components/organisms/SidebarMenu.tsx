// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

// -- Icon Imports --
import { Edit, Save, Download, Upload, Layers, Trash2, SaveAll, RefreshCw, FileUp } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { SidebarButton } from '../molecules/SidebarButton';
import { ClearBoardControl } from '../molecules/ClearBoardControl';
import { SidebarHeader } from './sidebar/SidebarHeader';
import { SidebarSubmenuToggles } from './sidebar/SidebarSubmenuToggles';
import { SidebarBottomActions } from './sidebar/SidebarBottomActions';
import { SidebarFileInputs } from './sidebar/SidebarFileInputs';
import { SidebarUpdateDialogs } from './sidebar/SidebarUpdateDialogs';

// -- Store and Hook Imports --
import { useCharacterActions, useCharacterStore } from '@/lib/stores/characterStore';
import { useTabManagerActions } from '@/lib/character/tabManagerStore';
import { useSaveToDrawer } from '@/hooks/useSaveToDrawer';
import { useSidebarFileIO } from '@/hooks/sidebar/useSidebarFileIO';



type WindowTypes = 'MAIN_MENU' | 'PLAY_AREA' | 'BOARD' | 'NOTE';

interface SidebarMenuProps {
   isEditing: boolean;
   isDrawerOpen: boolean;
   isCollapsed: boolean;
   activeWindow: WindowTypes;
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
   const { t } = useTranslation();
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
                  <>
                     <motion.section data-tutorial="menu-edit-drawer-buttons" layout transition={{ duration: 0.2 }} className={cn(
                        "flex flex-col items-center gap-2 py-2 bg-popover border-b border-border",
                        isCollapsed ? "px-0" : "px-2"
                     )}>
                        <SidebarButton data-tutorial="edit-mode-toggle" isCollapsed={isCollapsed} onClick={onToggleEditing} variant={isEditing ? 'secondary' : 'default'} Icon={Edit}>
                           {t('CharacterSheetPage.SidebarMenu.editMode')}
                        </SidebarButton>
                     </motion.section>

                     <motion.section layout transition={{ duration: 0.2 }} className={cn(
                        "flex flex-col items-center gap-2 p-2 bg-popover border-b border-border"
                     )}>
                        <SidebarButton data-tutorial="save-character-button" isCollapsed={isCollapsed} onClick={saveCharacterToDrawer} Icon={Save}>
                           {t('CharacterSheetPage.SidebarMenu.saveToDrawer')}
                        </SidebarButton>
                        <SidebarButton data-tutorial="save-character-as-button" isCollapsed={isCollapsed} onClick={saveCharacterAsToDrawer} Icon={SaveAll}>
                           {t('CharacterSheetPage.SidebarMenu.saveToDrawerAs')}
                        </SidebarButton>
                        <SidebarButton data-tutorial="export-character-button" isCollapsed={isCollapsed} onClick={handleExportCharacter} Icon={Upload}>
                           {t('CharacterSheetPage.SidebarMenu.exportCharacter')}
                        </SidebarButton>
                        <SidebarButton data-tutorial="import-character-button" isCollapsed={isCollapsed} onClick={() => characterImportInputRef.current?.click()} Icon={Download}>
                           {t('CharacterSheetPage.SidebarMenu.importCharacter')}
                        </SidebarButton>
                        <SidebarButton isCollapsed={isCollapsed} onClick={() => characterUpdateInputRef.current?.click()} Icon={RefreshCw}>
                           {t('CharacterSheetPage.SidebarMenu.updateCharacter')}
                        </SidebarButton>
                        <SidebarButton data-tutorial="import-component-button" isCollapsed={isCollapsed} onClick={() => componentImportInputRef.current?.click()} Icon={Layers}>
                           {t('CharacterSheetPage.SidebarMenu.importComponent')}
                        </SidebarButton>
                     </motion.section>

                     <motion.section layout transition={{ duration: 0.2 }} className={cn(
                        "flex flex-col items-center gap-2 p-2 bg-popover border-b border-border"
                     )}>
                        <SidebarButton data-tutorial="reset-character-button" disabled={!character} variant="destructive" isCollapsed={isCollapsed} onClick={() => setIsResetDialogOpen(true)} Icon={Trash2}>
                           {t('CharacterSheetPage.SidebarMenu.resetCharacter')}
                        </SidebarButton>
                     </motion.section>
                  </>
               }

               { activeWindow === 'BOARD' &&
                  <>
                     <motion.section layout transition={{ duration: 0.2 }} className={cn(
                        "flex flex-col items-center gap-2 p-2 bg-popover border-b border-border"
                     )}>
                        <SidebarButton isCollapsed={isCollapsed} onClick={saveBoardToDrawer} Icon={Save}>
                           {t('CharacterSheetPage.SidebarMenu.saveBoardToDrawer')}
                        </SidebarButton>
                        <SidebarButton isCollapsed={isCollapsed} onClick={saveBoardAsToDrawer} Icon={SaveAll}>
                           {t('CharacterSheetPage.SidebarMenu.saveBoardToDrawerAs')}
                        </SidebarButton>
                        <SidebarButton isCollapsed={isCollapsed} onClick={handleExportBoard} Icon={Upload}>
                           {t('CharacterSheetPage.SidebarMenu.exportBoard')}
                        </SidebarButton>
                        <SidebarButton isCollapsed={isCollapsed} onClick={() => boardImportInputRef.current?.click()} Icon={Download}>
                           {t('CharacterSheetPage.SidebarMenu.importBoard')}
                        </SidebarButton>
                        <SidebarButton isCollapsed={isCollapsed} onClick={() => boardUpdateInputRef.current?.click()} Icon={RefreshCw}>
                           {t('CharacterSheetPage.SidebarMenu.updateBoard')}
                        </SidebarButton>
                     </motion.section>

                     <motion.section layout transition={{ duration: 0.2 }} className={cn(
                        "flex flex-col items-center gap-2 p-2 bg-popover border-b border-border"
                     )}>
                        <ClearBoardControl isCollapsed={isCollapsed} />
                     </motion.section>
                  </>
               }

               { activeWindow === 'NOTE' &&
                  <motion.section layout transition={{ duration: 0.2 }} className={cn(
                     "flex flex-col items-center gap-2 p-2 bg-popover border-b border-border"
                  )}>
                     <SidebarButton isCollapsed={isCollapsed} onClick={saveNoteToDrawer} Icon={Save}>
                        {t('CharacterSheetPage.SidebarMenu.saveNoteToDrawer')}
                     </SidebarButton>
                     <SidebarButton isCollapsed={isCollapsed} onClick={saveNoteAsToDrawer} Icon={SaveAll}>
                        {t('CharacterSheetPage.SidebarMenu.saveNoteToDrawerAs')}
                     </SidebarButton>
                     <SidebarButton isCollapsed={isCollapsed} onClick={handleExportNote} Icon={Upload}>
                        {t('CharacterSheetPage.SidebarMenu.exportNote')}
                     </SidebarButton>
                     <SidebarButton isCollapsed={isCollapsed} onClick={() => noteImportInputRef.current?.click()} Icon={Download}>
                        {t('CharacterSheetPage.SidebarMenu.importNote')}
                     </SidebarButton>
                     <SidebarButton isCollapsed={isCollapsed} onClick={onExportNoteMarkdown} Icon={FileUp}>
                        {t('CharacterSheetPage.SidebarMenu.exportNoteMarkdown')}
                     </SidebarButton>
                     <SidebarButton isCollapsed={isCollapsed} onClick={() => noteUpdateInputRef.current?.click()} Icon={RefreshCw}>
                        {t('CharacterSheetPage.SidebarMenu.updateNote')}
                     </SidebarButton>
                  </motion.section>
               }

               { activeWindow === 'MAIN_MENU' &&
                  <motion.section layout transition={{ duration: 0.2 }} className={cn(
                     "flex flex-col items-center gap-2 py-2 bg-popover border-b border-border",
                     isCollapsed ? "px-0" : "px-2"
                  )}>
                     <SidebarButton isCollapsed={isCollapsed} onClick={() => workspaceImportInputRef.current?.click()} Icon={FileUp}>
                        {t('CharacterSheetPage.SidebarMenu.importWorkspace')}
                     </SidebarButton>
                  </motion.section>
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
