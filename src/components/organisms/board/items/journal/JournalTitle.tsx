// -- Library Imports --
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// -- Component Imports --
import { proseMarkdownComponents } from '@/components/molecules/markdown/markdownComponents';

// -- Type Imports --
import type { Components } from 'react-markdown';

/*
 * The journal title rendered as INLINE, single-line markdown: it reuses the shared prose accents but
 * collapses the paragraph to a span, so bold/italic/strike/code/link show inline and the whole thing
 * truncates as one line (no block flow, no mentions - a heading, not an article).
 */
const TITLE_MARKDOWN_COMPONENTS: Components = {
   ...proseMarkdownComponents,
   p: ({ ...props }) => <span {...props} />,
};

export function JournalTitle({ content }: { content: string }) {
   return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={TITLE_MARKDOWN_COMPONENTS}>
         {content}
      </ReactMarkdown>
   );
}
