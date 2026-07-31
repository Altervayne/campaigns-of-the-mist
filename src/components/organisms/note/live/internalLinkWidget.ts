// -- CodeMirror Imports --
import { WidgetType } from '@codemirror/view';

// -- Shared chip styling (single-sourced with the Reading chip) --
import {
   INTERNAL_LINK_CHIP,
   INTERNAL_LINK_CHIP_DEAD,
   INTERNAL_LINK_ICON,
   INTERNAL_LINK_TEXT_DEAD,
   linkChipFallbackLabel,
} from '@/components/molecules/markdown/InternalLinkChip';

// -- Portals Imports --
import { chooseLinkIcon, getCachedLinkMetadata, loadLinkMetadata } from '@/lib/portals/linkMetadata';

// -- Type Imports --
import type { LinkTarget } from '@/lib/portals/linkTarget';
import type { LinkIconChoice, LinkMetadata } from '@/lib/portals/linkMetadata';
import type { GeneralItemType } from '@/lib/types/drawer';

/*
 * The CM6 live-editor widget for an internal-link chip. It renders the SAME class-strings/structure as the
 * react-markdown `InternalLinkChip` (imported single-sourced), so Live == Reading. Pure imperative DOM - no
 * React root per widget - matching the mention-pill widget. The underlying `[text](cotm://...)` doc text is
 * untouched; this only replaces its rendering off the caret's line (the raw markdown reveals on the line).
 *
 * Metadata parity: a section resolves synchronously (against the doc's headings, done in the decoration
 * builder); an entity/element reads the shared drawer-metadata cache. When that cache is UNKNOWN at build the
 * chip renders LIVE and kicks off a load, patching ITS OWN DOM when the load settles (the same async-settle
 * pattern the asset-image widget uses) - so a confirmed miss shows the dead chip without a false dead flash.
 *
 * The leading icon mirrors `chooseLinkIcon` as inline SVG copied from lucide-react (v0.562.0). Kept as raw SVG
 * because a CM6 widget must not pull React (the same reason the cover/format/image widgets hand-write glyphs).
 */

/** A section heading glyph (lucide `Hash`). */
const SECTION_ICON_INNER =
   '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>';
/** The generic link glyph (lucide `Link2`) - an element whose concrete type isn't known yet. */
const GENERIC_ICON_INNER = '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>';
/** The broken-link glyph (lucide `Link2Off`) - a confirmed-missing target. */
const DEAD_ICON_INNER =
   '<path d="M9 17H7A5 5 0 0 1 7 7"/><path d="M15 7h2a5 5 0 0 1 4 8"/><line x1="8" x2="12" y1="12" y2="12"/><line x1="2" x2="22" y1="2" y2="22"/>';

/**
 * Inner SVG per drawer item type - the imperative twin of `getItemTypeIconComponent`, copied from lucide-react
 * v0.562.0 so an entity/element chip shows the SAME glyph as its drawer row. Types without a bespoke glyph fall
 * back to the file glyph (mirroring the component map's default).
 */
const FILE_TEXT_INNER =
   '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>';
const ITEM_TYPE_ICON_INNER: Partial<Record<GeneralItemType, string>> = {
   CHARACTER_CARD:
      '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M16 22a4 4 0 0 0-8 0"/><circle cx="12" cy="15" r="3"/>',
   FULL_CHARACTER_SHEET:
      '<path d="M16 10h2"/><path d="M16 14h2"/><path d="M6.17 15a3 3 0 0 1 5.66 0"/><circle cx="9" cy="11" r="2"/><rect x="2" y="5" width="20" height="14" rx="2"/>',
   CHARACTER_THEME: FILE_TEXT_INNER,
   GROUP_THEME:
      '<path d="M13 22h5a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v7"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M3.62 18.8A2.25 2.25 0 1 1 7 15.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a1 1 0 0 1-1.507 0z"/>',
   STATUS_TRACKER: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
   STORY_TAG_TRACKER: '<rect width="20" height="12" x="2" y="6" rx="2"/><path d="M12 12h.01"/><path d="M17 12h.01"/><path d="M7 12h.01"/>',
   STORY_THEME_TRACKER:
      '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2"/><path d="M3 11h3c.8 0 1.6.3 2.1.9l1.1.9c1.6 1.6 4.1 1.6 5.7 0l1.1-.9c.5-.5 1.3-.9 2.1-.9H21"/>',
   IMAGE_CARD:
      '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
   CHALLENGE_CARD:
      '<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>',
   POST_IT:
      '<path d="M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/><path d="M15 3v5a1 1 0 0 0 1 1h5"/>',
   JOURNAL:
      '<path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9.5 8h5"/><path d="M9.5 12H16"/><path d="M9.5 16H14"/>',
   NOTE:
      '<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>',
   FULL_BOARD:
      '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
};

