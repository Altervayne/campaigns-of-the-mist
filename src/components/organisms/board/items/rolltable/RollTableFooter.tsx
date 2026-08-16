// -- React Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Dices } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { RollTableResult } from './RollTableResult';

// -- Hook Imports --
import { useBoardMentionMint } from '@/hooks/board/useBoardMentionMint';

// -- Type Imports --
import type { BoardItem, RollTableBoardContent } from '@/lib/types/board';

/*
 * The roll control and output for a table. The roll itself is owned by the shared roll hook in the item;
 * this pins the result area and the Roll button to the bottom. During a roll the result shows the live
 * text and the button dims; a tapped `{brace}` token in a settled result mints a tracker beside the item.
 * The button stops pointer propagation so a click never moves the item, and no-ops on an empty table.
 */

interface RollTableFooterProps {
   item: BoardItem;
   content: RollTableBoardContent;
   /** The live highlighted-entry text during a roll, or null at rest. */
   liveText: string | null;
   isRolling: boolean;
   onRoll: () => void;
}

export function RollTableFooter({ item, content, liveText, isRolling, onRoll }: RollTableFooterProps) {
   const { t } = useTranslation();
   const handleMentionClick = useBoardMentionMint(item);
   const stopDrag = (event: ReactPointerEvent) => event.stopPropagation();
   const isEmpty = content.entries.length === 0;

   return (
      <div className="flex shrink-0 flex-col">
         <RollTableResult
            lastRoll={content.lastRoll}
            history={content.history ?? []}
            liveText={liveText}
            resultLabel={t('BoardView.rollTableResultLabel')}
            emptyLabel={t('BoardView.rollTableEmptyResult')}
            historyLabel={t('BoardView.rollTableHistory')}
            onMentionClick={handleMentionClick}
         />
         <div className="border-t border-border p-2">
            <button
               type="button"
               disabled={isEmpty}
               onPointerDown={stopDrag}
               onClick={onRoll}
               className={cn(
                  'flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 cursor-pointer',
                  isEmpty && 'pointer-events-none opacity-50',
                  isRolling && 'opacity-80',
               )}
            >
               <Dices className={cn('h-4 w-4', isRolling && 'animate-pulse')} />
               {t('BoardView.rollTableRoll')}
            </button>
         </div>
      </div>
   );
}
