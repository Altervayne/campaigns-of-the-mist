// -- Type Imports --
import type { PdfOutlineEntry } from '@/lib/pdf/pdfOutline';

/*
 * The outline (bookmarks) tab: the PDF's own table of contents, rendered fully expanded as an indented list.
 * A row with a resolved page jumps to it on click; a row whose dest couldn't resolve renders muted and inert.
 * Chrome uses app tokens, matching the Navigator rows.
 */

/** Left padding added per nesting level, in px. */
const INDENT_PER_DEPTH = 12;

/** Base left padding of a depth-0 row, in px. */
const BASE_INDENT = 8;

interface PdfOutlineTreeProps {
   outline: PdfOutlineEntry[];
   onJump: (page: number) => void;
}

export function PdfOutlineTree({ outline, onJump }: PdfOutlineTreeProps) {
   return (
      <ul className="py-1">
         {outline.map((entry, index) => (
            <OutlineRow key={index} entry={entry} depth={0} onJump={onJump} />
         ))}
      </ul>
   );
}

function OutlineRow({ entry, depth, onJump }: { entry: PdfOutlineEntry; depth: number; onJump: (page: number) => void }) {
   const paddingLeft = BASE_INDENT + depth * INDENT_PER_DEPTH;
   const hasPage = entry.page !== null;

   return (
      <li>
         {hasPage ? (
            <button
               type="button"
               title={entry.title}
               onClick={() => onJump(entry.page as number)}
               style={{ paddingLeft }}
               className="flex w-full items-center gap-2 rounded py-1 pr-2 text-left text-sm text-foreground hover:bg-muted/60"
            >
               <span className="min-w-0 flex-1 truncate">{entry.title}</span>
               <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{entry.page}</span>
            </button>
         ) : (
            <div
               title={entry.title}
               style={{ paddingLeft }}
               className="flex w-full items-center rounded py-1 pr-2 text-sm text-muted-foreground"
            >
               <span className="min-w-0 flex-1 truncate">{entry.title}</span>
            </div>
         )}
         {entry.children.length > 0 ? (
            <ul>
               {entry.children.map((child, index) => (
                  <OutlineRow key={index} entry={child} depth={depth + 1} onJump={onJump} />
               ))}
            </ul>
         ) : null}
      </li>
   );
}
