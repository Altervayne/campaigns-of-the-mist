// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Icon Imports --
import { Ban } from 'lucide-react';

// -- Type Imports --
import type { Variants } from 'framer-motion';


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

/**
 * Negative counterpart to {@link import('./CharacterLoadDropzone').CharacterLoadDropZone}:
 * a large, purely indicative overlay over the character-sheet area, shown for the
 * whole drag of a drawer component that is incompatible with the loaded character
 * (a different game system), signalling it cannot be dropped there.
 *
 * It is `pointer-events-none` and NOT a droppable, so it never intercepts the drag it
 * describes, it only explains why the drop will be rejected. `absolute inset-0`
 * (rather than the load zone's `relative`) so it overlays without affecting layout.
 *
 * @param props.active - Whether an incompatible component is currently being dragged.
 */
export function CannotDropOverlay({ active }: { active: boolean }) {
   const { t } = useTranslation();

   return (
      <motion.div
         aria-hidden
         className="pointer-events-none absolute inset-0 flex items-center justify-center p-3 bg-destructive/10 backdrop-blur-sm"
         variants={overlayVariants}
         initial="inactive"
         animate={active ? 'active' : 'inactive'}
      >
         {active && (
            <div className="flex flex-col items-center justify-center w-full h-full text-center p-36 border-4 border-dashed border-destructive/40 text-destructive">
               <Ban className="mx-auto h-12 w-12" />
               <p className="mt-2 font-semibold">{t('WorkspacePage.cannotDropWrongGame')}</p>
            </div>
         )}
      </motion.div>
   );
}
