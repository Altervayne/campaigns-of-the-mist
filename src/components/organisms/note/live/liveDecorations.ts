// -- CodeMirror Imports --
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { Range, Extension } from '@codemirror/state';
import type { SyntaxNodeRef } from '@lezer/common';

// -- Local Imports --
import { parseMentions } from '@/lib/challenge/parseMentions';
import { findTableBlocks } from '@/lib/notes/noteFormat';
import { parseLinkHref } from '@/lib/portals/linkTarget';
import { resolveLocalLinkMetadata, getCachedLinkMetadata } from '@/lib/portals/linkMetadata';
import { extractHeadings } from '@/lib/notes/noteOutline';
import { STATUS_PILL, TAG_PILL } from '@/components/molecules/markdown/MentionPill';
import { MentionPillWidget } from './mentionPillWidget';
import { InternalLinkWidget } from './internalLinkWidget';

// -- Type Imports --
import type { NoteHeading } from '@/lib/notes/noteOutline';

/*
 * The Live-Preview INLINE decoration engine (a ViewPlugin). It drives decorations off the Lezer markdown
 * syntax tree - NOT regex - so nesting, escapes, and code fences are correct. Two jobs:
 *
 *  1. HIDE SYNTAX MARKERS as ZERO-WIDTH replaces (`**`, `*`, `` ` ``, `#`, `>`, `-`, link/url brackets), so
 *     a hidden marker takes NO space and NO cursor position - the caret steps cleanly over it (the "phantom
 *     gap" + untrustworthy-cursor fix). Reveal is PER LINE, Obsidian-style: on the line(s) the caret is on,
 *     markers are left raw (real width, editable); everywhere else they collapse. The styled TEXT (bold/
 *     italic/...) is always rendered via a mark class - that is the "live" in Live Preview.
 *  2. `{mention}` -> pill widget (off its own line), revealing the raw `{...}` when the caret is on that line.
 *     Same class-strings as the react-markdown `MentionPill`, so Live == Reading.
 *
 * Both the mention pills here and the block image widgets (StateField, see `imageWidgetField.ts`) are made
 * ATOMIC (`EditorView.atomicRanges`) so the caret never lands INSIDE a widget - it hops over the whole token.
 *
 * NOTE: this is a deliberate reversal of the earlier "opacity not collapse" call - collapse is what makes the
 * cursor honest and matches Obsidian; the small reflow when the caret enters a marked line is the accepted trade.
 */

// Inline mark classes (parity with docMarkdownComponents: strong=bold, em=italic, del=line-through, code chip).
const strongMark = Decoration.mark({ class: 'cm-md-strong' });
const emphasisMark = Decoration.mark({ class: 'cm-md-em' });
const strikeMark = Decoration.mark({ class: 'cm-md-strike' });
const codeMark = Decoration.mark({ class: 'cm-md-code' });
// A blockquote LINE class: a proper callout block (left bar + tint + padding), matching the Reading blockquote.
const quoteLine = Decoration.line({ class: 'cm-md-quote-line' });
// Heading line classes by level (font size + weight, matching the doc map's h1..h4).
const HEADING_LINE = ['cm-md-h1', 'cm-md-h2', 'cm-md-h3', 'cm-md-h4', 'cm-md-h4', 'cm-md-h4'];
// A hidden syntax marker: a ZERO-WIDTH replace (no layout width, no cursor slot, atomic on caret motion).
const hiddenMark = Decoration.replace({});

/** A rendered horizontal rule, replacing the `---`/`***`/`___` source off the cursor line (matches `<hr>`). */
class HorizontalRuleWidget extends WidgetType {
   eq(): boolean { return true; }
   toDOM(): HTMLElement {
      const el = document.createElement('span');
      el.className = 'cm-md-hr';
      el.setAttribute('aria-hidden', 'true');
      return el;
   }
   ignoreEvent(): boolean { return true; }
}
const hrWidget = Decoration.replace({ widget: new HorizontalRuleWidget() });

/** A rendered list marker (bullet/number), replacing the raw marker off the cursor line. Both this widget and
 * the raw marker (on the cursor line) carry the `cm-md-li-marker` class, a FIXED-WIDTH inline-block slot, so the
 * content's x is identical whether or not the caret is on the line - only the glyph (`-`/`-`, `1.`) differs. */
class ListMarkerWidget extends WidgetType {
   readonly label: string;
   constructor(label: string) {
      super();
      this.label = label;
   }
   eq(other: ListMarkerWidget): boolean {
      return other.label === this.label;
   }
   toDOM(): HTMLElement {
      const el = document.createElement('span');
      el.className = 'cm-md-li-marker';
      el.textContent = this.label;
      el.setAttribute('aria-hidden', 'true');
      return el;
   }
   ignoreEvent(): boolean {
      return true;
   }
}
/** The raw marker on the caret's line: same fixed-width slot as the rendered widget, so content never shifts. */
const listMarkerRawMark = Decoration.mark({ class: 'cm-md-li-marker' });

