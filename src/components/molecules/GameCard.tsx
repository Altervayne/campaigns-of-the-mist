// -- React Imports --
import React from 'react';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Icon Imports --
import { Feather } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

/*
 * Shared game-selection card, used by the tab-type chooser (the MainMenu landing + the New Tab
 * dialog) so the two stay visually identical. It fills its container width (the chooser lays the
 * character cards in a 3-up grid and the board card full-width), at a fixed height.
 */

interface GameCardProps {
   /** Game title (already translated). */
   title: string;
   /** Game subtitle/tagline (already translated). */
   subtitle: string;
   /** The accent icon node (coloured), rendered in the card's icon chip. */
   icon: React.ReactNode;
   /** Whether the card is the selected one (accent border + feather badge). */
   isSelected: boolean;
   /** Selection handler. */
   onClick: () => void;
   /** Tailwind gradient classes for the faded background wash. */
   gradient: string;
}

/**
 * A selectable game card: a gradient-washed tile with an icon chip, title, and
 * subtitle, plus a feather badge when selected.
 *
 * @param props - See {@link GameCardProps}.
 */
export const GameCard: React.FC<GameCardProps> = ({ title, subtitle, icon, isSelected, onClick, gradient }) => {
   return (
      <motion.button
         onClick={onClick}
         className={cn(
            'relative overflow-hidden rounded-xl text-left transition-all cursor-pointer border-2 bg-card hover:shadow-xl',
            'w-full h-36 p-4',
            isSelected ? 'border-primary shadow-lg ring-4 ring-primary/20' : 'border-border hover:border-primary/50',
         )}
      >
         <div className={cn('absolute inset-0 opacity-10 transition-opacity', isSelected && 'opacity-20', gradient)} />

         <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-start justify-between">
               <div className="p-3 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm">{icon}</div>
               {isSelected && (
                  <motion.div
                     initial={{ scale: 0, rotate: -180 }}
                     animate={{ scale: 1, rotate: 0 }}
                     className="p-1.5 rounded-full bg-primary text-primary-foreground"
                  >
                     <Feather className="h-4 w-4" />
                  </motion.div>
               )}
            </div>

            <div>
               <h3 className="font-bold text-foreground mb-1 text-xl">{title}</h3>
               <p className="text-muted-foreground text-sm">{subtitle}</p>
            </div>
         </div>
      </motion.button>
   );
};
