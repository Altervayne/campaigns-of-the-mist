// -- React Imports --
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useStore } from 'zustand';

// -- Icon Imports --
import { X } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Store Imports --
import { getOrCreateInstance } from '@/lib/character/characterStoreRegistry';
import { getOrCreateBoardInstance } from '@/lib/board/boardStoreRegistry';
import { getOrCreateNoteInstance } from '@/lib/notes/noteStoreRegistry';

// -- Constants --
import { getGameVisual, BOARD_VISUAL, NOTE_VISUAL } from '@/lib/constants/gameVisuals';

// -- Type Imports --
import type { OpenTab } from '@/lib/character/tabManagerStore';

/**
 * Presentational preview of a tab, rendered inside a dnd-kit `<DragOverlay>` so the
 * dragged tab floats free of the strip's `overflow-x-auto` clipping and follows the
 * cursor. It mirrors a real {@link import('./Tab').Tab} - the icon block and the
 * live-bound label - but has no activate/close handlers (it is purely visual). Like the
 * real tab, it is kind-aware: a board crest + board name for board tabs, a game crest +
 * character name otherwise.
 *
 * @param props.tab - The tab being dragged (its `type` selects the kind, its `id` keys the store read).
 */
export function TabDragPreview({ tab }: { tab: OpenTab }) {
   if (tab.type === 'board') return <BoardTabPreview tab={tab} />;
   if (tab.type === 'note') return <NoteTabPreview tab={tab} />;
   return <CharacterTabPreview tab={tab} />;
}

/** The shared free-floating chip: rounded on all four corners (the real tab is rounded-top only) with a shadow. */
function TabPreviewChip({ icon, label }: { icon: ReactNode; label: string }) {
   return (
      <div className="flex h-full w-full items-center gap-1.5 overflow-hidden rounded-[10px] border border-border bg-background shadow-lg cursor-grabbing pr-1">
         {icon}
         <span className="min-w-0 flex-1 truncate py-2 text-sm font-medium text-foreground">{label}</span>
         <span aria-hidden className="shrink-0 rounded p-1 text-muted-foreground opacity-60">
            <X className="h-3.5 w-3.5" />
         </span>
      </div>
   );
}

function CharacterTabPreview({ tab }: { tab: OpenTab }) {
   const { t } = useTranslation();
   const instance = useMemo(() => getOrCreateInstance(tab.id), [tab.id]);
   const name = useStore(instance, (state) => state.character?.name);
   const game = useStore(instance, (state) => state.character?.game);
   const label = name && name.trim().length > 0 ? name : t('Tabs.untitled');

   const gameVisual = getGameVisual(game);
   const GameIcon = gameVisual.Icon;

   return (
      <TabPreviewChip
         label={label}
         icon={
            <div
               aria-hidden
               className={cn(
                  'ml-2 my-1.5 flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-white/25',
                  gameVisual.gradient,
               )}
            >
               <GameIcon className="h-4 w-4 text-white" />
            </div>
         }
      />
   );
}

function BoardTabPreview({ tab }: { tab: OpenTab }) {
   const { t } = useTranslation();
   const instance = useMemo(() => getOrCreateBoardInstance(tab.id), [tab.id]);
   const name = useStore(instance, (state) => state.name);
   const label = name && name.trim().length > 0 ? name : t('Tabs.untitledBoard');
   const BoardIcon = BOARD_VISUAL.Icon;

   return (
      <TabPreviewChip
         label={label}
         icon={
            <div
               aria-hidden
               className={cn('ml-2 my-1.5 flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-white/25', BOARD_VISUAL.gradient)}
            >
               <BoardIcon className="h-4 w-4 text-white" />
            </div>
         }
      />
   );
}

function NoteTabPreview({ tab }: { tab: OpenTab }) {
   const { t } = useTranslation();
   const instance = useMemo(() => getOrCreateNoteInstance(tab.id), [tab.id]);
   const title = useStore(instance, (state) => state.note?.title);
   const label = title && title.trim().length > 0 ? title : t('Common.untitledNote');
   const NoteIcon = NOTE_VISUAL.Icon;

   return (
      <TabPreviewChip
         label={label}
         icon={
            <div
               aria-hidden
               className={cn('ml-2 my-1.5 flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-white/25', NOTE_VISUAL.gradient)}
            >
               <NoteIcon className="h-4 w-4 text-white" />
            </div>
         }
      />
   );
}
