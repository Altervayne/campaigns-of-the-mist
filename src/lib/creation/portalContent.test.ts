// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Unit Under Test --
import { makePortalContent, portalTargetFromInsert } from './portalContent';

describe('portalTargetFromInsert', () => {
   it('maps an entity insert target to a portal entity target', () => {
      expect(portalTargetFromInsert({ kind: 'entity', entity: 'board', id: 'b1' })).toEqual({ kind: 'entity', entity: 'board', id: 'b1' });
   });

   it('forwards a pdf page onto the portal entity target', () => {
      expect(portalTargetFromInsert({ kind: 'entity', entity: 'pdf', id: 'p1', page: 42 })).toEqual({ kind: 'entity', entity: 'pdf', id: 'p1', page: 42 });
   });

   it('maps an element insert target to a portal element target', () => {
      expect(portalTargetFromInsert({ kind: 'element', drawerItemId: 'd1' })).toEqual({ kind: 'element', drawerItemId: 'd1' });
   });

   it('renames an external url to a portal external href', () => {
      expect(portalTargetFromInsert({ kind: 'external', url: 'https://x.y' })).toEqual({ kind: 'external', href: 'https://x.y' });
   });

   it('returns null for a section insert target (note-body only)', () => {
      expect(portalTargetFromInsert({ kind: 'section', slug: 'heading' })).toBeNull();
   });
});

describe('makePortalContent', () => {
   it('builds a portal with the smart-default icon+text style (label = defaultName)', () => {
      const content = makePortalContent({ kind: 'entity', entity: 'board', id: 'b1' }, 'The Keep');
      expect(content).toEqual({
         kind: 'portal',
         target: { kind: 'entity', entity: 'board', id: 'b1' },
         style: { visual: { kind: 'icon', icon: 'layout-grid' }, label: 'The Keep', align: 'right', background: true },
      });
   });

   it('derives the destination glyph name per target kind', () => {
      expect(makePortalContent({ kind: 'entity', entity: 'note', id: 'n1' }, 'x').style.visual).toEqual({ kind: 'icon', icon: 'notebook-pen' });
      expect(makePortalContent({ kind: 'entity', entity: 'character', id: 'c1' }, 'x').style.visual).toEqual({ kind: 'icon', icon: 'id-card' });
      expect(makePortalContent({ kind: 'element', drawerItemId: 'd1' }, 'x').style.visual).toEqual({ kind: 'icon', icon: 'shapes' });
      expect(makePortalContent({ kind: 'external', href: 'https://x.y' }, 'x').style.visual).toEqual({ kind: 'icon', icon: 'globe' });
   });
});
