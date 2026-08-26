// -- Library Imports --
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { remarkMentions } from '@/lib/challenge/remarkMentions';
import { remarkLineBreaks } from '@/lib/notes/remarkLineBreaks';
import { remarkSoftBreaks } from '@/lib/notes/remarkSoftBreaks';
import { separateTablesFromText } from '@/lib/notes/noteFormat';
import { extractHeadings, slugifyHeading } from '@/lib/notes/noteOutline';

// -- Component Imports --
import { docMarkdownComponents } from './markdown/docMarkdownComponents';
import { HeadingSlugContext, type HeadingSlugResolver } from './markdown/headingSlugContext';
import { linkComponents } from './markdown/linkComponents';
import { mentionComponents } from './markdown/markdownComponents';
import { NoteImage } from './note/NoteImage';
import { NoteCover } from './note/NoteCover';

// -- Type Imports --
import type { Components } from 'react-markdown';
import type { MentionSegment } from '@/lib/challenge/parseMentions';
import type { LinkTarget } from '@/lib/portals/linkTarget';
import type { NoteCover as NoteCoverData } from '@/lib/types/board';

/*
 * The document Markdown renderer for a Note tab's PREVIEW (resting) state. It reuses the
 * remark + mention pipeline wholesale but at DOCUMENT scale via `docMarkdownComponents` (a
 * fork of the card prose map), and adds the reading measure cap - `max-w-[68ch]`, centered -
 * so lines don't run the full width of a wide monitor. `{brace}` mentions render as their
 * fixed-color pills; without `onMentionClick` they are plain, non-interactive labels.
 *
 * Inline images are the Note surface's OWN renderer ({@link NoteImage}): it resolves the `asset:`
 * scheme to a stored image and refuses any other (untrusted) src, keeping the shared doc map's
 * alt-text-only `img` intact for any non-note consumer. Raw HTML stays inert (no `rehype-raw`) EXCEPT a lone
 * `<br>`, narrowly allowed as a real line break via {@link remarkLineBreaks} (a table cell's only line break).
 * Links open in a new tab.
 *
 * The document TITLE renders as the leading H1 above the cover (matching `noteToMarkdown`'s `# {title}`), so
 * Reading shows the same title-over-cover layout the Live editor does.
 */

// The note-scoped `img` override, layered over the shared doc map (which stays alt-text-only).
const noteImageComponent: Partial<Components> = { img: NoteImage };

/*
 * react-markdown's default url sanitizer strips any non-http(s) scheme to empty, which would eat our
 * `asset:` image src (before NoteImage sees it) and our `cotm://` internal-link href (before the link `a`
 * classifies it). Let those two schemes through untouched; everything else still runs the default sanitizer
 * (so http(s)/other schemes stay sanitized). NoteImage / the link `a` remain the real gates - NoteImage
 * renders an <img> for `asset:` alone, and the link `a` only acts on the known `cotm://` grammar.
 */
function noteUrlTransform(url: string): string {
   return url.startsWith('asset:') || url.startsWith('cotm:') ? url : defaultUrlTransform(url);
}

interface NoteDocumentProps {
   /** The document title; rendered as the leading H1 above the cover (mirrors the plain-markdown mapping). */
   title?: string;
   body: string;
   /** The note-level cover image; floated top-left so the opening text wraps beside it. */
   cover?: NoteCoverData;
   onMentionClick?: (segment: MentionSegment) => void;
   /** Resolves an internal link (`#section` / `cotm://...`) on click; omit for a display-only render (chips stay inert). */
   onLinkActivate?: (href: string) => void;
   /** Opens the re-point flow for a dead, re-pointable link chip; omit (board/mobile) to keep the plain dead-chip behavior. */
   onRePoint?: (target: LinkTarget) => void;
   /**
    * Board-tile variant: sizes the title + cover with the CONTAINER (the tile), not the viewport, so a note
    * reads cleanly at ~260px and scales up on resize. Opt-in only - the full-page Reading render omits it and
    * keeps its fixed `text-4xl` title + natural cover (unchanged).
    */
   compact?: boolean;
   className?: string;
}