/** Lezer node names whose whole span is a syntax marker we collapse off-line / reveal on-line. `ListMark` is
 * NOT here - the depth-aware ListItem handler owns the list-prefix collapse (leading indent + marker + space). */
const MARKER_NODES = new Set(['HeaderMark', 'EmphasisMark', 'StrongEmphasisMark', 'CodeMark', 'QuoteMark', 'StrikethroughMark', 'LinkMark', 'URL']);

/**
 * BLOCK-PREFIX markers (`# `, `> `) sit at line start and are followed by a delimiter SPACE that Lezer
 * tokenizes SEPATELY from the mark. Hiding only the mark leaves that space as a visible left indent, so for
 * these we collapse the mark AND its trailing whitespace, and content sits truly flush. Inline marks
 * (`**`/`*`/`` ` ``) carry no trailing space and collapse to their own span only.
 */
const BLOCK_PREFIX_MARKS = new Set(['HeaderMark', 'QuoteMark']);

/** Per nesting-level list indent (rem), matching Reading's per-level `pl-6` (1.5rem) on each nested list. */
const LIST_INDENT_PER_LEVEL_REM = 1.5;

/** Content nodes -> the mark styling their text always carries. */
const CONTENT_MARK: Record<string, Decoration> = {
   StrongEmphasis: strongMark,
   Emphasis: emphasisMark,
   Strikethrough: strikeMark,
   InlineCode: codeMark,
};

/**
 * For a block-prefix mark ending at `markEnd`, returns the offset past its trailing whitespace on `line`
 * (the delimiter space after `#`/`>`/`-`/`1.`), so collapsing `[markFrom, prefixEnd)` hides mark + space and
 * the content aligns flush. Stops at the first non-space char (or line end) - never eats content.
 */
function prefixEnd(line: { from: number; text: string }, markEnd: number): number {
   let end = markEnd;
   const lineEnd = line.from + line.text.length;
   while (end < lineEnd && (line.text[end - line.from] === ' ' || line.text[end - line.from] === '\t')) end++;
   return end;
}

/** The nesting depth of a `ListItem` node = its count of `BulletList`/`OrderedList` ancestors (1 = top level). */
function listDepth(node: SyntaxNodeRef): number {
   let depth = 0;
   let p = node.node.parent;
   while (p) {
      if (p.name === 'BulletList' || p.name === 'OrderedList') depth++;
      p = p.parent;
   }
   return depth || 1;
}

/** The set of line numbers any selection range touches - those lines stay RAW (markers revealed). */
function cursorLines(view: EditorView): Set<number> {
   const lines = new Set<number>();
   const { doc } = view.state;
   for (const range of view.state.selection.ranges) {
      const first = doc.lineAt(range.from).number;
      const last = doc.lineAt(range.to).number;
      for (let n = first; n <= last; n++) lines.add(n);
   }
   return lines;
}

/**
 * Builds two decoration sets: `all` (marks + collapsed markers + pills, the rendered result) and `atomic`
 * (only the zero-width markers + pill widgets). Only the atomic set is fed to `EditorView.atomicRanges` -
 * making the STYLING marks (bold/italic text) atomic would trap the caret out of formatted words.
 */
