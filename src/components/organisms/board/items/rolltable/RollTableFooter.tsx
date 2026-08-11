// -- React Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import cuid from 'cuid';

// -- Icon Imports --
import { Dices } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { appendRollResult, rollOnTable } from '@/lib/rolltable/rollOnTable';

// -- Component Imports --
import { RollTableResult } from './RollTableResult';

// -- Hook Imports --
import { useBoardMentionMint } from '@/hooks/board/useBoardMentionMint';

// -- Type Imports --
import type { BoardItem, BoardItemContent, RollTableBoardContent } from '@/lib/types/board';
import type { RollResultEntry } from '@/lib/rolltable/types';

/*
 * The roll control and output for a table. Rolling reads the COMMITTED entries (never the edit draft),
 * picks one by weight, and writes the result plus a capped history through the item's non-undoable cache so
 * a roll never lands on the undo stack. A tapped `{brace}` token in the shown result mints a tracker beside
 * the item. The Roll button pins to the bottom, stops pointer propagation so a click never moves the item,
 * and no-ops on an empty table.
 */

interface RollTableFooterProps {
   item: BoardItem;
   content: RollTableBoardContent;
   onCacheLastKnown: (id: string, content: BoardItemContent) => void;
}

export function RollTableFooter({ item, content, onCacheLastKnown }: RollTableFooterProps) {
   const { t } = useTranslation();
   const handleMentionClick = useBoardMentionMint(item);
   const stopDrag = (event: ReactPointerEvent) => event.stopPropagation();
   const isEmpty = content.entries.length === 0;

   const roll = () => {
      const picked = rollOnTable(content.entries);
      if (!picked) return;
      const result: RollResultEntry = { id: cuid(), entryId: picked.id, text: picked.text };
      const next: RollTableBoardContent = { ...content, lastRoll: result, history: appendRollResult(content.history ?? [], result) };
      onCacheLastKnown(item.id, next);
   };

   return (
      <div className="flex shrink-0 flex-col">
         <RollTableResult
            lastRoll={content.lastRoll}
            history={content.history ?? []}
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
               onClick={roll}
               className={cn(
                  'flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 cursor-pointer',
                  isEmpty && 'pointer-events-none opacity-50',
               )}
            >
               <Dices className="h-4 w-4" />
               {t('BoardView.rollTableRoll')}
            </button>
         </div>
      </div>
   );
}