export function NoteDocument({ title, body, cover, onMentionClick, onLinkActivate, onRePoint, compact, className }: NoteDocumentProps) {
   const { t } = useTranslation();
   const heading = title?.trim();
   // Display-only: break a table off a text line one `\n` below it (GFM would else absorb the text as a cell).
   const renderedBody = useMemo(() => separateTablesFromText(body), [body]);
   // This note's headings: the outline anchors AND the source of a `#section` chip's liveness + name (so a link
   // chip resolves against the same headings the outline does).
   const headings = useMemo(() => extractHeadings(renderedBody), [renderedBody]);
   const components = useMemo(
      () => ({ ...docMarkdownComponents, ...noteImageComponent, ...linkComponents(onLinkActivate, headings, t('NoteView.linkDead'), onRePoint), ...mentionComponents(onMentionClick) }),
      [onLinkActivate, onRePoint, onMentionClick, headings, t],
   );
   // Heading anchors: emit `id={slug}` on each rendered heading, matched by SOURCE OFFSET (in the rendered body,
   // which is what react-markdown parses) against `extractHeadings`, so the id === the outline rail's slug.
   const slugByOffset = useMemo(() => {
      const map = new Map<number, string>();
      for (const h of headings) map.set(h.from, h.slug);
      return map;
   }, [headings]);
   const resolveHeadingSlug = useCallback<HeadingSlugResolver>(
      (offset, text) => (offset != null && slugByOffset.has(offset) ? slugByOffset.get(offset) : slugifyHeading(text)),
      [slugByOffset],
   );
   // `[display:flow-root]` under a cover makes this a BFC so the floated cover is CONTAINED - the parchment
   // grows past a tall cover instead of the cover overflowing the sheet's bottom. `compact` also makes the
   // wrapper a container-query context (`@container`) so the title + cover below size against the tile width.
   return (
      <div className={cn('mx-auto w-full max-w-[68ch] text-base break-words', compact && '@container', cover && 'note-cover-host [display:flow-root]', className)}>
         {/* The document title is the leading H1, ABOVE the cover (the cover floats after it, so the opening
             body wraps beside the cover, not the title). Matches `noteToMarkdown`'s `# {title}`. Compact steps
             the title with the tile width - small by default, up to the full `text-4xl` on a wide tile. */}
         {heading ? (
            <h1 className={compact
               ? 'mb-2 text-lg font-bold leading-tight text-paper-foreground @[18rem]:mb-3 @[18rem]:text-2xl @[28rem]:text-3xl @[40rem]:text-4xl'
               : 'mb-4 text-4xl font-bold text-paper-foreground'}>{heading}</h1>
         ) : null}
         {/* Cover floats before the body so the opening markdown flows beside it (magazine drop-cap). A leading
             heading in the body would normally `clear-both` below the float (that rule shields section breaks
             from inline images); under a cover host we neutralise it so the opening body heading wraps beside
             the cover, matching Live's gutter. In-text images are blocks now, so nothing else relies on it.
             Compact hides the cover on a very narrow tile and caps its height (growing with width) so it never
             crowds out the title + body-start. */}
         {cover ? (
            <>
               <style>{'.note-cover-host > :is(h1,h2,h3,h4,h5,h6,hr){clear:none}'}</style>
               <NoteCover cover={cover} className={compact ? '@max-[13rem]:hidden @[13rem]:max-h-28 @[26rem]:max-h-44 @[38rem]:max-h-64' : undefined} />
            </>
         ) : null}
         <HeadingSlugContext.Provider value={resolveHeadingSlug}>
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkLineBreaks, remarkSoftBreaks, remarkMentions]} components={components} urlTransform={noteUrlTransform}>
               {renderedBody}
            </ReactMarkdown>
         </HeadingSlugContext.Provider>
      </div>
   );
}