function buildDecorations(view: EditorView, deadTooltip: string): { all: DecorationSet; atomic: DecorationSet } {
   const ranges: Range<Decoration>[] = [];
   const atomicRanges: Range<Decoration>[] = [];
   const tree = syntaxTree(view.state);
   const { doc } = view.state;
   const activeLines = cursorLines(view);
   // A same-note `#section` chip resolves against the doc's headings; scanned lazily (only if a section link exists).
   let headings: NoteHeading[] | null = null;
   const getHeadings = (): NoteHeading[] => (headings ??= extractHeadings(doc.toString()));
   // Line-scanned table blocks - so setext styling never bolds a table caught in a mis-parsed setext block (a
   // `---` under text below a table setext-ifies the whole block); those lines are gridded by the table field.
   const tableBlocks = findTableBlocks(doc.toString());
   const inTableBlock = (pos: number) => tableBlocks.some((b) => pos >= b.from && pos <= b.to);

   // Only decorate the visible viewport (cheap on a long note).
   for (const { from: vFrom, to: vTo } of view.visibleRanges) {
      tree.iterate({
         from: vFrom,
         to: vTo,
         enter: (node) => {
            const name = node.name;

            // Heading LINE class (whole line takes the size), driven by the ATXHeading level.
            const headingMatch = /^ATXHeading(\d)$/.exec(name);
            if (headingMatch) {
               const line = doc.lineAt(node.from);
               ranges.push(Decoration.line({ class: HEADING_LINE[Number(headingMatch[1]) - 1] }).range(line.from));
               return;
            }

            // A SETEXT heading (`text\n===` = H1, `text\n---` = H2): style the TEXT line(s) like an ATX h1/h2.
            // A `---` under text one `\n` below a table setext-ifies the WHOLE block (table rows + text); skip
            // any line inside a table block (it's gridded by the table field), so only the real heading text is
            // styled and the table is never bolded. The underline `===`/`---` collapses off-cursor below.
            const setextMatch = /^SetextHeading(\d)$/.exec(name);
            if (setextMatch) {
               const cls = HEADING_LINE[Number(setextMatch[1]) - 1];
               const first = doc.lineAt(node.from).number;
               const underline = doc.lineAt(Math.max(node.from, node.to - 1)).number; // last line = the `===`/`---`
               for (let n = first; n < underline; n++) {
                  const lineFrom = doc.line(n).from;
                  if (!inTableBlock(lineFrom)) ranges.push(Decoration.line({ class: cls }).range(lineFrom));
               }
               return;
            }

            // Content text always carries its mark styling (bold/italic/strike/code). NOT atomic - the caret
            // must move through formatted text normally.
            const contentDeco = CONTENT_MARK[name];
            if (contentDeco && node.to > node.from) {
               ranges.push(contentDeco.range(node.from, node.to));
               return;
            }

            // A blockquote renders as a callout BLOCK: each of its lines takes the quote-line class (a left bar +
            // tint + padding), so it reads as a block, matching the Reading blockquote (parity).
            if (name === 'Blockquote') {
               const first = doc.lineAt(node.from).number;
               const last = doc.lineAt(Math.max(node.from, node.to - 1)).number;
               for (let n = first; n <= last; n++) ranges.push(quoteLine.range(doc.line(n).from));
               return;
            }

            // A markdown link. Off the caret's line an INTERNAL link (`#section` / `cotm://...`) renders as a
            // chip widget (atomic) that reveals the raw `[text](href)` when the caret enters the line; an
            // EXTERNAL link keeps its default underlined-text rendering (its brackets/URL collapse via
            // MARKER_NODES below). On the caret's line the whole link stays raw and editable.
            if (name === 'Link') {
               if (activeLines.has(doc.lineAt(node.from).number)) return; // caret on the line: raw, editable
               const rawLink = doc.sliceString(node.from, node.to);
               const linkMatch = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(rawLink);
               if (!linkMatch) return; // reference-style / malformed: leave the default rendering
               const target = parseLinkHref(linkMatch[2]);
               if (target.kind === 'section' || target.kind === 'entity' || target.kind === 'element') {
                  // Section liveness/naming is local + synchronous (the doc's headings); an entity/element reads
                  // the drawer cache (undefined = UNKNOWN, so the chip renders live and loads-then-patches itself).
                  const metadata = target.kind === 'section'
                     ? resolveLocalLinkMetadata(target, getHeadings()) ?? undefined
                     : getCachedLinkMetadata(target);
                  const widget = new InternalLinkWidget(target, linkMatch[1].trim(), metadata, deadTooltip);
                  const chip = Decoration.replace({ widget }).range(node.from, node.to);
                  ranges.push(chip);
                  atomicRanges.push(chip);
                  return false; // the chip owns the whole span; don't collapse its LinkMark/URL children
               }
               return; // external / unknown: default underlined-text rendering
            }

            // A thematic break (`---`/`***`/`___`) renders as a real horizontal rule OFF the cursor line (the
            // source is replaced by the rule widget, ATOMIC); on the caret's line it stays raw so it's editable.
            if (name === 'HorizontalRule') {
               if (activeLines.has(doc.lineAt(node.from).number)) return;
               const rule = hrWidget.range(node.from, node.to);
               ranges.push(rule);
               atomicRanges.push(rule);
               return;
            }

            // A LIST ITEM. Its indent has two disjoint parts, so the content lands at the same x whether or not the
            // caret is on the line: (1) a DEPTH indent (`--li-indent` inline var, read from the Lezer nesting depth
            // so it matches the parser and manual indentation) as the line's padding; (2) a FIXED-WIDTH marker slot
            // (`cm-md-li-marker`) holding the glyph. The leading indentation whitespace ALWAYS collapses - on the
            // caret's line too - or the literal spaces + the depth padding would STACK and the active line would sit
            // one level too deep. Off-cursor the marker is a rendered bullet/number widget; on-cursor it's the raw
            // marker (editable) wrapped in the SAME fixed slot, so content never shifts - only the glyph changes.
            // This owns the list-prefix collapse - `ListMark` is deliberately NOT in MARKER_NODES.
            if (name === 'ListItem') {
               const line = doc.lineAt(node.from);
               const m = /^(\s*)([-*+]|\d+\.)(\s+)/.exec(line.text);
               if (m) {
                  const active = activeLines.has(line.number);
                  const ordered = /\d/.test(m[2]);
                  const depth = listDepth(node); // 1 = top level, 2 = first nesting, ...
                  const indentRem = ((depth - 1) * LIST_INDENT_PER_LEVEL_REM).toFixed(3);
                  ranges.push(
                     Decoration.line({ attributes: { class: 'cm-md-li', style: `--li-indent:${indentRem}rem` } }).range(line.from),
                  );
                  const markerStart = line.from + m[1].length; // after the leading indentation whitespace
                  const contentStart = line.from + m[0].length; // after the marker + delimiter space
                  // Collapse the leading indentation whitespace ALWAYS (the depth padding represents it).
                  if (markerStart > line.from) {
                     const collapsed = hiddenMark.range(line.from, markerStart);
                     ranges.push(collapsed);
                     atomicRanges.push(collapsed);
                  }
                  if (active) {
                     // Raw marker, editable, in the fixed slot.
                     ranges.push(listMarkerRawMark.range(markerStart, contentStart));
                  } else {
                     // Rendered bullet/number, same fixed slot; atomic so the caret hops it.
                     const label = ordered ? m[2] : '•';
                     const w = Decoration.replace({ widget: new ListMarkerWidget(label) }).range(markerStart, contentStart);
                     ranges.push(w);
                     atomicRanges.push(w);
                  }
               }
               return;
            }

            // Syntax markers: collapsed (zero-width, ATOMIC) unless the caret is on this marker's LINE, where
            // it stays raw so it can be edited. A BLOCK-PREFIX marker also swallows its trailing space so the
            // content sits flush (else the lone delimiter space reads as a left indent).
            if (MARKER_NODES.has(name) && node.to > node.from) {
               if (activeLines.has(doc.lineAt(node.from).number)) return; // caret on this line: leave it raw
               const to = BLOCK_PREFIX_MARKS.has(name) ? prefixEnd(doc.lineAt(node.from), node.to) : node.to;
               const collapsed = hiddenMark.range(node.from, to);
               ranges.push(collapsed);
               atomicRanges.push(collapsed);
            }
         },
      });
   }

   // Mentions are not markdown nodes - scan the visible text and replace `{...}` with a pill (off its line).
   collectMentionRanges(view, ranges, atomicRanges, activeLines);

   // Decoration.set requires sorted; `true` sorts (and orders line vs mark) for us.
   return { all: Decoration.set(ranges, true), atomic: Decoration.set(atomicRanges, true) };
}

