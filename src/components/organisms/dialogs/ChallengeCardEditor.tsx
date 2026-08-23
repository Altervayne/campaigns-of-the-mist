// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Basic UI Imports --
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// -- Component Imports --
import { ChallengeEditorForm } from './challenge-editor/ChallengeEditorForm';
import { CityChallengeEditorForm } from './challenge-editor/CityChallengeEditorForm';

// -- Type Imports --
import type { Card as CardData } from '@/lib/types/character';

/*
 * The GM Challenge Card editor: a dedicated dialog over the full ChallengeDetails (too rich for inline
 * card editing). The card stays a read-only display; this is its only editor. The per-game form bodies
 * (Legends/generic and City of Mist) live beside this wrapper in `challenge-editor/`; each commits its
 * local working state on Save - the name via `updateCardTitle`, the rest via `updateCardDetails`.
 */

interface ChallengeCardEditorProps {
   isOpen: boolean;
   onOpenChange: (isOpen: boolean) => void;
   /** The challenge card being edited, or null when the dialog is closed. */
   card: CardData | null;
   modal?: boolean;
}

export function ChallengeCardEditor({ isOpen, onOpenChange, card, modal = true }: ChallengeCardEditorProps) {
   const { t } = useTranslation();

   return (
      <Dialog open={isOpen} onOpenChange={onOpenChange} modal={modal}>
         {/* The dialog is portaled, but React still bubbles its synthetic pointer events through the tree - on
             the board that reaches the host item's move/select handlers and deselects it, unmounting the
             toolbar this editor lives in (it closes on any click). Stop the pointer at the content root. */}
         <DialogContent onPointerDown={(event) => event.stopPropagation()} className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
               <DialogTitle>{t('ChallengeCard.editor.title')}</DialogTitle>
               <DialogDescription>{t('ChallengeCard.editor.description')}</DialogDescription>
            </DialogHeader>
            {card && (card.details.game === 'CITY_OF_MIST'
               ? <CityChallengeEditorForm card={card} onDone={() => onOpenChange(false)} />
               : <ChallengeEditorForm card={card} onDone={() => onOpenChange(false)} />)}
         </DialogContent>
      </Dialog>
   );
}
