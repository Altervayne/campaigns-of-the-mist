// -- Library Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { NoteMarkdown } from '@/components/molecules/NoteMarkdown';

// -- Hook Imports --
import { useJournalPageIndex } from '@/hooks/board/useJournalPageIndex';

// -- Icon Imports --
import { Bookmark } from 'lucide-react';

// -- Utils Imports --
import { deriveJournalTitle } from '@/lib/utils/character';

// -- Type Imports --
import type { Journal } from '@/lib/types/board';

interface MobileJournalCoverTileProps {
	journal: Journal;
	/** Opens the full-screen reader for this journal. */
	onOpenJournal?: (journalId: string) => void;
}

/**
 * A journal's carousel tile: a parchment "closed notebook" at the card footprint, so a journal reads
 * as a distinct object from a card while the swipeable stage stays even. Uses the `--paper-*` family
 * (not app chrome) to match the desktop journal. Shows the journal's title, a clipped peek of its
 * current page, and a page-count footer; the two offset layers behind it are the at-a-glance
 * "notebook, not card" signal. Purpose-built - the live paging body renders full-screen, never here.
 */
export function MobileJournalCoverTile({ journal, onOpenJournal }: MobileJournalCoverTileProps) {
	const { t } = useTranslation();
	const { pageIndex, activePage } = useJournalPageIndex(journal.id, journal.pages);

	const pageCount = journal.pages.length;
	const isCurrentPageBookmarked = activePage ? journal.bookmarks.some((bookmark) => bookmark.pageId === activePage.id) : false;

	return (
		<div className="relative w-62.5 h-150">
			{/* Stacked pages: two offset layers peeking from behind, the "notebook" tell. */}
			<div aria-hidden className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg border border-paper-border bg-paper-secondary" />
			<div aria-hidden className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-lg border border-paper-border bg-paper-secondary" />

			{/* Tap opens the full-screen reader (the tile peeks a link, so a div-tap, not a button - an
			    anchor cannot nest in a button). */}
			<div
				onClick={() => onOpenJournal?.(journal.id)}
				className="relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-lg border border-paper-border bg-paper-background text-paper-foreground"
			>
				{/* Title band */}
				<div className="shrink-0 bg-paper-primary px-3 py-2 text-paper-primary-foreground">
					<span className="block line-clamp-1 text-sm font-semibold">{deriveJournalTitle(journal, t)}</span>
				</div>

				{/* Current page peek, clipped to the tile shape. */}
				<div className="min-h-0 flex-1 overflow-hidden p-2">
					{activePage && activePage.text.trim() ? <NoteMarkdown content={activePage.text} /> : null}
				</div>

				{/* Page-count footer, with a bookmark glyph when the current page is bookmarked. */}
				<div className="flex shrink-0 items-center justify-between gap-2 bg-paper-primary px-3 py-1.5 text-xs text-paper-primary-foreground">
					{isCurrentPageBookmarked ? <Bookmark className="h-3.5 w-3.5 shrink-0 fill-current" /> : <span />}
					<span className="tabular-nums">
						{t('Cards.journalPageCount', { current: pageCount > 0 ? pageIndex + 1 : 0, total: pageCount })}
					</span>
				</div>
			</div>
		</div>
	);
}
