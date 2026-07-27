// -- React Imports --
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// -- Type Imports --
import type { Character } from '@/lib/types/character';
import type { Board, Note } from '@/lib/types/board';

interface SidebarUpdateDialogsProps {
   isResetDialogOpen: boolean;
   setIsResetDialogOpen: Dispatch<SetStateAction<boolean>>;
   onResetCharacter: () => void;
   pendingCharacterUpdate: Character | null;
   setPendingCharacterUpdate: Dispatch<SetStateAction<Character | null>>;
   pendingBoardUpdate: Board | null;
   setPendingBoardUpdate: Dispatch<SetStateAction<Board | null>>;
   pendingNoteUpdate: { note: Note; replaceCover: boolean } | null;
   setPendingNoteUpdate: Dispatch<SetStateAction<{ note: Note; replaceCover: boolean } | null>>;
   onConfirmCharacterUpdate: () => void;
   onConfirmBoardUpdate: () => void;
   onConfirmNoteUpdate: () => void;
}

// The destructive-confirm dialogs: reset-character and the three update-in-place confirms. Each update
// dialog is open while its `pending*` value is set; dismissing clears the stash.
export function SidebarUpdateDialogs({
   isResetDialogOpen,
   setIsResetDialogOpen,
   onResetCharacter,
   pendingCharacterUpdate,
   setPendingCharacterUpdate,
   pendingBoardUpdate,
   setPendingBoardUpdate,
   pendingNoteUpdate,
   setPendingNoteUpdate,
   onConfirmCharacterUpdate,
   onConfirmBoardUpdate,
   onConfirmNoteUpdate,
}: SidebarUpdateDialogsProps) {
   const { t } = useTranslation();

   return (
      <>
         <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>{t('CharacterSheetPage.SidebarMenu.resetConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                     {t('CharacterSheetPage.SidebarMenu.resetConfirmDescription')}
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">{t('CharacterSheetPage.SidebarMenu.resetConfirmCancelButton')}</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer" onClick={onResetCharacter}>{t('CharacterSheetPage.SidebarMenu.resetConfirmButton')}</AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>

         <AlertDialog open={pendingCharacterUpdate !== null} onOpenChange={(open) => { if (!open) setPendingCharacterUpdate(null); }}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>{t('CharacterSheetPage.SidebarMenu.updateCharacterConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('CharacterSheetPage.SidebarMenu.updateCharacterConfirmDescription')}</AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">{t('CharacterSheetPage.SidebarMenu.updateConfirmCancelButton')}</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer" onClick={onConfirmCharacterUpdate}>{t('CharacterSheetPage.SidebarMenu.updateConfirmButton')}</AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>

         <AlertDialog open={pendingBoardUpdate !== null} onOpenChange={(open) => { if (!open) setPendingBoardUpdate(null); }}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>{t('CharacterSheetPage.SidebarMenu.updateBoardConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('CharacterSheetPage.SidebarMenu.updateBoardConfirmDescription')}</AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">{t('CharacterSheetPage.SidebarMenu.updateConfirmCancelButton')}</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer" onClick={onConfirmBoardUpdate}>{t('CharacterSheetPage.SidebarMenu.updateConfirmButton')}</AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>

         <AlertDialog open={pendingNoteUpdate !== null} onOpenChange={(open) => { if (!open) setPendingNoteUpdate(null); }}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>{t('CharacterSheetPage.SidebarMenu.updateNoteConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('CharacterSheetPage.SidebarMenu.updateNoteConfirmDescription')}</AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">{t('CharacterSheetPage.SidebarMenu.updateConfirmCancelButton')}</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer" onClick={onConfirmNoteUpdate}>{t('CharacterSheetPage.SidebarMenu.updateConfirmButton')}</AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   );
}
