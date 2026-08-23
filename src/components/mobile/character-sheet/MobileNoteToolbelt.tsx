// -- Library Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import ToolbeltBottomSheet from '@/components/mobile/toolbelt/ToolbeltBottomSheet';
import ToolbeltFAB from '@/components/mobile/toolbelt/ToolbeltFAB';
import MobileSaveToDrawerSheet from '@/components/mobile/character-sheet/MobileSaveToDrawerSheet';

// -- Hook Imports --
import { useMobileNoteSave } from '@/hooks/mobile/useMobileNoteSave';
import { useMobileNoteFileActions } from '@/hooks/mobile/useMobileNoteFileActions';

// -- Icon Imports --
import { BookOpen, Code, Download, FileUp, PenLine, RefreshCw, Save, SaveAll, Upload } from 'lucide-react';

// -- Type Imports --
import type { ToolbeltAction } from '@/lib/types/toolbelt';

interface MobileNoteToolbeltProps {
   isOpen: boolean;
   onOpenChange: (open: boolean) => void;
   /** FAB mode adds the Read + Source toggles (relocated from the top bar); docks mode carries Save / Save As only. */
   isMobileFABMode: boolean;
   /** True in the editable modes (Live/Source); drives the Read toggle label + icon. */
   isEditing: boolean;
   /** True in Source; drives the Source toggle label + icon. */
   isSource: boolean;
   onToggleReadEdit: () => void;
   onToggleSource: () => void;
   /** Hides the wrench while the nav menu FAB is expanded, so the two never overlap (FAB mode only). */
   isMenuFABExpanded?: boolean;
}

/*
 * The note surface's toolbelt: Save / Save As in both modes, plus the Read + Source mode toggles in FAB mode
 * (where the top bar sheds them, so every note action lives in the wrench). Renders the same generic toolbelt
 * presentation the character sheet uses, driven by note-specific global actions.
 */
export default function MobileNoteToolbelt({
   isOpen,
   onOpenChange,
   isMobileFABMode,
   isEditing,
   isSource,
   onToggleReadEdit,
   onToggleSource,
   isMenuFABExpanded,
}: MobileNoteToolbeltProps) {
   const { t } = useTranslation();
   const { save, openSaveAs, confirmSaveAs, isNameSheetOpen, setIsNameSheetOpen, nameSheetDefault } = useMobileNoteSave();
   const { exportNote, exportMarkdown, importNote, updateNote, dialogs } = useMobileNoteFileActions();

   const allActions: ToolbeltAction[] = [
      {
         id: 'note-save',
         label: t('WorkspacePage.SidebarMenu.saveNoteToDrawer'),
         icon: Save,
         onClick: () => { void save(); },
         group: 'workspace',
         show: true,
      },
      {
         id: 'note-save-as',
         label: t('WorkspacePage.SidebarMenu.saveNoteToDrawerAs'),
         icon: SaveAll,
         onClick: openSaveAs,
         group: 'workspace',
         show: true,
      },
      {
         id: 'note-export',
         label: t('WorkspacePage.SidebarMenu.exportNote'),
         icon: Upload,
         onClick: exportNote,
         group: 'workspace',
         show: true,
      },
      {
         id: 'note-import',
         label: t('WorkspacePage.SidebarMenu.importNote'),
         icon: Download,
         onClick: importNote,
         group: 'workspace',
         show: true,
      },
      {
         id: 'note-export-md',
         label: t('WorkspacePage.SidebarMenu.exportNoteMarkdown'),
         icon: FileUp,
         onClick: exportMarkdown,
         group: 'workspace',
         show: true,
      },
      {
         id: 'note-update',
         label: t('WorkspacePage.SidebarMenu.updateNote'),
         icon: RefreshCw,
         onClick: updateNote,
         group: 'workspace',
         show: true,
      },
      // FAB mode relocates the mode toggles off the top bar and into the wrench.
      {
         id: 'note-read',
         label: isEditing ? t('NoteView.mobile.read') : t('Common.edit'),
         icon: isEditing ? BookOpen : PenLine,
         onClick: onToggleReadEdit,
         group: 'edit',
         show: isMobileFABMode,
      },
      {
         id: 'note-source',
         label: isSource ? t('NoteView.mobile.exitSource') : t('NoteView.mobile.viewSource'),
         icon: Code,
         onClick: onToggleSource,
         group: 'edit',
         show: isMobileFABMode,
      },
   ];
   const globalActions = allActions.filter((action) => action.show);

   return (
      <>
         {!isMobileFABMode ? (
            <ToolbeltBottomSheet
               isOpen={isOpen}
               onOpenChange={onOpenChange}
               itemActions={[]}
               globalActions={globalActions}
            />
         ) : (
            <ToolbeltFAB
               isOpen={isOpen}
               onOpenChange={onOpenChange}
               itemActions={[]}
               globalActions={globalActions}
               isMenuFABExpanded={isMenuFABExpanded}
               clearsNoteBar={isEditing}
            />
         )}

         <MobileSaveToDrawerSheet
            isOpen={isNameSheetOpen}
            onClose={() => setIsNameSheetOpen(false)}
            onConfirm={confirmSaveAs}
            defaultName={nameSheetDefault}
         />

         {dialogs}
      </>
   );
}
