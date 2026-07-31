// -- React Imports --
import type { TouchEvent } from 'react';

// -- Component Imports --
import MobileCardCarousel from '@/components/mobile/character-sheet/MobileCardCarousel';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { ResolvedSheetItem } from '@/lib/character/sheetLayout';



interface MobileCardAreaProps {
	items: ResolvedSheetItem[];
	currentIndex: number;
	isLeftHanded: boolean;
	touchHandlers: { onTouchStart: (event: TouchEvent) => void; onTouchEnd: (event: TouchEvent) => void };
	onOpenAddCard?: () => void;
}

/**
 * Extra inner padding on the centred card's handedness-leading side, used to
 * nudge the card toward the trailing side so it clears the corner FAB (letting
 * the FAB keep a single resting position on every tab).
 *
 * This is a layout shift, NOT a `transform`. A `transform: translateX(...)`
 * promotes the whole card subtree to a GPU layer and then draws it at the
 * translate's offset; when that offset is a fractional device pixel (the value
 * below is `13.5px` at 375px, and the device-pixel-ratio multiplies it) the
 * rasterised card bitmap is resampled and the card looks blurry / "slightly
 * scaled". Padding moves the box in normal layout with no rasterised layer, so
 * the card text and borders stay crisp.
 *
 * Padding on one side of a `justify-center` flex container shifts the centred
 * child by half the padding, so this is twice the desired shift. The shift
 * itself is the shortfall between the FAB's ~64px leading gutter and the card's
 * natural side margin - `calc(201px - 50vw)` - clamped so it never pushes the
 * card past an 8px trailing minimum (`calc(50vw - 145px)`) and collapses to 0
 * once the natural margin already clears the gutter (~402px+), leaving wide
 * screens untouched. The card is a fixed `w-62.5` (250px) centred inside the
 * area's `p-3` (12px), so each natural side margin is `calc(50vw - 137px)`.
 */
const FAB_CLEARANCE_PADDING = 'calc(2 * max(0px, min(calc(201px - 50vw), calc(50vw - 145px))))';

/**
 * The scrollable card display area of the mobile character sheet, wrapping the
 * card carousel and carrying the card-area swipe handlers (horizontal swipe on
 * the card body navigates to the previous/next card) spread from the sheet's
 * gesture hook. The `data-tutorial` anchor is preserved.
 *
 * The displayed card is centred; it is nudged toward the handedness-trailing
 * side via {@link FAB_CLEARANCE_PADDING} (a crisp, layout-based padding shift -
 * see that constant) so the corner FAB clears the card's edge controls without
 * the FAB having to move.
 *
 * @param isLeftHanded - The FAB rests on this (leading) side, so the card is shifted the other way: right when true, left otherwise.
 */
export function MobileCardArea({ items, currentIndex, isLeftHanded, touchHandlers, onOpenAddCard }: MobileCardAreaProps) {
	// A journal fills the stage width and height and scrolls its own page body, so the centring, the
	// FAB-clearance nudge (both assume a fixed-width centred card), and the outer scroll are all dropped.
	const isJournal = items[currentIndex]?.kind === 'journal';

	// Pad the FAB side so the centred card shifts away from it (see constant).
	const clearanceStyle = isLeftHanded
		? { paddingLeft: FAB_CLEARANCE_PADDING }
		: { paddingRight: FAB_CLEARANCE_PADDING };

	return (
		<div
			className={cn('flex-1 overflow-x-hidden p-3', isJournal ? 'overflow-hidden' : 'overflow-y-auto')}
			data-tutorial="card-carousel"
			{...touchHandlers}
		>
			<div className={cn(isJournal ? 'h-full' : 'min-h-full flex items-center justify-center')} style={isJournal ? undefined : clearanceStyle}>
				<MobileCardCarousel
					items={items}
					currentIndex={currentIndex}
					onOpenAddCard={onOpenAddCard}
				/>
			</div>
		</div>
	);
}
