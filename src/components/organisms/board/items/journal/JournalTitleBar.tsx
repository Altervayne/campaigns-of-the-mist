// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { JournalTitle } from './JournalTitle';

// -- Type Imports --
import type { RefObject } from 'react';

/**
 * The notebook's multiline markdown heading - an auto-growing textarea while editing (Enter adds a line,
 * never commits), inline-rendered markdown at rest (wraps, clamped to a few lines so a long title can't eat
 * the journal). A body click on it falls through to select. Both branches render here: mounting the textarea
 * alone would unmount it on the editing->false edge, so its flush and the buffer's falling-edge flush would
 * both fire and split one edit into two commands.
 */
export function JournalTitleBar({
   isEditing,
   storedTitle,
   titleText,
   titleAreaRef,
   onTitleChange,
   onCommitTitle,
   onRequestSelect,
}: {
   isEditing: boolean;
   /** The committed title. The resting branch renders THIS, not the buffer - the falling-edge commit lands a render later. */
   storedTitle: string;
   /** The live buffer, edited in the textarea. */
   titleText: string;
   titleAreaRef: RefObject<HTMLTextAreaElement | null>;
   onTitleChange: (value: string) => void;
   onCommitTitle: () => void;
   onRequestSelect: () => void;
}) {
   const { t } = useTranslation();

   return (
      <div className="flex shrink-0 items-start border-b border-paper-border bg-paper-primary text-paper-primary-foreground px-1.5 py-1">
         {isEditing ? (
            <textarea
               ref={titleAreaRef}
               value={titleText}
               onChange={(event) => onTitleChange(event.target.value)}
               onFocus={onRequestSelect}
               onBlur={onCommitTitle}
               onPointerDown={(event) => event.stopPropagation()}
               placeholder={t('BoardView.journalTitlePlaceholder')}
               rows={1}
               // Editing -> the board's wheel listener skips this so the wheel scrolls the title, not zoom.
               data-board-wheel-scroll
               className="max-h-24 w-full resize-none overflow-y-auto bg-transparent text-sm font-semibold leading-snug outline-none placeholder:text-paper-primary-foreground/50 cursor-text"
            />
         ) : (
            <div className="line-clamp-3 w-full whitespace-pre-wrap break-words text-sm font-semibold leading-snug">
               {storedTitle.trim()
                  ? <JournalTitle content={storedTitle} />
                  : <span className="text-paper-primary-foreground/50">{t('BoardView.journalTitlePlaceholder')}</span>}
            </div>
         )}
      </div>
   );
}
