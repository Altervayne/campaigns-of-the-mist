// -- React Imports --
import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';

// -- Icon Imports --
import { ArrowUpRight, Link2, Type, Unlink } from 'lucide-react';

// -- Component Imports --
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { NoteEditorHandle } from '@/components/organisms/note/NoteEditor';
import type { LinkEditSeed, LinkNodeInfo } from '@/components/organisms/note/live/linkNode';

interface MobileNoteLinkSheetProps {
   /** Whether the sheet is shown. */
   isOpen: boolean;
   /** The caret's link; the sheet renders nothing (and can't act) without one. */
   link: LinkNodeInfo | null;
   /** Accessor for the live editor handle (label-edit + remove run on the caret link via the handle). */
   getEditor: () => NoteEditorHandle | null;
   /** Explicit Done / backdrop tap closes the sheet. */
   onClose: () => void;
   /** Follows the link - the same activation bridge as tap-to-follow. Closes the sheet. */
   onOpen: (href: string) => void;
   /** Opens the picker seeded to REPLACE this link's target (keeping its label). Closes the sheet. */
   onChangeTarget: (seed: LinkEditSeed) => void;
}

/*
 * The mobile link options slide-up: the touch stand-in for the desktop floating link-edit bar. Opened from the
 * editing bar's Link chip when the caret sits in a link. Four actions on the current link: Open (follow), Change
 * target (repoint via the picker, keeping the label), Edit label (select the label text to retype), Remove
 * (unwrap to the plain words). Every action closes the sheet. Remove keeps the words, so it is NOT destructive
 * chrome, matching the desktop Unlink. App-token chrome.
 */
export function MobileNoteLinkSheet({ isOpen, link, getEditor, onClose, onOpen, onChangeTarget }: MobileNoteLinkSheetProps) {
   const { t } = useTranslation();

   const open = () => {
      if (link) onOpen(link.href);
      onClose();
   };
   const changeTarget = () => {
      if (link) onChangeTarget({ from: link.from, to: link.to, label: link.label, href: link.href });
      onClose();
   };
   const editLabel = () => {
      getEditor()?.editLinkLabel();
      onClose();
   };
   const remove = () => {
      getEditor()?.removeLink();
      onClose();
   };

   return (
      <MobileBottomSheet isOpen={isOpen && !!link} onClose={onClose}>
         {link && (
            <div className="pb-[env(safe-area-inset-bottom)]">
               <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <span className="text-base font-semibold text-foreground">{t('Common.link')}</span>
                  <button
                     type="button"
                     onClick={onClose}
                     className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground active:bg-muted"
                  >
                     {t('NoteView.tableSheet.done')}
                  </button>
               </div>

               <div className="grid grid-cols-2 gap-2 px-4 py-3">
                  <LinkSheetButton icon={ArrowUpRight} label={t('NoteView.linkEdit.open')} onClick={open} />
                  <LinkSheetButton icon={Link2} label={t('NoteView.linkEdit.changeTarget')} onClick={changeTarget} />
                  <LinkSheetButton icon={Type} label={t('NoteView.linkEdit.editLabel')} onClick={editLabel} />
                  <LinkSheetButton icon={Unlink} label={t('NoteView.linkEdit.remove')} onClick={remove} />
               </div>
            </div>
         )}
      </MobileBottomSheet>
   );
}

/** One big action target: icon over label. Unlink keeps the words, so no action carries destructive chrome. */
function LinkSheetButton({
   icon: Icon,
   label,
   onClick,
}: {
   icon: ComponentType<{ className?: string }>;
   label: string;
   onClick: () => void;
}) {
   return (
      <button
         type="button"
         aria-label={label}
         onClick={onClick}
         className={cn(
            'flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-border px-1.5 py-2 text-center text-xs font-medium leading-tight text-foreground active:bg-muted',
         )}
      >
         <Icon className="h-5 w-5" />
         <span>{label}</span>
      </button>
   );
}
