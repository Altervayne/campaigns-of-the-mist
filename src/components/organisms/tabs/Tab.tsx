// -- Component Imports --
import { CharacterTab } from './CharacterTab';
import { BoardTab } from './BoardTab';
import { NoteTab } from './NoteTab';
import { PdfTab } from './PdfTab';

// -- Type Imports --
import type { OpenTab } from '@/lib/character/tabManagerStore';

/**
 * A single tab in the desktop {@link import('./TabStrip').TabStrip}, dispatched by
 * kind: a {@link BoardTab} for board tabs, a {@link NoteTab} for note tabs, a
 * {@link PdfTab} for pdf tabs, a {@link CharacterTab} otherwise. All share the presentational
 * {@link import('./TabShell').TabShell} (drag-to-reorder, active styling, close button),
 * so the strip treats every tab identically.
 *
 * @param props.tab - The tab descriptor (its `type` selects the kind, its `id` keys the store instance).
 * @param props.isActive - Whether this tab is the active one (drives the highlight).
 */
export function Tab({ tab, isActive }: { tab: OpenTab; isActive: boolean }) {
   if (tab.type === 'board') return <BoardTab tab={tab} isActive={isActive} />;
   if (tab.type === 'note') return <NoteTab tab={tab} isActive={isActive} />;
   if (tab.type === 'pdf') return <PdfTab tab={tab} isActive={isActive} />;
   return <CharacterTab tab={tab} isActive={isActive} />;
}
