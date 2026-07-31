// -- Type Imports --
import type { GeneralItemType } from '@/lib/types/drawer';

/*
 * The Portals link-INSERT side (the picker's counterpart to `linkTarget.ts`'s parse side): pure helpers that
 * turn a picked target into the markdown token the note buffer stores, plus URL auto-detection for the
 * search-first picker. No store/DOM imports, so the token grammar + URL heuristic are unit-testable in one
 * place and can't drift from what `parseLinkHref` reads back.
 *
 * Id-kind rule (mirrors the resolver): entity links (note/board/character - they own a tab) carry the ENTITY
 * id; every other element carries its DRAWER ITEM id (`cotm://item/<id>`, the id `embeddedSpecForDrawerItem`
 * eats). `entityForItemType` is the single source of that split.
 */

/** A target the picker has resolved, ready to become a link token. */
export type LinkInsertTarget =
   | { kind: 'section'; slug: string }
   | { kind: 'entity'; entity: 'note' | 'board' | 'character'; id: string }
   | { kind: 'element'; drawerItemId: string }
   | { kind: 'external'; url: string };

/** The three drawer item types that own a tab (entity links); everything else is a tabless element. */
const ITEM_TYPE_ENTITY: Partial<Record<GeneralItemType, 'note' | 'board' | 'character'>> = {
   NOTE: 'note',
   FULL_BOARD: 'board',
   FULL_CHARACTER_SHEET: 'character',
};

/** The entity kind a drawer item type links as, or `null` when it's a tabless element (addressed by item id). */
export function entityForItemType(type: GeneralItemType): 'note' | 'board' | 'character' | null {
   return ITEM_TYPE_ENTITY[type] ?? null;
}

/** Builds the `href` for a picked target - the exact string `parseLinkHref` reads back. */
export function buildLinkHref(target: LinkInsertTarget): string {
   switch (target.kind) {
      case 'section':
         return `#${target.slug}`;
      case 'entity':
         return `cotm://${target.entity}/${target.id}`;
      case 'element':
         return `cotm://item/${target.drawerItemId}`;
      case 'external':
         return target.url;
   }
}

/** Builds the full markdown link `[label](href)`, escaping the two characters that would break the token. */
export function buildLinkMarkdown(label: string, target: LinkInsertTarget): string {
   const safeLabel = label.replace(/\]/g, '\\]');
   return `[${safeLabel}](${buildLinkHref(target)})`;
}

/**
 * Detects an external URL in the picker input, returning a normalized `href` or `null`. An explicit scheme
 * (`http(s)://`, or any `scheme://`) passes through; a bare `domain.tld[/path]` shape gets an `https://`
 * prefix. Anything with whitespace, or without a dotted host, is not a URL (it's a search term).
 */
export function detectExternalUrl(input: string): string | null {
   const value = input.trim();
   if (!value || /\s/.test(value)) return null;
   if (/^https?:\/\//i.test(value)) return value;
   if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return value; // another explicit scheme (ftp://, ...)
   // Bare host shape: at least one dot with a 2+ letter TLD, optional port/path/query/hash, no scheme.
   if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(value)) return `https://${value}`;
   return null;
}
