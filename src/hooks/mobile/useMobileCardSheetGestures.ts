// -- React Imports --
import { useRef, type TouchEvent, type Dispatch, type SetStateAction } from 'react';

// -- Type Imports --
import type { Character } from '@/lib/types/character';



interface UseMobileCardSheetGesturesParameters {
	character: Character | null;
	/** The count of the resolved sheet layout (cards + journals), the bound for card-stepping. */
	itemCount: number;
	safeCardIndex: number;
	isLeftHanded: boolean;
	isMobileFABMode: boolean;
	isToolbeltOpen: boolean;
	setCurrentCardIndex: Dispatch<SetStateAction<number>>;
	setIsToolbeltOpen: (value: boolean) => void;
	onNavigateToTrackers: () => void;
	onNavigateToCards: () => void;
}

// A swipe must be clearly horizontal to count as navigation: its horizontal travel
// must dominate its vertical travel (G3), so a diagonal scroll never navigates. It
// must also clear a minimum distance.
const NAVIGATE_HORIZONTAL_DOMINANCE = 1.5;
const NAVIGATE_MIN_DISTANCE = 50;

// The shared gate for every navigate-swipe surface (card stepping and the
// trackers <-> cards crossover), so all directions feel identical.
const isHorizontalNavigationSwipe = (deltaX: number, deltaY: number) =>
	Math.abs(deltaX) >= NAVIGATE_HORIZONTAL_DOMINANCE * Math.abs(deltaY) &&
	Math.abs(deltaX) >= NAVIGATE_MIN_DISTANCE;

/**
 * Owns the mobile character sheet's three touch-swipe surfaces and returns the
 * touch handlers to spread onto each.
 *
 * - **Card area:** a horizontal swipe anywhere on the card body navigates to the
 *   previous/next card (same logic as the nav bar); a "previous" swipe on the first
 *   card crosses over to the Trackers tab. Card flip is now an explicit
 *   nav-bar button, so the former edge-swipe-flip is retired; the former
 *   side-panel edge-swipe-toolbelt is also retired here in favour of the tab-bar
 *   toolbelt button, so the card body navigates uniformly with no edge zones.
 * - **Nav bar:** a horizontal swipe navigates to the previous/next card. (Card
 *   reorder is entered via the toolbelt's reorder action and performed by
 *   drag-to-reorder, so the former swipe-up-to-reorder gesture is retired.)
 * - **Trackers area:** a horizontal edge-swipe opens the toolbelt (side-panel mode
 *   only), branching on handedness; a clear left-swipe elsewhere crosses over to the
 *   Cards tab - the mirror of the first-card crossover back to Trackers.
 *
 * Every navigate-swipe surface shares one rule (horizontal-dominance + minimum
 * distance) via {@link isHorizontalNavigationSwipe}, so card stepping and the
 * trackers <-> cards crossover feel identical in both directions. The trackers
 * area's edge thresholds, `window.innerWidth` read, and handedness / FAB-mode /
 * `isToolbeltOpen` branches are preserved; the toolbelt gesture wins over navigation
 * when it consumes the swipe. The card index stays owned by the component, which the
 * nav bar dots/buttons and carousel also read.
 *
 * @returns Per-surface `{ onTouchStart, onTouchEnd }` objects to spread onto the
 *   card area, nav bar, and trackers area elements.
 */
