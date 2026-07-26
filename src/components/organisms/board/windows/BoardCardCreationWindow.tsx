// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { BoardFloatingWindow, CARD_WINDOW_WIDTH } from './BoardFloatingWindow';
import { CardCreationForm } from '@/components/organisms/cards/CardCreationForm';

// -- Type Imports --
import type { GameSystem } from '@/lib/types/drawer';
import type { CreateCardOptions } from '@/lib/types/creation';

/**
 * The board's card-creation panel: a `BoardFloatingWindow` wrapping the card-creation form. The card it
 * makes keeps its game look; this creation chrome is app-token (via the shared window shell).
 */
export function BoardCardCreationWindow({
   game,
   initialScreen,
   clipRect,
   onConfirm,
   onClose,
}: {
   game: GameSystem;
   initialScreen: { x: number; y: number };
   clipRect: { left: number; top: number; width: number; height: number };
   onConfirm: (options: CreateCardOptions) => void;
   onClose: () => void;
}) {
   const { t } = useTranslation();
   return (
      <BoardFloatingWindow
         initialScreen={initialScreen}
         clipRect={clipRect}
         width={CARD_WINDOW_WIDTH}
         title={t('CreateCardDialog.title')}
         onClose={onClose}
      >
         <div className="px-4 pb-3">
            <CardCreationForm game={game} mode="create" allowCharacterCard onConfirm={onConfirm} />
         </div>
      </BoardFloatingWindow>
   );
}
