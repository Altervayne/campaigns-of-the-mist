// -- Type Imports --
import type { GeneralItemType } from '@/lib/types/common';

/*
 * The single authoring width shared by every document preview. Notes, journals, post-its, roll tables and
 * the full sheet render page-shaped at this width, so `cover` down-scales them by the same factor and text
 * density stays uniform cell to cell. Fixed-size game cards opt out - they render at their own natural
 * width and upscale to fill the stage (see `allowUpscale`).
 */
export const PREVIEW_PAGE_WIDTH = 'w-[440px]';

/*
 * The full document authoring size (width + a page-tall floor). Notes, journals, post-its, roll tables and
 * the full sheet fill this canvas.
 */
export const PREVIEW_PAGE = `${PREVIEW_PAGE_WIDTH} min-h-[500px]`;

/*
 * Per-type stage surface + fill for the drawer card: the stage wears the type's own palette so identity
 * reads before a glyph, and the fill matches the preview's silhouette. Portrait/square content cover-fills
 * (its own surface bleeds edge to edge under the fade); landscape content is contained on a canvas stage.
 * `allowUpscale` lifts the down-scale cap for fixed-size game cards, so a small card fills the stage width
 * and crops off the faded bottom. Single source for the live preview, so the search skeleton and later
 * identity accents extend one seam.
 */
export function drawerPreviewStage(type: GeneralItemType): { stageClassName: string; fit: 'cover' | 'contain'; allowUpscale?: boolean } {
   switch (type) {
      // Paper-surfaced documents: the parchment page fills and bleeds off the faded bottom.
      case 'NOTE':
      case 'JOURNAL':
      case 'PDF':
         return { stageClassName: 'bg-paper-background', fit: 'cover' };

      // Fixed-size game cards: upscaled to fill the stage width, cropping off the faded bottom. The stage
      // matches `--card` so the render's own palette carries the identity and the crop fades into it.
      case 'CHARACTER_CARD':
      case 'CHARACTER_THEME':
      case 'GROUP_THEME':
      case 'LOADOUT_THEME':
      case 'IMAGE_CARD':
      case 'CHALLENGE_CARD':
         return { stageClassName: 'bg-card', fit: 'cover', allowUpscale: true };

      // Page-authored card-surfaced content (roll table, full character overview): down-scaled like a
      // document, on the same `--card` stage.
      case 'ROLL_TABLE':
      case 'FULL_CHARACTER_SHEET':
         return { stageClassName: 'bg-card', fit: 'cover' };

      // Post-it: the colored sticky fills the stage; the stage itself stays neutral behind the fade.
      case 'POST_IT':
         return { stageClassName: 'bg-popover/30', fit: 'cover' };

      // Landscape canvases: contained and centered, the small margin reading as the surface behind.
      case 'FULL_BOARD':
         return { stageClassName: 'bg-popover/40', fit: 'contain' };

      // Short-wide trackers and any unavailable placeholder: contained on a neutral stage.
      default:
         return { stageClassName: 'bg-popover/30', fit: 'contain' };
   }
}
