// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';
import { useDroppable } from '@dnd-kit/core';

// -- Icon Imports --
import { LayoutGrid, NotebookPen, Upload } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { Variants } from 'framer-motion';
import type { ActiveDragItem } from '@/lib/utils/dnd';


const overlayVariants: Variants = {
   inactive: {
      opacity: 0,
      zIndex: -1,
      transition: { duration: 0.2, ease: 'easeInOut' },
   },
   active: {
      opacity: 1,
      zIndex: 20,
      transition: { duration: 0.2, ease: 'easeInOut' },
   },
};

interface CharacterLoadDropZoneProps {
   activeDragItem: ActiveDragItem;
   /** A board or note owns the surface: it captures a character drop, so this load-to-tab zone steps aside. */
   isBoardActive?: boolean;
}



export function CharacterLoadDropZone({ activeDragItem, isBoardActive = false }: CharacterLoadDropZoneProps) {
   const { t: t } = useTranslation();

   const dragType = activeDragItem && 'content' in activeDragItem ? activeDragItem.type : null;
   // A character loads to a tab here, but is disabled while a board/note owns the surface (there the
   // board makes an element; a note takes the whole tab). A board or note always opens its own tab -
   // never embedded here - so those zones are active in every window.
   const isCharacterDrag = dragType === 'FULL_CHARACTER_SHEET' && !isBoardActive;
   const isBoardDrag = dragType === 'FULL_BOARD';
   const isNoteDrag = dragType === 'NOTE';
   const isActive = isCharacterDrag || isBoardDrag || isNoteDrag;

   const { setNodeRef, isOver } = useDroppable({
      id: 'main-character-drop-zone',
      disabled: !isActive
   });



   return (
      <motion.div
         ref={setNodeRef}
         className="relative w-full h-full inset-0 flex items-center justify-center p-3 bg-secondary/60 backdrop-blur-sm"
         variants={overlayVariants}
         initial="inactive"
         animate={isActive ? 'active' : 'inactive'}
      >
         {isActive && (
            <div
               className={cn(
                  'flex flex-col items-center justify-center w-full h-full text-center p-36 border-4 border-dashed border-primary/30 transition-colors',
                  { 'bg-primary/10': isOver }
               )}
            >
               {isBoardDrag ? <LayoutGrid className="mx-auto h-12 w-12" /> : isNoteDrag ? <NotebookPen className="mx-auto h-12 w-12" /> : <Upload className="mx-auto h-12 w-12" />}
               <p className="mt-2 font-semibold">{t(isBoardDrag ? 'WorkspacePage.dropToOpenBoard' : isNoteDrag ? 'WorkspacePage.dropToOpenNote' : 'WorkspacePage.dropToLoadCharacter')}</p>
            </div>
         )}
      </motion.div>
   );
}