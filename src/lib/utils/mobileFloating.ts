// -- Layout constants (rem) --

/** Bottom tab bar height, matching MobileBottomTabs' `h-16`. Present only in
 *  side-panel nav mode; FAB mode replaces the tab bar with the FAB itself. */
const BOTTOM_NAV_HEIGHT_REM = 4;
/** Height of the card navigation bar shown at the bottom of the cards tab, so a
 *  FAB on that tab rides above it instead of sinking into it. The bar (see
 *  `MobileCardNavigationBar`) is `py-1.5` around a single row whose tallest cell is
 *  the title/dots column - the card title, a 24px row of compact card-indicator
 *  pills, and (when gesture tips are on) a swipe hint - about 4.25rem tall with the
 *  hint. That value clears the bar with the base gap (1rem) on top. Excludes the
 *  safe-area inset, which {@link getFloatingBottom} adds separately. */
const CARDS_NAV_BAR_REM = 4.25;
/** Height of the note editing bar (a note tab in Edit): its `py-1` padding around a
 *  row of `h-9` (36px) buttons. A FAB in note-edit mode rides just above it rather
 *  than into it, so the bar keeps its full width. */
const NOTE_EDITING_BAR_REM = 2.75;
/** Gap from the bottom chrome (or the screen edge in FAB mode) up to the first cluster. */
const FLOATING_BASE_GAP_REM = 1;
/** Vertical separation between two floating clusters that share one screen edge. */
const FLOATING_STAGGER_REM = 3;
/** Height of a floating FAB; the primaries are `h-11` (44px). Used to extend a
 *  scroll surface's bottom padding past the FAB's top edge. */
const FAB_SIZE_REM = 2.75;



interface FloatingBottomConfig {
	/** Add the bottom tab bar's height to the offset (side-panel nav mode). */
	hasBottomNav?: boolean;
	/** Add the card navigation bar's height to the offset (cards tab). */
	clearsCardsNavBar?: boolean;
	/** Add the note editing bar's height to the offset (a note tab in Edit mode). */
	clearsNoteBar?: boolean;
	/** This control's index in the stack of clusters sharing the edge (0 = nearest the edge). */
	stagger?: number;
	/** One-off additional clearance in rem (e.g. an expanded action list floating above its own FAB). */
	extraRem?: number;
}

/**
 * Computes the `bottom` offset (a CSS `calc()` string) for a floating mobile
 * control, so every floating cluster clears the home-indicator safe area, clears
 * whatever bottom chrome sits beneath it, and is staggered far enough from any
 * other cluster on the same edge that the two never overlap in any configuration.
 *
 * The offset is `bottom-nav height + card-nav-bar height + base gap + stagger x
 * stagger-step`, all in rem, plus `env(safe-area-inset-bottom)` (the same inset
 * the `pb-safe` utility applies, made non-zero by the `viewport-fit=cover`
 * viewport). Callers describe their situation declaratively (which bottom chrome
 * is present, and their stagger index) rather than hard-coding `bottom-*`
 * values, so the whole floating layout stays consistent and safe-area-aware
 * from one place.
 *
 * Note: the drawer tab does NOT lift the FAB above its in-flow toolbar; the
 * drawer instead reserves a horizontal slot on its handedness-leading edge so
 * the FAB at its base offset sits inside the toolbar's vertical band, with no
 * button beneath it. The breadcrumbs (above the toolbar) are likewise clear.
 *
 * The two FAB-mode clusters that co-occupy an edge - the navigation FAB
 * (`stagger: 0`) and the toolbelt FAB (`stagger: 1`) - are kept apart by the
 * stagger; on the cards tab both also add the card-nav-bar clearance so they ride
 * above it together.
 *
 * @param config - Which bottom chrome is present, this control's stagger index, and any one-off clearance.
 * @returns A `calc(...)` string suitable for an inline `style={{ bottom }}`.
 */
export function getFloatingBottom({
	hasBottomNav = false,
	clearsCardsNavBar = false,
	clearsNoteBar = false,
	stagger = 0,
	extraRem = 0,
}: FloatingBottomConfig = {}): string {
	const offsetRem =
		(hasBottomNav ? BOTTOM_NAV_HEIGHT_REM : 0) +
		(clearsCardsNavBar ? CARDS_NAV_BAR_REM : 0) +
		(clearsNoteBar ? NOTE_EDITING_BAR_REM : 0) +
		FLOATING_BASE_GAP_REM +
		stagger * FLOATING_STAGGER_REM +
		extraRem;

	return `calc(${offsetRem}rem + env(safe-area-inset-bottom))`;
}

/**
 * Computes the `padding-bottom` (a CSS `calc()` string) a scrollable mobile
 * surface needs so its last item can scroll clear of a floating FAB cluster that
 * rests over it, instead of hiding behind it.
 *
 * It is {@link getFloatingBottom} (the cluster's bottom offset, already including
 * the base gap and `env(safe-area-inset-bottom)`) plus the FAB's own height, so the
 * content scrolls to just above the FAB's top edge. Callers pass the same
 * {@link FloatingBottomConfig} their surface's FAB uses, so the padding tracks the
 * FAB through every configuration rather than a hard-coded `pb-*` magic value that
 * drifts whenever the FAB moves (for example when the cards tab grew its nav bar).
 *
 * @param config - The same chrome/stagger description passed to the surface's FAB.
 * @returns A `calc(...)` string suitable for an inline `style={{ paddingBottom }}`.
 */
export function getFloatingContentPadding(config: FloatingBottomConfig = {}): string {
	return `calc(${getFloatingBottom(config)} + ${FAB_SIZE_REM}rem)`;
}
