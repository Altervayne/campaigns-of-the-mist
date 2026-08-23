// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { PlusCircle } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';



interface AddCardButtonProps {
   onClick: () => void;
}



/**
 * The zero-card placeholder on the mobile carousel: a dashed stand-in at the card
 * footprint that opens the add menu (card, portrait, or journal). Its type scale is
 * sized for that 250px footprint, not a desktop column.
 */
export function AddCardButton({ onClick }: AddCardButtonProps) {
   const { t: t } = useTranslation();

   return (
      <div
         data-tutorial="add-card-button"
         onClick={onClick}
         className={cn(
            "cursor-pointer flex flex-col gap-3 items-center justify-center min-w-62.5 w-62.5 max-h-150 h-150 p-4",
            "rounded-lg border-2 border-dashed border-border text-muted-foreground text-center bg-muted/50",
            "hover:text-foreground hover:border-foreground transition-all duration-150"
         )}
      >
         <PlusCircle className="w-7 h-7" />
         <span className="text-lg font-semibold">{t('WorkspacePage.addElement')}</span>
      </div>
   );
}