export function useMobileCardSheetGestures({
	character,
	itemCount,
	safeCardIndex,
	isLeftHanded,
	isMobileFABMode,
	isToolbeltOpen,
	setCurrentCardIndex,
	setIsToolbeltOpen,
	onNavigateToTrackers,
	onNavigateToCards,
}: UseMobileCardSheetGesturesParameters) {
	// Shared prev/next navigation for the card-area and nav-bar swipes. Steps one
	// item on a clearly-horizontal swipe (G3 dominance + minimum distance),
	// clamped to the layout bounds.
	const navigateFromHorizontalSwipe = (deltaX: number, deltaY: number) => {
		if (!character || itemCount === 0) return;

		// Require horizontal dominance so diagonal/vertical scrolls do not navigate.
		if (!isHorizontalNavigationSwipe(deltaX, deltaY)) return;

		// Swipe left = next item; swipe right = previous item.
		if (deltaX < 0 && safeCardIndex < itemCount - 1) {
			setCurrentCardIndex(i => i + 1);
		} else if (deltaX > 0 && safeCardIndex > 0) {
			setCurrentCardIndex(i => i - 1);
		} else if (deltaX > 0 && safeCardIndex === 0) {
			// Past the first card the "previous" direction has no card to step to, so it
			// crosses over to the Trackers tab - closer than reaching the tab bar.
			onNavigateToTrackers();
		}
	};

	// Swipe gesture detection for card area (horizontal swipe navigates prev/next)
	const cardSwipeStartX = useRef<number>(0);
	const cardSwipeStartY = useRef<number>(0);

	const handleCardAreaTouchStart = (e: TouchEvent) => {
		cardSwipeStartX.current = e.touches[0].clientX;
		cardSwipeStartY.current = e.touches[0].clientY;
	};

	// Swipe gesture detection for navigation bar (card navigation)
	const navSwipeStartX = useRef<number>(0);
	const navSwipeStartY = useRef<number>(0);

	const handleNavBarTouchStart = (e: TouchEvent) => {
		navSwipeStartX.current = e.touches[0].clientX;
		navSwipeStartY.current = e.touches[0].clientY;
	};

	const handleNavBarTouchEnd = (e: TouchEvent) => {
		const touchEndX = e.changedTouches[0].clientX;
		const touchEndY = e.changedTouches[0].clientY;
		navigateFromHorizontalSwipe(touchEndX - navSwipeStartX.current, touchEndY - navSwipeStartY.current);
	};

	const handleCardAreaTouchEnd = (e: TouchEvent) => {
		const touchEndX = e.changedTouches[0].clientX;
		const touchEndY = e.changedTouches[0].clientY;
		navigateFromHorizontalSwipe(touchEndX - cardSwipeStartX.current, touchEndY - cardSwipeStartY.current);
	};

	// Swipe gesture detection for trackers area (edge swipe for toolbelt)
	const trackersSwipeStartX = useRef<number>(0);
	const trackersSwipeStartY = useRef<number>(0);

	const handleTrackersAreaTouchStart = (e: TouchEvent) => {
		trackersSwipeStartX.current = e.touches[0].clientX;
		trackersSwipeStartY.current = e.touches[0].clientY;
	};

	const handleTrackersAreaTouchEnd = (e: TouchEvent) => {
		if (!character) return;

		const touchEndX = e.changedTouches[0].clientX;
		const touchEndY = e.changedTouches[0].clientY;
		const deltaX = touchEndX - trackersSwipeStartX.current;
		const deltaY = touchEndY - trackersSwipeStartY.current;

		const edgeThreshold = 50;
		const swipeThreshold = 30;

		// Edge swipe opens the toolbelt (side-panel mode only), branching on
		// handedness. When the toolbelt consumes the swipe we stop, so the reserved
		// edge zone never also crosses over to the Cards tab.
		if (Math.abs(deltaX) >= Math.abs(deltaY) && Math.abs(deltaX) >= swipeThreshold) {
			if (isLeftHanded) {
				// Left-handed mode: Left edge opens the toolbelt
				if (trackersSwipeStartX.current < edgeThreshold && deltaX > swipeThreshold && !isMobileFABMode && !isToolbeltOpen) {
					setIsToolbeltOpen(true);
					return;
				}
			} else if (trackersSwipeStartX.current > window.innerWidth - edgeThreshold && deltaX < -swipeThreshold && !isMobileFABMode && !isToolbeltOpen) {
				// Right-handed mode: Right edge opens the toolbelt
				setIsToolbeltOpen(true);
				return;
			}
		}

		// A clear left-swipe elsewhere on the trackers surface crosses over to the
		// Cards tab - the mirror of the first-card crossover back to Trackers, on the
		// same gate so both directions feel identical. Trackers is the leftmost tab,
		// so a right-swipe has nowhere to go.
		if (deltaX < 0 && isHorizontalNavigationSwipe(deltaX, deltaY)) {
			onNavigateToCards();
		}
	};

	return {
		cardAreaHandlers: { onTouchStart: handleCardAreaTouchStart, onTouchEnd: handleCardAreaTouchEnd },
		navBarHandlers: { onTouchStart: handleNavBarTouchStart, onTouchEnd: handleNavBarTouchEnd },
		trackersAreaHandlers: { onTouchStart: handleTrackersAreaTouchStart, onTouchEnd: handleTrackersAreaTouchEnd },
	};
}
