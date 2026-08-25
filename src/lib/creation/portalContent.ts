// -- Board Imports --
import { smartPortalIconName } from '@/lib/board/portalIcons';

// -- Type Imports --
import type { PortalBoardContent, PortalTarget } from '@/lib/types/board';
import type { LinkInsertTarget } from '@/lib/portals/buildLinkToken';

/*
 * The portal-create side: turns a picked target into a fresh {@link PortalBoardContent} with a smart default
 * style (the target's own name as the label, its destination glyph as the icon), so the common case is
 * zero-config. The full restyle editor + curated icon picker are a later phase; this is the one-step drop.
 */

/**
 * Maps the picker's {@link LinkInsertTarget} onto a stored {@link PortalTarget}. A `section` target is
 * note-body-only and never offered in the portal picker, so it yields `null` (ignored). The other three are
 * the same id kinds the portal model carries (`external` renames `url` -> `href`).
 */
export function portalTargetFromInsert(insert: LinkInsertTarget): PortalTarget | null {
   switch (insert.kind) {
      case 'entity':
         // A pdf carries its page; the other entities leave it undefined.
         return { kind: 'entity', entity: insert.entity, id: insert.id, page: insert.page };
      case 'element':
         return { kind: 'element', drawerItemId: insert.drawerItemId };
      case 'external':
         return { kind: 'external', href: insert.url };
      case 'section':
         return null;
   }
}

/** Builds a fresh portal's content for `target`, with the smart-default icon+text style (label = `defaultName`). */
export function makePortalContent(target: PortalTarget, defaultName: string): PortalBoardContent {
   return {
      kind: 'portal',
      target,
      style: { visual: { kind: 'icon', icon: smartPortalIconName(target) }, label: defaultName, align: 'right', background: true },
   };
}
