// -- React Imports --
import React from 'react';

// -- Other Library Imports --
import { motion } from 'framer-motion';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';

// -- Component Imports --
import { ToolbarHandle } from '@/components/molecules/ToolbarHandle';

// -- Type Imports --
import type { Card as CardData } from '@/lib/types/character';
import type { ToolbarRevealHandlers } from '@/hooks/toolbarReveal';

interface CardFlipWrapperProps {
  effectiveViewMode: 'FLIP' | 'SIDE_BY_SIDE';
  isDrawerPreview: boolean;
  /** Board embed: uses the card's own view mode (default flip, never the global) and no sheet chrome - the board toolbar carries the actions. */
  isBoardEmbed?: boolean;
  isSnapshot?: boolean;
  isMobile?: boolean;
  useVerticalStack?: boolean;
  card: CardData;

  // Reveal (hover on a fine pointer, tap-to-select on a coarse one)
  isRevealed: boolean;
  revealHandlers: ToolbarRevealHandlers;

  // Toolbar
  isEditing: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  cardTheme: string;
  onExport?: () => void;
  onCycleViewMode: () => void;

  // Optional toolbar actions
  onFlip?: () => void;
  onDelete?: () => void;
  onEditCard?: () => void;

  // Content
  cardFront: React.ReactNode;
  cardBack: React.ReactNode;
}



/**
 * Wrapper component that handles card flip and side-by-side view modes.
 *
 * @example
 * ```tsx
 * return (
 *   <CardFlipWrapper
 *     ref={ref}
 *     effectiveViewMode={effectiveViewMode}
 *     isDrawerPreview={isDrawerPreview}
 *     card={card}
 *     isRevealed={isRevealed}
 *     revealHandlers={revealHandlers}
 *     isEditing={isEditing}
 *     cardTheme="card-type-hero"
 *     onFlip={() => actions.flipCard(card.id)}
 *     onCycleViewMode={handleCycleViewMode}
 *     cardFront={<Card>...</Card>}
 *     cardBack={<Card>...</Card>}
 *   />
 * );
 * ```
 */
export const CardFlipWrapper = React.forwardRef<HTMLDivElement, CardFlipWrapperProps>(
  ({ effectiveViewMode, isDrawerPreview, isBoardEmbed = false, useVerticalStack, card, isRevealed, revealHandlers,
     isEditing, dragAttributes, dragListeners, cardTheme, onExport, onCycleViewMode,
     onFlip, onDelete, onEditCard, cardFront, cardBack }, ref) => {

    // The board uses each card's own view mode (default flip), never the global side-by-side. A horizontal
    // side-by-side would overflow the fixed-width box, so the board stacks vertically (useVerticalStack).
    const viewMode = isBoardEmbed ? (card.viewMode ?? 'FLIP') : effectiveViewMode;

    if (viewMode === 'SIDE_BY_SIDE' && !isDrawerPreview) {
      return (
        <motion.div ref={ref} {...revealHandlers} className="relative">
          {!isBoardEmbed && (
            <ToolbarHandle
              isEditing={isEditing}
              isHovered={isRevealed}
              dragAttributes={dragAttributes}
              dragListeners={dragListeners}
              onDelete={onDelete}
              onEditCard={onEditCard}
              onExport={onExport}
              onCycleViewMode={onCycleViewMode}
              cardViewMode={card.viewMode}
              cardTheme={cardTheme}
            />
          )}
          <div className={useVerticalStack ? "flex flex-col gap-2" : "flex gap-1 items-start"}>
            {cardFront}
            {cardBack}
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div ref={ref} {...revealHandlers} className="relative">
        <motion.div
          className="w-full h-full"
          style={{ transformStyle: 'preserve-3d' }}
          // `initial` mirrors the current flip state so a card that mounts already
          // flipped simply *renders* flipped instead of animating 0 -> 180 (the
          // animation should only play on an actual flip toggle). Because `initial`
          // equals the first `animate` value, framer-motion plays no mount
          // animation; later changes to `card.isFlipped` still animate normally.
          initial={{ rotateY: card.isFlipped ? 180 : 0 }}
          animate={{ rotateY: card.isFlipped ? 180 : 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        >
          {!isDrawerPreview && !isBoardEmbed && (
            <ToolbarHandle
              isEditing={isEditing}
              isHovered={isRevealed}
              onFlip={onFlip}
              onDelete={onDelete}
              onEditCard={onEditCard}
              dragAttributes={dragAttributes}
              dragListeners={dragListeners}
              onExport={onExport}
              onCycleViewMode={onCycleViewMode}
              cardViewMode={card.viewMode}
              cardTheme={cardTheme}
            />
          )}
          <div style={{ backfaceVisibility: 'hidden' }}>
            {cardFront}
          </div>
          <div
            className="absolute top-0 left-0 w-full h-full"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            {cardBack}
          </div>
        </motion.div>
      </motion.div>
    );
  }
);

CardFlipWrapper.displayName = 'CardFlipWrapper';
