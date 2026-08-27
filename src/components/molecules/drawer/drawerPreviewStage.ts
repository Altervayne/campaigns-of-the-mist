// -- Type Imports --
import type { GeneralItemType } from '@/lib/types/common';

/*
 * Per-type stage surface + fill for the drawer card: the stage wears the type's own palette so identity
 * reads before a glyph, and the fill matches the preview's silhouette. Portrait/square content cover-fills
 * (its own surface bleeds edge to edge under the fade); landscape content is contained on a canvas stage.
 * Single source for the live preview, so the search skeleton and later identity accents extend one seam.
 */
export function drawerPreviewStage(type: GeneralItemType): { stageClassName: string; fit: 'cover' | 'contain' } {
   switch (type) {
      // Paper-surfaced documents: the parchment page fills and bleeds off the faded bottom.
      case 'NOTE':
      case 'PDF':
         return { stageClassName: 'bg-paper-background', fit: 'cover' };

      // Card-surfaced content (journals, roll tables, character/theme/challenge/image cards): the stage
      // matches `--card` so the render's own palette carries the identity.
      case 'JOURNAL':
      case 'ROLL_TABLE':
      case 'CHARACTER_CARD':
      case 'CHARACTER_THEME':
      case 'GROUP_THEME':
      case 'LOADOUT_THEME':
      case 'IMAGE_CARD':
      case 'CHALLENGE_CARD':
         return { stageClassName: 'bg-card', fit: 'cover' };

      // Post-it: the colored sticky fills the stage; the stage itself stays neutral behind the fade.
      case 'POST_IT':
         return { stageClassName: 'bg-popover/30', fit: 'cover' };

      // Landscape canvases: contained and centered, the small margin reading as the surface behind.
      case 'FULL_BOARD':
      case 'FULL_CHARACTER_SHEET':
         return { stageClassName: 'bg-popover/40', fit: 'contain' };

      // Short-wide trackers and any unavailable placeholder: contained on a neutral stage.
      default:
         return { stageClassName: 'bg-popover/30', fit: 'contain' };
   }
}
