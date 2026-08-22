// -- React Imports --
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

// -- Other Library Imports --
import { motion, AnimatePresence } from 'framer-motion';

// -- Basic UI Imports --
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// -- Icon Imports --
import { Trash2, GripVertical, RefreshCw, Edit2, Upload, Globe, FlipHorizontal, BookOpen, GripHorizontal, BookPlus, BookMinus, ThumbsDown, ThumbsUp } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { Variants } from 'framer-motion';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import type { CardViewMode } from '@/lib/types/character';



interface ToolbarHandleProps {
   isEditing: boolean;
   isHovered: boolean;
   cardTheme: string;
   onDelete?: () => void;
   onFlip?: () => void;
   onEditCard?: () => void;
   onExport?: () => void;
   onCycleViewMode?: () => void;
   onStoryTagNegative?: () => void;
   onUpgradeStoryTag?: () => void;
   onDowngradeStoryTheme?: () => void;
   isStoryTagNegative?: boolean;
   cardViewMode?: CardViewMode | null;
   dragAttributes?: DraggableAttributes;
   dragListeners?: SyntheticListenerMap;
   side?: "left" | "right" | "top" | "bottom";
   /**
    * Extra action nodes rendered in the toolbar row beside the grip, for a card whose structural
    * controls live inside the grab toolbar (the sheet journal portals its add/remove-page + bookmark
    * controls here). Only mounted while the toolbar is hovered, so a portal target set from here
    * re-targets on hover/un-hover with the toolbar.
    */
   extraActions?: ReactNode;
};

interface sideVariants {
   left: Variants,
   right: Variants,
   top: Variants,
   bottom: Variants
};

const variants: sideVariants = {
   left: {
      initial: { opacity: 0, x: 38 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 38 },
   },
   right: {
      initial: { opacity: 0, x: -38 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -38 },
   },
   top: {
      initial: { opacity: 0, y: 38 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 38 },
   },
   bottom: {
      initial: { opacity: 0, y: -38 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -38 },
   },
};



/**
 * The shared class for a toolbar action button (`<Button variant="outline" size="icon">`). Exported so a
 * card that portals its own controls INTO this toolbar (the sheet journal) styles them identically to the
 * built-in grip/delete/flip buttons rather than copying the string. The buttons take the card PAPER surface
 * plus a border so they read as raised chips against the toolbar's own popover surface (the two shared a
 * token before, so the buttons vanished into the bar); paper-fg stays readable on paper-bg for any palette.
 * The dark override stops the outline variant's `dark:bg-input` from clobbering the base fill.
 */
export const TOOLBAR_ACTION_BUTTON_CLASS = "h-7 w-7 coarse:h-11 coarse:w-11 cursor-pointer border border-card-border bg-card-paper-bg text-card-paper-fg dark:bg-card-paper-bg";

export const ViewModeIcon = ({ mode }: { mode: CardViewMode | null | undefined }) => {
   if (mode === 'SIDE_BY_SIDE') return <BookOpen className="h-4 w-4 coarse:h-5 coarse:w-5" />;
   if (mode === 'FLIP') return <FlipHorizontal className="h-4 w-4 coarse:h-5 coarse:w-5" />;
   return <Globe className="h-4 w-4 coarse:h-5 coarse:w-5" />;
};

const ViewModeTooltip = ({ mode }: { mode: CardViewMode | null | undefined }) => {
   const { t: t } = useTranslation();

   if (mode === 'SIDE_BY_SIDE') return <p>{t('Tooltips.ViewMode.SideBySide')}</p>;
   if (mode === 'FLIP') return <p>{t('Tooltips.ViewMode.Flipping')}</p>;
   return <p>{t('Tooltips.ViewMode.Global')}</p>;
};



