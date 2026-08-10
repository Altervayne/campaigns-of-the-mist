// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { BookOpen, Code, Layers, ListTree, MoreHorizontal, PenLine } from 'lucide-react';

// -- Basic UI Imports --
import { IconButton } from '@/components/ui/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// -- Utils Imports --
import { cn } from '@/lib/utils';

interface MobileNoteTopBarProps {
   /** Read-only note name for orientation (truncated). */
   title: string;
   /** True in the editable modes (Live/Source); false in Reading. */
   isEditing: boolean;
   /** True in Source; drives the overflow menu's source toggle. */
   isSource: boolean;
   /** Flips Reading <-> Edit (Edit = Live). */
   onToggleReadEdit: () => void;
   /** Flips Source <-> Live from the overflow menu. */
   onToggleSource: () => void;
   /** Opens the outline sheet. */
   onOpenOutline: () => void;
   /** Opens the workspace switcher (consistent with the sheet's Layers trigger). */
   onOpenSwitcher: () => void;
   /** Docks the Layers trigger on the leading (thumb) edge and clusters the actions there. */
   isLeftHanded: boolean;
   /** FAB mode relocates the Read + Source toggles into the toolbelt, so the bar sheds them here. */
   isMobileFABMode: boolean;
}

/*
 * The note surface's slim top bar (app-token chrome, all modes). The Layers switcher trigger sits on the
 * leading edge (matching the character sheet), the read-only note name fills the middle, and the action
 * cluster (outline, Reading/Edit toggle, overflow) sits thumb-side. Owns the top of the viewport, so it
 * carries the status-bar inset.
 */
export function MobileNoteTopBar({
   title,
   isEditing,
   isSource,
   onToggleReadEdit,
   onToggleSource,
   onOpenOutline,
   onOpenSwitcher,
   isLeftHanded,
   isMobileFABMode,
}: MobileNoteTopBarProps) {
   const { t } = useTranslation();
   const [isMoreOpen, setIsMoreOpen] = useState(false);

   return (
      <header
         className={cn(
            'flex items-center gap-1 border-b border-border bg-popover px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]',
            // Leading edge (Layers) docks thumb-side; reversing the row mirrors the whole bar for a left-handed layout.
            isLeftHanded && 'flex-row-reverse',
         )}
      >
         {/* Note name: read-only, fills the free space. min-w-0 lets it truncate instead of pushing the actions out. */}
         <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-foreground">
            {title}
         </span>

         {/* Action cluster: outline, plus the Reading/Edit toggle + Source overflow in docks mode. FAB mode
             moves those two toggles into the toolbelt, so they drop off the bar here. */}
         <IconButton variant="ghost" size="sm" onClick={onOpenOutline} aria-label={t('NoteView.outline.toggle')}>
            <ListTree className="h-5 w-5" />
         </IconButton>
         {!isMobileFABMode && (
            <>
               <IconButton
                  variant="ghost"
                  size="sm"
                  onClick={onToggleReadEdit}
                  aria-label={isEditing ? t('NoteView.mobile.read') : t('NoteView.mobile.edit')}
               >
                  {isEditing ? <BookOpen className="h-5 w-5" /> : <PenLine className="h-5 w-5" />}
               </IconButton>
               <Popover open={isMoreOpen} onOpenChange={setIsMoreOpen}>
                  <PopoverTrigger asChild>
                     <IconButton variant="ghost" size="sm" aria-label={t('NoteView.mobile.more')}>
                        <MoreHorizontal className="h-5 w-5" />
                     </IconButton>
                  </PopoverTrigger>
                  <PopoverContent align="end" sideOffset={6} className="w-auto rounded-lg border border-border bg-popover p-1 shadow-md">
                     {/* Source is the demoted third mode: a plain toggle here rather than a primary segment. */}
                     <button
                        type="button"
                        onClick={() => { setIsMoreOpen(false); onToggleSource(); }}
                        className="flex w-full items-center gap-2 rounded p-2 text-left text-sm text-popover-foreground hover:bg-muted cursor-pointer"
                     >
                        <Code className="h-4 w-4" />
                        <span className="whitespace-nowrap">{isSource ? t('NoteView.mobile.exitSource') : t('NoteView.mobile.viewSource')}</span>
                     </button>
                  </PopoverContent>
               </Popover>
            </>
         )}

         {/* Layers trigger: the switcher opener, on the leading edge (matching the sheet). */}
         <IconButton
            variant="secondary"
            size="sm"
            onClick={onOpenSwitcher}
            aria-label={t('Workspace.openSwitcher')}
            className={cn('shrink-0', isLeftHanded ? 'mr-1' : 'ml-1')}
         >
            <Layers className="h-5 w-5" />
         </IconButton>
      </header>
   );
}
