// -- Component Imports --
import { BoardPostItItem } from './BoardPostItItem';
import { ZoneItem } from './ZoneItem';
import { BoardJournalItem } from './BoardJournalItem';
import { ImageItem } from './ImageItem';
import { PinItem } from './PinItem';
import { DiceTrayItem } from './DiceTrayItem';
import { RollTableItem } from './RollTableItem';
import { BoardCardItem } from './BoardCardItem';
import { BoardTrackerItem } from './BoardTrackerItem';
import { CharacterBoardItem } from './CharacterBoardItem';
import { BoardNoteItem } from './BoardNoteItem';
import { BoardPortalItem } from './BoardPortalItem';
import { BoardTextItem } from './BoardTextItem';
import { BoardDrawingItem } from './BoardDrawingItem';

// -- Type Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { BoardItem, BoardItemContent } from '@/lib/types/board';

/*
 * Picks the per-kind body for a board item. The note copies (post-it, journal) render their real,
 * editable body wrapped in the shared embed chrome (copy/source + Save-back); the native image kind
 * renders its editable body directly; embedded card/tracker copies render the real card/tracker
 * component read-only; a note reference tile live-mirrors a saved note (read-only, opens to its tab);
 * every other kind (threat, connection) falls back to a generic labelled box.
 * Content edits are dispatched through `onContentChange`, already bound to this item's id by the box.
 */

interface BoardItemBodyProps {
   item: BoardItem;
   isSelected: boolean;
   /** In its text-edit sub-state (post-it / journal / text): the body mounts the focused editor over the rendered view. */
   isEditing: boolean;
   /** The selection toolbar's per-kind action slot; a kind portals its actions here. Null when unselected. */
   toolbarSlot: HTMLElement | null;
   /** A non-clipped slot at the box's right edge (outside overflow-hidden); the journal portals its tabs here. */
   sideSlot: HTMLElement | null;
   /** A zone's member count, for its collapsed-bar badge (undefined for non-zones). */
   memberCount?: number;
   /** Commits new content for this item (one undoable command per edit session). */
   onContentChange: (content: BoardItemContent) => void;
   /** Caches a reference's last-known snapshot via a direct (non-undoable) write. */
   onCacheLastKnown: (id: string, content: BoardItemContent) => void;
   /** Adopts a Save-As drawer id onto a copy's source link via a direct (non-undoable) write. */
   onAdoptSource: (id: string, sourceDrawerItemId: string) => void;
   /** Removes this item (used by a dangling reference's placeholder). */
   onDelete: (id: string) => void;
   /** Selects this item (used by text fields that stop pointer propagation). */
   onRequestSelect: () => void;
   /** The deferred body press (drag-past-threshold moves, click selects); a zone's frame/title bar routes here. */
   onPressStart: (event: ReactPointerEvent) => void;
   /** Opens the portal restyle editor window, anchored at the click point (a portal's Edit affordance). */
   onRequestEditPortal: (itemId: string, screen: { x: number; y: number }) => void;
   /** Opens the target picker in retarget mode (a dead portal's Relink), anchored at the click point. */
   onRequestRelinkPortal: (itemId: string, screen: { x: number; y: number }) => void;
   /** Caches a portal's live-resolved target name into `lastKnownName` (a direct, non-undoable write). */
   onCachePortalName: (itemId: string, name: string) => void;
}

export function BoardItemBody({ item, isSelected, isEditing, toolbarSlot, sideSlot, memberCount, onContentChange, onCacheLastKnown, onAdoptSource, onDelete, onRequestSelect, onPressStart, onRequestEditPortal, onRequestRelinkPortal, onCachePortalName }: BoardItemBodyProps) {
   const { content } = item;

   switch (content.kind) {
      case 'post-it':
         return <BoardPostItItem item={item} content={content} isSelected={isSelected} isEditing={isEditing} toolbarSlot={toolbarSlot} onContentChange={onContentChange} onCacheLastKnown={onCacheLastKnown} onAdoptSource={onAdoptSource} onDelete={onDelete} onRequestSelect={onRequestSelect} />;
      case 'journal':
         return <BoardJournalItem item={item} content={content} isSelected={isSelected} isEditing={isEditing} toolbarSlot={toolbarSlot} sideSlot={sideSlot} onContentChange={onContentChange} onCacheLastKnown={onCacheLastKnown} onAdoptSource={onAdoptSource} onDelete={onDelete} onRequestSelect={onRequestSelect} />;
      case 'image':
         return <ImageItem content={content} isSelected={isSelected} toolbarSlot={toolbarSlot} onContentChange={onContentChange} onRequestSelect={onRequestSelect} />;
      case 'pin':
         return <PinItem content={content} isSelected={isSelected} toolbarSlot={toolbarSlot} onContentChange={onContentChange} />;
      case 'zone':
         return <ZoneItem content={content} isSelected={isSelected} toolbarSlot={toolbarSlot} memberCount={memberCount} onContentChange={onContentChange} onRequestSelect={onRequestSelect} onPressStart={onPressStart} />;
      case 'dice-tray':
         return <DiceTrayItem item={item} content={content} isSelected={isSelected} onContentChange={onContentChange} onCacheLastKnown={onCacheLastKnown} onRequestSelect={onRequestSelect} />;
      case 'roll-table':
         return <RollTableItem item={item} content={content} isSelected={isSelected} isEditing={isEditing} onContentChange={onContentChange} onCacheLastKnown={onCacheLastKnown} onRequestSelect={onRequestSelect} />;
      case 'card':
         return <BoardCardItem item={item} content={content} isSelected={isSelected} toolbarSlot={toolbarSlot} onContentChange={onContentChange} onCacheLastKnown={onCacheLastKnown} onAdoptSource={onAdoptSource} onDelete={onDelete} />;
      case 'tracker':
         return <BoardTrackerItem item={item} content={content} isSelected={isSelected} toolbarSlot={toolbarSlot} onContentChange={onContentChange} onCacheLastKnown={onCacheLastKnown} onAdoptSource={onAdoptSource} onDelete={onDelete} />;
      case 'character':
         return <CharacterBoardItem item={item} content={content} onCacheLastKnown={onCacheLastKnown} onDelete={onDelete} />;
      case 'note':
         return <BoardNoteItem item={item} content={content} isSelected={isSelected} toolbarSlot={toolbarSlot} onContentChange={onContentChange} onCacheLastKnown={onCacheLastKnown} onDelete={onDelete} />;
      case 'portal':
         return <BoardPortalItem item={item} content={content} isSelected={isSelected} toolbarSlot={toolbarSlot} onRequestEdit={onRequestEditPortal} onRequestRelink={onRequestRelinkPortal} onDelete={onDelete} onCacheName={onCachePortalName} />;
      case 'text':
         return <BoardTextItem item={item} content={content} isSelected={isSelected} isEditing={isEditing} toolbarSlot={toolbarSlot} onContentChange={onContentChange} />;
      case 'drawing':
         return <BoardDrawingItem id={item.id} content={content} />;
      default:
         return <GenericItemBody item={item} />;
   }
}

/** The pre-board-8 generic box: kind label + live size, for kinds without a real body yet. */
function GenericItemBody({ item }: { item: BoardItem }) {
   return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-card text-card-foreground">
         <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.kind}</span>
         <span className="text-[10px] text-muted-foreground">
            {Math.round(item.width)} × {Math.round(item.height)}
         </span>
      </div>
   );
}