export function ToolbarHandle({ isEditing, isHovered, cardTheme, onDelete,
                              onFlip, onEditCard, onExport, onCycleViewMode,
                              onStoryTagNegative, onUpgradeStoryTag, onDowngradeStoryTheme,
                              isStoryTagNegative, cardViewMode, dragAttributes, dragListeners, side = "left",
                              extraActions }: ToolbarHandleProps) {
   return (
      <AnimatePresence>
         {isHovered && (
            <motion.div
               variants={variants[side]}
               initial="initial"
               animate="animate"
               exit="exit"
               transition={{ duration: 0.2, ease: "easeInOut" }}
               className={cn(
                  "z-0",
                  "absolute flex items-center justify-center",
                  (side === 'left' || side === 'right') && "top-0 h-full flex-col",
                  (side === 'top' || side === 'bottom') && "left-1/2 -translate-x-1/2 w-auto flex-row",
                  // Off-card offset equals the toolbar's cross-axis size so its inner edge sits flush to
                  // the card: fine 38px (28 button + 8 padding + 2 border), coarse 54px (44 + 8 + 2).
                  side === 'left' && "-left-9.5 coarse:-left-13.5",
                  side === 'right' && "-right-9.5 coarse:-right-13.5",
                  side === 'top' && "-top-9.5 coarse:-top-13.5",
                  side === 'bottom' && "-bottom-9.5 coarse:-bottom-13.5",
                  cardTheme
               )}
            >
               <div className={cn(
                  "relative z-0 p-1 flex items-center bg-red",
                  (side === 'left' || side === 'right') ? "flex-col gap-4 border-y-2" : "flex-row gap-4 border-x-2",
                  side === 'left' && "border-l-2 rounded-l-lg",
                  side === 'right' && "border-r-2 rounded-r-lg",
                  side === 'top' && "border-t-2 rounded-t-lg",
                  side === 'bottom' && "border-b-2 rounded-b-lg",
                  "bg-card-popover-bg border-card-border"
               )}>
                  { onFlip && (
                     <Button 
                        variant="outline" 
                        size="icon" 
                        className={TOOLBAR_ACTION_BUTTON_CLASS}
                        onClick={onFlip}
                     >
                        <RefreshCw className="h-4 w-4 coarse:h-5 coarse:w-5" />
                     </Button>
                  )}

                  { isEditing && onEditCard && (
                     <Button 
                        variant="outline" 
                        size="icon" 
                        className={TOOLBAR_ACTION_BUTTON_CLASS}
                        onClick={onEditCard}
                     >
                        <Edit2 className="h-4 w-4 coarse:h-5 coarse:w-5" />
                     </Button>
                  )}

                  { onExport && (
                     <Button 
                        variant="outline" 
                        size="icon" 
                        className={TOOLBAR_ACTION_BUTTON_CLASS}
                        onClick={onExport}
                     >
                        <Upload className="h-4 w-4 coarse:h-5 coarse:w-5" />
                     </Button>
                  )}

                  <div className="flex items-center justify-center cursor-grab text-card-popover-fg h-7 w-7 coarse:h-11 coarse:w-11" {...dragAttributes} {...dragListeners}>
                     { side === "left" || side === "right" ? <GripVertical /> : <GripHorizontal /> }
                  </div>

                  {/* Structural controls a card keeps in the grab toolbar (the journal's add/remove-page +
                      bookmark, portaled here). Rendered bare so the host's `display:contents` slot lets its
                      buttons sit as direct flex children of this row - identical spacing to grip/delete. */}
                  { extraActions }

                  { onStoryTagNegative && (
                     <Button 
                        variant="outline" 
                        size="icon" 
                        className={TOOLBAR_ACTION_BUTTON_CLASS}
                        onClick={onStoryTagNegative}
                     >
                        {
                           isStoryTagNegative ? <ThumbsDown className="h-4 w-4 coarse:h-5 coarse:w-5" /> : <ThumbsUp className="h-4 w-4 coarse:h-5 coarse:w-5" />
                        }
                     </Button>
                  )}

                  { onUpgradeStoryTag && (
                     <Button 
                        variant="outline" 
                        size="icon" 
                        className={TOOLBAR_ACTION_BUTTON_CLASS}
                        onClick={onUpgradeStoryTag}
                     >
                        <BookPlus className="h-4 w-4 coarse:h-5 coarse:w-5"/>
                     </Button>
                  )}

                  { onDowngradeStoryTheme && (
                     <Button 
                        variant="outline" 
                        size="icon" 
                        className={TOOLBAR_ACTION_BUTTON_CLASS}
                        onClick={onDowngradeStoryTheme}
                     >
                        <BookMinus className="h-4 w-4 coarse:h-5 coarse:w-5"/>
                     </Button>
                  )}

                  { onCycleViewMode && (
                     <Tooltip>
                        <TooltipTrigger asChild>
                           <Button
                              variant="outline"
                              size="icon"
                              className={TOOLBAR_ACTION_BUTTON_CLASS}
                              onClick={onCycleViewMode}
                           >
                              <ViewModeIcon mode={cardViewMode} />
                           </Button>
                        </TooltipTrigger>
                        <TooltipContent side='left'><ViewModeTooltip mode={cardViewMode} /></TooltipContent>
                     </Tooltip>
                  )}

                  { isEditing && onDelete &&
                     <Button 
                        variant="destructive" 
                        size="icon" 
                        className="h-7 w-7 coarse:h-11 coarse:w-11 cursor-pointer border border-card-border hover:bg-destructive/60"
                        onClick={onDelete}
                     >
                        <Trash2 className="h-4 w-4 coarse:h-5 coarse:w-5" />
                     </Button>
                  }
               </div>
            </motion.div>
         )}
      </AnimatePresence>
   );
}
