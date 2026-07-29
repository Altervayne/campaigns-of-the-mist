// -- Custom Hooks --
import { useAssetObjectUrl } from '@/hooks/useAssetObjectUrl';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Local Imports --
import { COVER_GAP_REM, clampCoverWidth, clampCoverAspect } from './noteCoverClasses';

// -- Type Imports --
import type { NoteCover as NoteCoverData } from '@/lib/types/board';

/*
 * The note-level COVER image, in the READING render (react-markdown / NoteDocument). A cover floats top-left
 * inside the prose measure so the opening text wraps beside it - magazine drop-cap layout. This is the
 * react-markdown path, NOT CM6, so a real `float:left` is honest here (Live uses a padding-inset gutter
 * instead, because a float is invisible to CM6's cursor line-map - see `live/coverGutter`).
 *
 * The cover is a fixed BOX (`width` % of the measure, by `aspect`) the image fills via `object-fit: cover`
 * (fills + crops, keeps its own ratio) - the same box the Live overlay renders, so a mode switch never jumps.
 * On the paper palette (the image is document content, not chrome). A missing/reclaimed blob renders nothing
 * so a cover-less document reads clean.
 */
export function NoteCover({ cover, className }: { cover: NoteCoverData; className?: string }) {
   const { url } = useAssetObjectUrl(cover.hash);
   if (!url) return null;
   const width = clampCoverWidth(cover.width);
   return (
      <span
         className={cn('float-left block overflow-hidden rounded-md shadow-sm', className)}
         style={{
            width: `${width}%`,
            aspectRatio: `1 / ${clampCoverAspect(cover.aspect)}`,
            marginRight: `${COVER_GAP_REM}rem`,
            marginBottom: `${COVER_GAP_REM * 0.5}rem`,
         }}
      >
         <img src={url} alt="" draggable={false} className="block h-full w-full object-cover" />
      </span>
   );
}
