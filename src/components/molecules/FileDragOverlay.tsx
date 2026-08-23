// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { AnimatePresence, motion } from 'framer-motion';

// -- Icon Imports --
import { Download } from 'lucide-react';



interface FileDragOverlayProps {
   isDragActive: boolean;
}

/**
 * Full-page overlay shown while a file is being dragged over the character sheet,
 * prompting the user to drop it to import.
 */
export function FileDragOverlay({ isDragActive }: FileDragOverlayProps) {
   const { t } = useTranslation();

   return (
      <AnimatePresence>
         {isDragActive && (
            <motion.div
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="absolute inset-0 z-20 flex items-center justify-center p-3 bg-card/80 backdrop-blur-sm"
            >
               <div className="flex flex-col items-center justify-center w-full h-full text-center p-12 border-4 border-dashed border-primary/30">
                  <Download className="mx-auto h-12 w-12 text-primary" />
                  <p className="mt-2 font-semibold text-foreground">
                     {t('WorkspacePage.dropToImport')}
                  </p>
               </div>
            </motion.div>
         )}
      </AnimatePresence>
   );
}
