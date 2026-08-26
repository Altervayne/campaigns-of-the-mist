// -- Markdown Imports --
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

// -- Portals Imports --
import { parseLinkHref } from './linkTarget';
import { buildLinkHref } from './buildLinkToken';

// -- Type Imports --
import type { Root, RootContent, Link } from 'mdast';
import type { LinkInsertTarget } from './buildLinkToken';
import type { LinkTarget } from './linkTarget';
import type { Board, BoardItemContent, PortalTarget } from '@/lib/types/board';

/*
 * Re-point primitives: pure, framework-free rewrites that swap a DEAD link (a `cotm://.../<oldId>` whose
 * target is gone) to a new destination. No store, DOM, or repository imports, so the rewrites are unit-testable
 * and the persistence ops (`rePointOps.ts`) can call them from anywhere.
 *
 * Two target shapes are re-pointed:
 *   - Structured board fields (a `portal`'s target, a note-embed's `noteId`) - a plain field swap, always safe.
 *   - A `cotm://` token inside a note's markdown BODY - the risky path. The rewrite is SURGICAL: the body is
 *     parsed to mdast with positions, matching `link` nodes are found via {@link parseLinkHref} (so the match
 *     can't drift from resolution), and ONLY each link's url span is spliced in the original string. Everything
 *     outside those spans stays byte-for-byte identical, and a `cotm://` occurrence that is NOT a link node
 *     (inline code, a fenced block, bare prose) is never a match, so it is never touched. A `String.replace`
 *     would corrupt exactly those cases - that is why the AST is required.
 *
 * Id-kind + page rules mirror the link grammar (`linkTarget.ts`): entity links carry an entity id, element
 * links a drawer-item id; a pdf link's `#page` fragment is PRESERVED on pdf->pdf and DROPPED otherwise (only
 * pdf reads a fragment). The new href is built via {@link buildLinkHref} so emit can't drift from parse.
 */

/** A url span inside the body to overwrite, plus the replacement href. */
interface UrlSplice {
   start: number;
   end: number;
   href: string;
}

/** Recursively collects every `link` node in the tree (image nodes are a different type, never collected). */
function collectLinkNodes(root: Root): Link[] {
   const links: Link[] = [];
   const walk = (node: Root | RootContent): void => {
      if (node.type === 'link') links.push(node);
      const children = (node as { children?: RootContent[] }).children;
      if (children) for (const child of children) walk(child);
   };
   walk(root);
   return links;
}

/**
 * Locates a link node's destination span in the ORIGINAL body, or `null` when it can't be pinned down
 * unambiguously (then the caller leaves the link untouched - correctness over coverage). Only an inline
 * `[label](dest)` link with a source destination that matches `node.url` exactly is spliceable; a reference
 * link, an escaped/entity-bearing destination, or any shape whose sliced text differs from the parsed url
 * fails the equality gate and is skipped.
 */
function findDestinationSpan(body: string, node: Link): { start: number; end: number } | null {
   const position = node.position;
   if (!position?.start || !position.end) return null;
   const nodeStart = position.start.offset;
   const nodeEnd = position.end.offset;
   if (nodeStart === undefined || nodeEnd === undefined) return null;
   if (body[nodeEnd - 1] !== ')') return null;

   // The label ends at its last inline child (or just past `[` for an empty label); the `]` and `(` follow.
   const labelContentEnd = node.children.length > 0
      ? node.children[node.children.length - 1].position?.end.offset
      : nodeStart + 1;
   if (labelContentEnd === undefined) return null;
   const bracketClose = body.indexOf(']', labelContentEnd);
   if (bracketClose < 0 || bracketClose >= nodeEnd) return null;
   if (body[bracketClose + 1] !== '(') return null; // inline link only

   const closeParen = nodeEnd - 1;
   let i = bracketClose + 2;
   while (i < closeParen && isWhitespace(body[i])) i++;

   let destStart: number;
   let destEnd: number;
   if (body[i] === '<') {
      // Angle-bracketed destination: the url is the text between `<` and `>`.
      destStart = i + 1;
      destEnd = body.indexOf('>', destStart);
      if (destEnd < 0 || destEnd >= closeParen) return null;
   } else {
      // Bare destination: runs to the first whitespace (a title follows) or to the closing paren.
      destStart = i;
      let j = i;
      while (j < closeParen && !isWhitespace(body[j])) j++;
      destEnd = j;
   }

   // Safety gate: only splice when the sliced source equals the parsed url exactly. Any divergence (escapes,
   // entities, an odd shape) means we can't be sure of the bounds, so leave the link alone.
   if (body.slice(destStart, destEnd) !== node.url) return null;
   return { start: destStart, end: destEnd };
}

