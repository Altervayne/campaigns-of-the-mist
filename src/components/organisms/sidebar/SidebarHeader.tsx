// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Icon Imports --
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { CharacterUndoRedoControls } from '../../molecules/CharacterUndoRedoControls';
import { BoardUndoRedoControls } from '../../molecules/BoardUndoRedoControls';
import { NoteUndoRedoControls } from '../../molecules/NoteUndoRedoControls';

// -- Type Imports --
import type { ActiveWindow } from '@/lib/character/activeWindow';

interface SidebarHeaderProps {
   isCollapsed: boolean;
   activeWindow: ActiveWindow;
   onToggleCollapse: () => void;
}

// The rail header: title + collapse toggle, then the context undo/redo control switched on the active
// window. A PDF is read-only, so it carries no undo/redo control.
export function SidebarHeader({ isCollapsed, activeWindow, onToggleCollapse }: SidebarHeaderProps) {
   const { t } = useTranslation();

   return (
      <motion.section layout transition={{ duration: 0.2 }} className="w-full">
         <motion.div layout className={cn(
            "flex w-full items-center px-2",
            isCollapsed ? "justify-center" : "justify-between",
            activeWindow === 'MAIN_MENU' && "pb-2 border-b-2 border-border"
         )}>
            {!isCollapsed && <h2 className="text-lg font-bold">{t('WorkspacePage.SidebarMenu.sidebarTitle')}</h2>}

            <div data-tutorial="menu-collapse-button" onClick={onToggleCollapse} className="rounded p-2 hover:bg-muted cursor-pointer">
               {isCollapsed ? <PanelLeftOpen className="h-6 w-6" /> : <PanelLeftClose className="h-6 w-6" />}
            </div>
         </motion.div>

         { activeWindow === 'PLAY_AREA' &&
            <div className="py-2 border-b-2 border-border">
               <CharacterUndoRedoControls isCollapsed={isCollapsed} />
            </div>
         }

         { activeWindow === 'BOARD' &&
            <div className="py-2 border-b-2 border-border">
               <BoardUndoRedoControls isCollapsed={isCollapsed} />
            </div>
         }

         { activeWindow === 'NOTE' &&
            <div className="py-2 border-b-2 border-border">
               <NoteUndoRedoControls isCollapsed={isCollapsed} />
            </div>
         }
      </motion.section>
   );
}