/** The inner SVG for a shared {@link LinkIconChoice} - the Live half of the single-sourced icon choice. */
function iconInnerForChoice(choice: LinkIconChoice): string {
   switch (choice.kind) {
      case 'section':
         return SECTION_ICON_INNER;
      case 'dead':
         return DEAD_ICON_INNER;
      case 'itemType':
         return ITEM_TYPE_ICON_INNER[choice.itemType] ?? FILE_TEXT_INNER;
      case 'generic':
         return GENERIC_ICON_INNER;
   }
}

/** The label a chip shows: the author's text, else the target's resolved name, else its raw address. */
function chipLabel(target: LinkTarget, authorLabel: string, metadata: LinkMetadata | undefined): string {
   return authorLabel || metadata?.displayName || linkChipFallbackLabel(target);
}

export class InternalLinkWidget extends WidgetType {
   private readonly target: LinkTarget;
   private readonly authorLabel: string;
   private readonly metadata: LinkMetadata | undefined;
   private readonly deadTooltip: string;

   constructor(target: LinkTarget, authorLabel: string, metadata: LinkMetadata | undefined, deadTooltip: string) {
      super();
      this.target = target;
      this.authorLabel = authorLabel;
      this.metadata = metadata;
      this.deadTooltip = deadTooltip;
   }

   // Identical chips reuse the DOM; a change in the resolved metadata (a load settling, a rename/delete) rebuilds.
   eq(other: InternalLinkWidget): boolean {
      return (
         other.authorLabel === this.authorLabel &&
         other.deadTooltip === this.deadTooltip &&
         sameTarget(other.target, this.target) &&
         sameMetadata(other.metadata, this.metadata)
      );
   }

   toDOM(): HTMLElement {
      const chip = document.createElement('span');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      chip.appendChild(svg);

      const text = document.createElement('span');
      chip.appendChild(text);

      // Prefer the build-time snapshot, else the freshest cache read (it may have filled since the build).
      const known = this.metadata ?? getCachedLinkMetadata(this.target);
      this.paint(chip, svg, text, known);

      // Still UNKNOWN: render live now, load, then patch this DOM when it settles (no false dead flash).
      if (known === undefined) {
         void loadLinkMetadata(this.target).then((metadata) => {
            if (chip.isConnected) this.paint(chip, svg, text, metadata);
         });
      }
      return chip;
   }

   /** Renders the chip's classes, icon, label, and dead tooltip for a given metadata snapshot. */
   private paint(chip: HTMLElement, svg: SVGElement, text: HTMLElement, metadata: LinkMetadata | undefined): void {
      const dead = metadata?.exists === false;
      chip.className = dead ? `${INTERNAL_LINK_CHIP} ${INTERNAL_LINK_CHIP_DEAD}` : INTERNAL_LINK_CHIP;
      if (dead) chip.title = this.deadTooltip; else chip.removeAttribute('title');
      svg.setAttribute('class', INTERNAL_LINK_ICON);
      svg.innerHTML = iconInnerForChoice(chooseLinkIcon(this.target, metadata));
      text.className = dead ? INTERNAL_LINK_TEXT_DEAD : '';
      text.textContent = chipLabel(this.target, this.authorLabel, metadata);
   }

   // Let a click through so the caret can land on the `[text](...)` to edit it (Live-Preview reveal-on-cursor).
   ignoreEvent(): boolean {
      return false;
   }
}

/** Whether two link targets address the same thing (drives widget DOM reuse). */
function sameTarget(a: LinkTarget, b: LinkTarget): boolean {
   if (a.kind !== b.kind) return false;
   if (a.kind === 'section' && b.kind === 'section') return a.slug === b.slug;
   if (a.kind === 'entity' && b.kind === 'entity') return a.entity === b.entity && a.id === b.id;
   if (a.kind === 'element' && b.kind === 'element') return a.drawerItemId === b.drawerItemId;
   if (a.kind === 'external' && b.kind === 'external') return a.href === b.href;
   if (a.kind === 'unknown' && b.kind === 'unknown') return a.href === b.href;
   return false;
}

/** Whether two metadata snapshots render identically (undefined = still unknown). */
function sameMetadata(a: LinkMetadata | undefined, b: LinkMetadata | undefined): boolean {
   if (a === b) return true;
   if (!a || !b) return false;
   return a.exists === b.exists && a.displayName === b.displayName && a.itemType === b.itemType;
}
