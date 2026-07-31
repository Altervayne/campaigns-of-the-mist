// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { resolveCardComponent } from '@/components/organisms/cards/resolveCardComponent';
import { AddCardButton } from '@/components/molecules/AddThemeCardButton';
import { MobileJournalCard } from '@/components/mobile/character-sheet/MobileJournalCard';

// -- Type Imports --
import type { Card as CardData } from '@/lib/types/character';
import type { ResolvedSheetItem } from '@/lib/character/sheetLayout';



/**
 * Extra inner padding on the centred card's handedness-leading side, nudging the card toward the trailing
 * side so it clears the corner FAB (letting the FAB keep one resting position on every tab).
 *
 * This is a layout shift, NOT a `transform`. A `transform: translateX(...)` promotes the card subtree to a
 * GPU layer drawn at the translate's offset; a fractional device pixel there resamples the rasterised card
 * and it looks blurry. Padding moves the box in normal layout with no rasterised layer, so text/borders
 * stay crisp. The pager's own transform lives on the track, never on the card.
 *
 * Padding on one side of a `justify-center` flex container shifts the centred child by half the padding, so
 * this is twice the desired shift. The shift is the shortfall between the FAB's ~64px leading gutter and the
 * card's natural side margin (`calc(201px - 50vw)`), clamped so it never pushes the card past an 8px
 * trailing minimum (`calc(50vw - 145px)`) and collapses to 0 once the natural margin already clears the
 * gutter (~402px+). The card is a fixed `w-62.5` (250px) centred inside the slot's `p-3` (12px).
 */
const FAB_CLEARANCE_PADDING = 'calc(2 * max(0px, min(calc(201px - 50vw), calc(50vw - 145px))))';

interface MobileSheetCardSlotProps {
   /** The item on this page, or `undefined` for the empty-cards page (add-card placeholder). */
   item: ResolvedSheetItem | undefined;
   isLeftHanded: boolean;
   isEditing: boolean;
   onOpenAddCard?: () => void;
}

/**
 * One page of the mobile sheet pager: a single card centred in the slot (nudged clear of the corner FAB via
 * {@link FAB_CLEARANCE_PADDING} and scrolling its own overflow when tall), a journal filling the slot with
 * its own frame, or - when the character has no cards or journals - the add-card placeholder that is the
 * only route to creating a first sheet element. Horizontal paging is owned by the track, so this carries no
 * swipe handlers.
 */
export function MobileSheetCardSlot({ item, isLeftHanded, isEditing, onOpenAddCard }: MobileSheetCardSlotProps) {
   const { t } = useTranslation();

   if (!item) {
      return (
         <div className="flex h-full w-full flex-col overflow-y-auto">
            <div className="m-auto flex flex-col items-center gap-4 p-8 text-center">
               <p className="text-lg text-muted-foreground">{t('MobileCardCarousel.noCards')}</p>
               {onOpenAddCard && <AddCardButton onClick={onOpenAddCard} />}
            </div>
         </div>
      );
   }

   if (item.kind === 'journal') {
      return (
         <div className="h-full w-full overflow-hidden p-3">
            <MobileJournalCard journal={item.journal} />
         </div>
      );
   }

   const clearanceStyle = isLeftHanded
      ? { paddingLeft: FAB_CLEARANCE_PADDING }
      : { paddingRight: FAB_CLEARANCE_PADDING };

   return (
      <div className="h-full w-full overflow-x-hidden overflow-y-auto p-3">
         <div className="flex min-h-full items-center justify-center" style={clearanceStyle}>
            <MobileSheetCard key={item.card.id} card={item.card} isEditing={isEditing} />
         </div>
      </div>
   );
}

interface MobileSheetCardProps {
   card: CardData;
   isEditing: boolean;
}

/**
 * Resolves and renders a single card by type/game. Keyed by `card.id` at the call site so moving onto an
 * already-flipped card remounts rather than reuses an instance - a reused instance would see its flip
 * `animate` value change and replay the flip; a remount lets the flip wrapper's state-matching `initial`
 * render it flipped with no animation.
 */
function MobileSheetCard({ card, isEditing }: MobileSheetCardProps) {
   const Component = resolveCardComponent(card.cardType, card.details.game);

   if (!Component) {
      return (
         <div className="flex h-full w-full items-center justify-center rounded-lg border-2 border-border bg-card p-8">
            <p className="text-center text-muted-foreground">
               {`NO RENDER AVAILABLE FOR THIS TYPE: ${card.details.game} ${card.cardType}`}
            </p>
         </div>
      );
   }

   return (
      // resolveCardComponent returns one of six stable module-level card components, so static-components
      // is a false positive here (same as CardRenderer / BoardCardItem).
      // eslint-disable-next-line react-hooks/static-components
      <Component
         card={card}
         isEditing={isEditing}
         useVerticalStack
         // The portrait renders at a fixed mobile footprint; its edit controls live in the portrait screen.
         isMobile={card.cardType === 'IMAGE_CARD'}
         onEditCard={() => {}}
         onExport={() => {}}
      />
   );
}
