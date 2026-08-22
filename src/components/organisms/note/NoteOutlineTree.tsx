// -- React Imports --
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { ChevronRight } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Outline Primitive --
import { extractHeadings } from '@/lib/notes/noteOutline';

// -- Type Imports --
import type { NoteHeading } from '@/lib/notes/noteOutline';

/*
 * The note-outline TREE body: the reactive headings list, nested into a collapsible tree, shared by the
 * desktop sliding rail (see `NoteOutline`) and the mobile outline sheet. It owns the tree build + per-heading
 * collapse state and renders the empty state or the scrollable list; the caller supplies the surrounding
 * chrome (the rail's sliding panel, or the sheet's header). A row click jumps (the caller routes CM6 scroll vs
 * `#slug` per mode); the twisty toggles collapse without navigating.
 */

/** Indent (rem) added per nesting depth - each deeper level's twisty/text steps in by this much. */
const INDENT_REM = 1;
/** The twisty's box is 24px (1.5rem); its centre sits `TWISTY_CENTRE_REM` from the row's indent origin. */
const TWISTY_CENTRE_REM = 0.75;

/** A heading nested under its parent (nearest preceding heading of a smaller level). */
interface OutlineNode extends NoteHeading {
   children: OutlineNode[];
}

/** Nests the flat, in-order heading list into a tree by level (a heading parents the nearest shallower one). */
function buildOutlineTree(headings: NoteHeading[]): OutlineNode[] {
   const roots: OutlineNode[] = [];
   const stack: OutlineNode[] = [];
   for (const heading of headings) {
      const node: OutlineNode = { ...heading, children: [] };
      while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) stack.pop();
      if (stack.length === 0) roots.push(node);
      else stack[stack.length - 1].children.push(node);
      stack.push(node);
   }
   return roots;
}

export function NoteOutlineTree({ body, onJump }: { body: string; onJump: (heading: NoteHeading) => void }) {
   const { t } = useTranslation();
   const headings = useMemo(() => extractHeadings(body), [body]);
   const tree = useMemo(() => buildOutlineTree(headings), [headings]);

   // Per-heading collapse state (session-level, keyed by the deduped slug). Stale entries after an edit are inert.
   const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
   const toggle = useCallback((slug: string) => {
      setCollapsed((prev) => {
         const next = new Set(prev);
         if (next.has(slug)) next.delete(slug); else next.add(slug);
         return next;
      });
   }, []);

   if (headings.length === 0) {
      return <p className="px-3 py-6 text-center text-sm italic text-muted-foreground">{t('NoteView.outline.empty')}</p>;
   }

   return (
      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
         {tree.map((node) => (
            <OutlineRows key={node.slug} node={node} depth={0} collapsed={collapsed} onToggle={toggle} onJump={onJump} />
         ))}
      </ul>
   );
}

/** Renders a node's row (guides + twisty + jump target) then, unless collapsed, its children recursively. */
function OutlineRows({
   node,
   depth,
   collapsed,
   onToggle,
   onJump,
}: {
   node: OutlineNode;
   depth: number;
   collapsed: Set<string>;
   onToggle: (slug: string) => void;
   onJump: (heading: NoteHeading) => void;
}) {
   const { t } = useTranslation();
   const hasChildren = node.children.length > 0;
   const isCollapsed = collapsed.has(node.slug);

   return (
      <li>
         <div className="relative flex items-center gap-1.5 pr-2 py-0.5 hover:bg-foreground/5" style={{ paddingLeft: `${depth * INDENT_REM}rem` }}>
            {/* One muted vertical guide per ANCESTOR level, at that level's TWISTY centre. Contiguous descendant
                rows draw the same x, so the guides read as continuous lines running down each nesting level. */}
            {Array.from({ length: depth }).map((_, level) => (
               <span
                  key={level}
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 w-px bg-border"
                  style={{ left: `${level * INDENT_REM + TWISTY_CENTRE_REM}rem` }}
               />
            ))}

            {hasChildren ? (
               // A generous 24px square twisty with its own hover fill + a right gap to the text, so it reads as a
               // distinct collapse control and is comfortably clickable WITHOUT catching the row's jump target. It
               // rotates (right -> down) to indicate expanded state.
               <button
                  type="button"
                  onClick={() => onToggle(node.slug)}
                  aria-label={isCollapsed ? t('NoteView.outline.expand') : t('NoteView.outline.collapse')}
                  className="relative z-10 grid h-6 w-6 touch-target shrink-0 place-items-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground cursor-pointer"
               >
                  <ChevronRight className={cn('h-4 w-4 transition-transform duration-150', !isCollapsed && 'rotate-90')} />
               </button>
            ) : (
               // A leaf: reserve the twisty's width so its text aligns with a parent's text (no ragged left edge).
               <span className="w-6 shrink-0" aria-hidden />
            )}

            <button
               type="button"
               onClick={() => onJump(node)}
               title={node.text}
               className="min-w-0 flex-1 truncate py-1 text-left text-sm leading-tight text-foreground cursor-pointer"
            >
               {node.text}
            </button>
         </div>

         {/* Children go in a NESTED <ul> (a valid `<li>` child) - Tailwind's preflight zeroes ul padding, so all
             rows still start at the same x and the guide lines stay aligned across depths. */}
         {hasChildren && !isCollapsed && (
            <ul>
               {node.children.map((child) => (
                  <OutlineRows key={child.slug} node={child} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} onJump={onJump} />
               ))}
            </ul>
         )}
      </li>
   );
}