/** A whitespace char per CommonMark link-destination parsing (space, tab, newline, carriage return). */
function isWhitespace(char: string): boolean {
   return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

/**
 * Builds the re-point href for a matched link. Preserves the old pdf page when BOTH old and new are pdf and the
 * new target didn't pick its own page; drops it otherwise (a non-pdf destination reads no fragment).
 */
function rePointHref(newTarget: LinkInsertTarget, oldPage: number | undefined): string {
   if (
      oldPage !== undefined &&
      newTarget.kind === 'entity' &&
      newTarget.entity === 'pdf' &&
      newTarget.page === undefined
   ) {
      return buildLinkHref({ ...newTarget, page: oldPage });
   }
   return buildLinkHref(newTarget);
}

/** The matched links of a body: each carries its destination span and the old pdf page (for pdf->pdf preserve). */
function collectBodyMatches(body: string, oldId: string): { span: { start: number; end: number }; oldPage: number | undefined }[] {
   if (!body) return [];
   let root: Root;
   try {
      root = unified().use(remarkParse).use(remarkGfm).parse(body);
   } catch {
      // A parse failure must never corrupt prose: treat the body as having no matches.
      return [];
   }

   const matches: { span: { start: number; end: number }; oldPage: number | undefined }[] = [];
   for (const node of collectLinkNodes(root)) {
      const target = parseLinkHref(node.url);
      const isMatch =
         (target.kind === 'entity' && target.id === oldId) ||
         (target.kind === 'element' && target.drawerItemId === oldId);
      if (!isMatch) continue;
      const span = findDestinationSpan(body, node);
      if (!span) continue;
      const oldPage = target.kind === 'entity' && target.entity === 'pdf' ? target.page : undefined;
      matches.push({ span, oldPage });
   }
   return matches;
}

/**
 * The `oldId` a dead link is re-pointed by: an entity's id, an element's drawer-item id, else `undefined` (a
 * section/external target is not re-pointable). The single derivation the re-point UI keys on, so the chip's
 * "can repair" gate and the picker's `oldId` can't drift.
 */
export function rePointableTargetId(target: LinkTarget): string | undefined {
   if (target.kind === 'entity') return target.id;
   if (target.kind === 'element') return target.drawerItemId;
   return undefined;
}

/**
 * Counts the note-body links pointing at `oldId` (the "this link / all N" scope the re-point UI shows). Uses
 * the same match walk as {@link rePointNoteBody}, so the count and the rewrite can never disagree.
 */
export function countNoteBodyLinks(body: string, oldId: string): number {
   return collectBodyMatches(body, oldId).length;
}

/**
 * Re-points every note-body link targeting `oldId` to `newTarget`, rewriting ONLY each matched link's url span.
 * Labels, prose, code, and non-matching links are byte-identical in the result. Splices are applied
 * right-to-left (descending offset) so an earlier match's offsets stay valid. Returns the body unchanged when
 * there are no matches.
 */
export function rePointNoteBody(body: string, oldId: string, newTarget: LinkInsertTarget): string {
   const matches = collectBodyMatches(body, oldId);
   if (matches.length === 0) return body;

   const splices: UrlSplice[] = matches.map(({ span, oldPage }) => ({
      start: span.start,
      end: span.end,
      href: rePointHref(newTarget, oldPage),
   }));
   splices.sort((a, b) => b.start - a.start);

   let result = body;
   for (const splice of splices) {
      result = result.slice(0, splice.start) + splice.href + result.slice(splice.end);
   }
   return result;
}

/** Converts a picked {@link LinkInsertTarget} into a board {@link PortalTarget}, or `null` when it can't sit on a
 *  portal (a same-document section is note-only). Preserves the old pdf page on a pdf->pdf swap with no new page. */
function toPortalTarget(newTarget: LinkInsertTarget, oldPage: number | undefined): PortalTarget | null {
   switch (newTarget.kind) {
      case 'entity': {
         if (newTarget.entity === 'pdf') {
            const page = newTarget.page ?? oldPage;
            return page !== undefined
               ? { kind: 'entity', entity: 'pdf', id: newTarget.id, page }
               : { kind: 'entity', entity: 'pdf', id: newTarget.id };
         }
         return { kind: 'entity', entity: newTarget.entity, id: newTarget.id };
      }
      case 'element':
         return { kind: 'element', drawerItemId: newTarget.drawerItemId };
      case 'external':
         return { kind: 'external', href: newTarget.url };
      case 'section':
         return null;
   }
}

/**
 * True when a board item's content targets `oldId` (a portal target or a note-embed reference). The single match
 * rule the board re-point + count share, so they can't drift.
 */
export function boardItemTargetsId(content: BoardItemContent, oldId: string): boolean {
   if (content.kind === 'portal') {
      const target = content.target;
      return (target.kind === 'entity' && target.id === oldId) || (target.kind === 'element' && target.drawerItemId === oldId);
   }
   return content.kind === 'note' && content.mode === 'reference' && content.noteId === oldId;
}

/** Counts the board items pointing at `oldId` (the bulk re-point scope for a board). Uses the same match rule as
 *  {@link rePointBoardTarget}, so the count and the rewrite can't disagree. */
export function countBoardLinks(contents: BoardItemContent[], oldId: string): number {
   return contents.filter((c) => boardItemTargetsId(c, oldId)).length;
}

/**
 * Re-points a single board item's content when it targets `oldId`, returning the new content, or `null` when the
 * item does not match (the caller keeps the original reference). Handles the two structured targets: a `portal`'s
 * `target` field, and a note-embed's `noteId`. A note-embed only mirrors a NOTE, so it re-points only to a note
 * entity; every other kind (and a portal handed a section target) is left untouched.
 */
export function rePointBoardItemContent(
   content: BoardItemContent,
   oldId: string,
   newTarget: LinkInsertTarget,
): BoardItemContent | null {
   if (content.kind === 'portal') {
      if (!boardItemTargetsId(content, oldId)) return null;
      const target = content.target;
      const oldPage = target.kind === 'entity' && target.entity === 'pdf' ? target.page : undefined;
      const next = toPortalTarget(newTarget, oldPage);
      if (!next) return null;
      return { ...content, target: next };
   }

   if (boardItemTargetsId(content, oldId)) {
      if (newTarget.kind !== 'entity' || newTarget.entity !== 'note') return null;
      // Point at the new note; the old source-drawer id and cached snapshot belong to the gone note, so drop them.
      return { kind: 'note', mode: 'reference', noteId: newTarget.id };
   }

   return null;
}

/**
 * Re-points every board item targeting `oldId` to `newTarget`, returning a new {@link Board} with only the
 * matched items' content swapped (every other item kept by reference). Returns the same board when nothing
 * matched, so a caller can skip a no-op write.
 */
export function rePointBoardTarget(board: Board, oldId: string, newTarget: LinkInsertTarget): Board {
   let changed = false;
   const items = board.items.map((item) => {
      const nextContent = rePointBoardItemContent(item.content, oldId, newTarget);
      if (!nextContent) return item;
      changed = true;
      return { ...item, content: nextContent };
   });
   return changed ? { ...board, items } : board;
}