/** Adds `{mention}` pill widgets (off the caret's line) / leaves the raw `{...}` when the caret is on that line. */
function collectMentionRanges(view: EditorView, ranges: Range<Decoration>[], atomicRanges: Range<Decoration>[], activeLines: Set<number>): void {
   const { doc } = view.state;
   for (const { from: vFrom, to: vTo } of view.visibleRanges) {
      const text = doc.sliceString(vFrom, vTo);
      let offset = 0;
      for (const segment of parseMentions(text)) {
         if (segment.type === 'text') {
            offset += segment.text.length;
            continue;
         }
         // The raw token is `{raw}` - length is raw + the two braces.
         const from = vFrom + offset;
         const to = from + segment.raw.length + 2;
         offset += segment.raw.length + 2;
         if (activeLines.has(doc.lineAt(from).number)) continue; // caret on this line: leave the raw `{...}` editable
         const pill = Decoration.replace({ widget: new MentionPillWidget(segment, STATUS_PILL, TAG_PILL) }).range(from, to);
         ranges.push(pill);
         atomicRanges.push(pill); // the caret hops over a pill, never into its `{...}`
      }
   }
}

/*
 * The inline Live-Preview decorations, rebuilt on doc/selection/viewport change. It holds both the rendered
 * set and an ATOMIC set (only the collapsed markers + pills), so the caret hops over a collapsed marker /
 * mention pill rather than landing inside it, while still moving normally through bold/italic text. A factory
 * so the localized "target not found" tooltip (the imperative widget has no i18n of its own) is injected once,
 * matching how the format/link-edit bars receive their labels.
 */
export function liveInlineDecorations(deadTooltip: string): Extension {
   return ViewPlugin.fromClass(
      class {
         decorations: DecorationSet;
         atomic: DecorationSet;
         constructor(view: EditorView) {
            const built = buildDecorations(view, deadTooltip);
            this.decorations = built.all;
            this.atomic = built.atomic;
         }
         update(update: ViewUpdate) {
            if (update.docChanged || update.selectionSet || update.viewportChanged) {
               const built = buildDecorations(update.view, deadTooltip);
               this.decorations = built.all;
               this.atomic = built.atomic;
            }
         }
      },
      {
         decorations: (plugin) => plugin.decorations,
         provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none),
      },
   );
}
