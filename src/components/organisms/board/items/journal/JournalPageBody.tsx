// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { NoteMarkdown } from '@/components/molecules/NoteMarkdown';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { RefObject } from 'react';
import type { MentionSegment } from '@/lib/challenge/parseMentions';

/**
 * Editing -> edit the page's raw Markdown; otherwise -> render it (inheriting the theme color). The rendered
 * block is pointer-transparent, so a body click falls through to select (then edit). Both branches render
 * here: mounting the textarea alone would unmount it on the editing->false edge, so its flush and the
 * buffer's falling-edge flush would both fire and split one edit into two commands. Both branches read the
 * BUFFER, so leaving editing shows the just-typed text immediately.
 */
export function JournalPageBody({
   isEditing,
   touch = false,
   paddingBottom,
   text,
   pageAreaRef,
   onTextChange,
   onCommit,
   onRequestSelect,
   onMentionClick,
}: {
   isEditing: boolean;
   /** Mobile reader: the editor grows to 16px (no iOS focus-zoom) and the resting page scrolls its own overflow. */
   touch?: boolean;
   /** Extra bottom padding on the scroll surface so the last line / caret can clear a floating control that rests over it. */
   paddingBottom?: string;
   /** The live buffer. Rendered by BOTH branches, unlike the title bar's resting branch. */
   text: string;
   pageAreaRef: RefObject<HTMLTextAreaElement | null>;
   onTextChange: (value: string) => void;
   onCommit: () => void;
   onRequestSelect: () => void;
   onMentionClick: (segment: MentionSegment) => void;
}) {
   const { t } = useTranslation();
   const style = paddingBottom ? { paddingBottom } : undefined;

   return isEditing ? (
      <textarea
         ref={pageAreaRef}
         value={text}
         onChange={(event) => onTextChange(event.target.value)}
         onFocus={onRequestSelect}
         onBlur={onCommit}
         onPointerDown={(event) => event.stopPropagation()}
         placeholder={t('BoardView.journalPlaceholder')}
         style={style}
         // Editing -> the board's wheel listener skips this so the wheel scrolls the page, not zoom.
         data-board-wheel-scroll
         className={cn('min-h-0 flex-1 resize-none border-0 bg-transparent p-2 leading-snug outline-none placeholder:text-muted-foreground/50 cursor-text', touch ? 'text-base' : 'text-sm')}
      />
   ) : (
      // Clip at rest on the fixed board box; the mobile reader scrolls the page instead (the textarea scrolls while editing).
      <div style={style} className={cn('min-h-0 flex-1 p-2', touch ? 'overflow-y-auto' : 'overflow-hidden')}>
         {text.trim() ? <NoteMarkdown content={text} onMentionClick={onMentionClick} /> : null}
      </div>
   );
}
