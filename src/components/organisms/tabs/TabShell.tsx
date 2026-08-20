// -- React Imports --
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// -- Icon Imports --
import { X } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Constants --
import { DRAG_TYPES } from '@/lib/constants/dragDrop';

/*
 * The presentational shell shared by every tab kind (character, board): the
 * `useSortable` wrapper, active/inactive styling, scroll-into-view on activate, and the
 * X button. It is purely structural - it knows nothing about characters or boards. The
 * kind-specific components (CharacterTab, BoardTab) supply the label, the leading icon,
 * and the activate/close handlers, and own their own close-confirm dialog.
 *
 * The drag payload (`DRAG_TYPES.TAB`, `tabId`) is identical for every kind, so tab
 * reordering works the same regardless of what the tab holds.
 */

interface TabShellProps {
   /** The tab id; keys the sortable item and the drag payload. */
   tabId: string;
   /** The display label (already resolved, with its kind's untitled fallback). */
   label: string;
   /** The leading icon block (a game crest for characters, a board icon for boards). */
   leadingIcon: ReactNode;
   /** Whether this is the active tab (drives the highlight + scroll-into-view). */
   isActive: boolean;
   /** Activates this tab. */
   onActivate: () => void;
   /** Requests close: the X was clicked. The caller decides whether to confirm first. */
   onRequestClose: () => void;
}

/**
 * Renders the tab chrome around a caller-supplied label + icon. See the file header for
 * the kind split.
 *
 * @param props - See {@link TabShellProps}.
 */
export function TabShell({ tabId, label, leadingIcon, isActive, onActivate, onRequestClose }: TabShellProps) {
   const { t } = useTranslation();

   // The discriminating payload lets the sheet's shared DnD handlers route a tab drag
   // without the leaf knowing about them.
   const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: tabId,
      data: { type: DRAG_TYPES.TAB, tabId },
   });

   // Compose dnd-kit's node ref with a local ref so the active tab can scroll itself
   // into view when activated (or on mount), revealing an off-screen tab.
   const localRef = useRef<HTMLDivElement | null>(null);
   const setRefs = (node: HTMLDivElement | null) => {
      setNodeRef(node);
      localRef.current = node;
   };
   useEffect(() => {
      if (isActive) localRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
   }, [isActive]);

   return (
      <div
         ref={setRefs}
         data-tab-id={tabId}
         style={{ transform: CSS.Translate.toString(transform), transition }}
         className={cn(
            'group relative flex shrink-0 items-center gap-1.5 ml-1.5 border-l border-r border-t border-secondary rounded-t-lg pr-1 max-w-80',
            // Active tab: same fill as the content below, lifted above the strip's
            // bottom border and pulled down 1px to overlap it, so it reads as one
            // connected surface (no seam). Inactive tabs are lighter recessed chips.
            isActive
               ? 'relative z-10 bg-primary text-primary-foreground pb-1'
               : 'bg-muted/40 hover:bg-muted/70',
            // While dragging, the free-floating DragOverlay preview is what moves;
            // dim the in-strip source so its slot reads as a placeholder gap.
            isDragging && 'opacity-30',
         )}
      >
         {/* Icon + label are ONE activate/drag surface so the icon is not a dead zone:
             the whole tab (except the X) clicks to activate and drags to reorder. */}
         <button
            type="button"
            onClick={onActivate}
            title={label}
            {...attributes}
            {...listeners}
            className={cn(
               'flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-2 text-sm cursor-pointer text-left touch-none select-none',
               isActive ? 'text-primary-foreground font-medium' : 'text-muted-foreground',
            )}
         >
            {leadingIcon}
            <span className="min-w-0 flex-1 truncate">{label}</span>
         </button>
         <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onRequestClose}
            aria-label={t('Tabs.closeTab')}
            className={cn(
               'shrink-0 rounded p-1 opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100 cursor-pointer',
               isActive ? 'text-primary-foreground' : 'text-muted-foreground',
            )}
         >
            <X className="h-3.5 w-3.5" />
         </button>
      </div>
   );
}
