// -- Type Imports --
import type { LinkTarget } from './linkTarget';
import type { PortalTarget } from '@/lib/types/board';

/*
 * Maps a stored, structured {@link PortalTarget} onto the shared resolver's {@link LinkTarget} WITHOUT a
 * string round-trip, so a portal rides the exact classify -> resolve -> dispatch path the note-body links use.
 * The two grammars overlap by design (`entity`/`element`/`external` are identical shapes); the only portal-
 * specific variant is `board-element` (a same-board spatial target), which is modeled now but has no resolver
 * mapping until the same-board phase - it returns `null` here so a caller treats it as an unsupported no-op.
 */

/** Converts a portal target to a resolver link target, or `null` for a variant not yet activatable. */
export function portalTargetToLinkTarget(target: PortalTarget): LinkTarget | null {
   switch (target.kind) {
      case 'entity':
         return { kind: 'entity', entity: target.entity, id: target.id, page: target.page };
      case 'element':
         return { kind: 'element', drawerItemId: target.drawerItemId };
      case 'external':
         return { kind: 'external', href: target.href };
      case 'board-element':
         // Same-board spatial target: modeled, but its center-on-item action ships in the same-board phase.
         return null;
   }
}
