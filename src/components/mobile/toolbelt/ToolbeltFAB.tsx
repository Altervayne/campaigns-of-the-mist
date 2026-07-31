// -- React Imports --
import { useRef, useState, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { IconButton } from '@/components/ui/icon-button';

// -- Icon Imports --
import { Wrench, X } from 'lucide-react';

// -- Animation Imports --
import { motion, AnimatePresence } from 'framer-motion';

// -- Store Imports --
import { useAppSettingsStore } from '@/lib/stores/appSettingsStore';

// -- Hook Imports --
import { useWindowHeight } from '@/hooks/mobile/useWindowHeight';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { getFloatingBottom } from '@/lib/utils/mobileFloating';

// -- Type Imports --
import type { ToolbeltAction, ToolbeltGroup } from '@/lib/types/toolbelt';



// The ring is ordered edit → add → workspace → item (context actions last, where they've
// always sat), and each group is headed by a title separator so a scanning thumb can find
// its way. A separator is a FULL-HEIGHT row (one ITEM_HEIGHT slot, exactly like an action),
// so the index-based measurement math below still runs on a uniform-height list; it is
// scale-neutral and inert, and the center-snap counts ACTION rows only (never a title).
const GROUP_ORDER: Record<ToolbeltGroup, number> = { edit: 0, add: 1, workspace: 2, item: 3 };

/** A ring row: either a group's title separator or one action. Both occupy one `ITEM_HEIGHT` slot. */
type FabRow = { kind: 'divider'; group: ToolbeltGroup } | { kind: 'action'; action: ToolbeltAction };



type SheetTab = 'trackers' | 'cards';

interface ToolbeltFABProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	itemActions: ToolbeltAction[];
	globalActions: ToolbeltAction[];
	activeTab?: SheetTab;
	isMenuFABExpanded?: boolean;
}



export default function ToolbeltFAB({
	isOpen,
	onOpenChange,
	itemActions,
	globalActions,
	activeTab,
	isMenuFABExpanded
}: ToolbeltFABProps) {
	const { t } = useTranslation();
	const mobileHandedness = useAppSettingsStore((state) => state.mobileHandedness);
	const isLeft = mobileHandedness === 'left';
	// Stable sort keeps each group's internal order; the list stays flat and uniform-height,
	// so the center-snap / scale / padding math below is unaffected.
	const allActions = [...globalActions, ...itemActions].sort(
		(a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group]
	);
	// Interleave a title separator before each group's first action. Separators are full slots,
	// so the row list stays uniform-height; `actionRowIndices` lets the center-snap ignore them.
	const rows: FabRow[] = [];
	let lastGroup: ToolbeltGroup | null = null;
	for (const action of allActions) {
		if (action.group !== lastGroup) {
			rows.push({ kind: 'divider', group: action.group });
			lastGroup = action.group;
		}
		rows.push({ kind: 'action', action });
	}
	const actionRowIndices = rows.reduce<number[]>((acc, row, index) => {
		if (row.kind === 'action') acc.push(index);
		return acc;
	}, []);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const [scrollY, setScrollY] = useState(0);
	const rafRef = useRef<number | null>(null);
   const windowHeight = useWindowHeight();

	// Distinguish a deliberate tap on the ring's empty area (which closes the
	// toolbelt) from a scroll gesture through the thumb-zone list (which must
	// not). We remember where the pointer went down and whether the list scrolled
	// during the interaction; a tap that scrolled or travelled beyond the slop is
	// treated as scroll-intent and does not close.
	const ringPointerDownYRef = useRef<number | null>(null);
	const ringScrolledRef = useRef(false);
	const RING_TAP_SLOP = 10;

	const ITEM_HEIGHT = 60;
	const BOTTOM_OFFSET = 175;
   const FAB_HEIGHT_OFFSET = 80;

   const THUMB_ZONE_Y = windowHeight ? windowHeight - BOTTOM_OFFSET : 500;
	const MAX_SCALE_DISTANCE = 200;



	useLayoutEffect(() => {
		if (isOpen && scrollContainerRef.current && actionRowIndices.length > 0 && windowHeight > 0) {
			// Snap to the MIDDLE ACTION's row (not the middle of the interleaved list), so the ring
			// never opens resting on a title separator.
			const middleRowIndex = actionRowIndices[Math.floor(actionRowIndices.length / 2)];
         const targetScroll = middleRowIndex * ITEM_HEIGHT;
         scrollContainerRef.current.scrollTop = targetScroll;
         setScrollY(targetScroll);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
		const newScrollY = e.currentTarget.scrollTop;
		// Any scroll during the current touch marks it as scroll-intent.
		ringScrolledRef.current = true;

		if (rafRef.current !== null) {
			cancelAnimationFrame(rafRef.current);
		}

		rafRef.current = requestAnimationFrame(() => {
			setScrollY(newScrollY);
			rafRef.current = null;
		});
	};

	const handleRingPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		ringPointerDownYRef.current = e.clientY;
		ringScrolledRef.current = false;
	};

	const handleRingClick = (e: React.MouseEvent<HTMLDivElement>) => {
		const travelled = ringPointerDownYRef.current === null
			? 0
			: Math.abs(e.clientY - ringPointerDownYRef.current);
		// Ignore taps that scrolled the list or travelled past the slop; only a
		// deliberate, stationary tap on the ring's empty area closes the toolbelt.
		if (ringScrolledRef.current || travelled > RING_TAP_SLOP) return;
		onOpenChange(false);
	};

	const getItemTransform = (index: number) => {
		const currentScrollY = scrollY;
		const itemAbsoluteY = THUMB_ZONE_Y + (index * ITEM_HEIGHT);
      const viewportY = itemAbsoluteY - currentScrollY;
      const distanceFromThumb = Math.abs(viewportY - THUMB_ZONE_Y);
      const scale = Math.max(0.8, 1.05 - (distanceFromThumb / MAX_SCALE_DISTANCE) * 0.2);

		return { scale };
	};

	return (
		<>
			<AnimatePresence>
				{isOpen && (
					<>
						{/* Backdrop */}
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.2 }}
							className="fixed inset-0 bg-black/50 backdrop-blur-sm layer-backdrop"
							onClick={() => onOpenChange(!isOpen)}
						/>

						{/* Scrollable Action Buttons with Thumb-Zone Scaling (globalActions is always non-empty) */}
							<motion.div
								ref={scrollContainerRef}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								onScroll={handleScroll}
                        onPointerDown={handleRingPointerDown}
                        onClick={handleRingClick}
								// Full-width so labels are never clipped: an element with
								// `overflow-y-auto` forces its `overflow-x` to compute to `auto`
								// too, so the old `w-64` + `overflow-x-visible` clipped
								// any label wider than 16rem. Spanning the viewport (with `px-4`
								// edge insets) keeps vertical scroll and thumb-zone scaling intact
								// while giving labels the whole width to extend into; the inner
								// `items-start`/`items-end` still anchors the rows to the handed edge.
								className="fixed inset-x-0 top-0 px-4 layer-panel h-[calc(100vh-5rem)] overflow-y-auto scrollbar-hide perspective-1000"
								style={{
                           paddingTop: `${THUMB_ZONE_Y}px`,
                           paddingBottom: `${(windowHeight - FAB_HEIGHT_OFFSET) - THUMB_ZONE_Y - ITEM_HEIGHT}px`,
                           maskImage: 'linear-gradient(to bottom, black calc(100% - 40px), transparent 100%)',
                           WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 40px), transparent 100%)'
                        }}
							>
								<div className={cn(
									"flex flex-col w-full",
									isLeft ? "items-start" : "items-end"
								)}>
									{rows.map((row, index) => {
										if (row.kind === 'divider') {
											// A title separator: one full slot, edge-anchored, scale-neutral, and inert
											// (stops its click so a tap on a title neither runs an action nor closes the ring).
											return (
												<div
													key={`divider-${row.group}`}
													style={{ height: ITEM_HEIGHT }}
													onClick={(e) => e.stopPropagation()}
													className="flex items-end"
												>
													<div className={cn("flex items-center gap-2 pb-2", isLeft ? "flex-row" : "flex-row-reverse")}>
														<span className="rounded-full bg-card border border-border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shadow-sm">
															{t(`Toolbelt.${row.group}Section`)}
														</span>
														<span className="h-px w-6 bg-border" />
													</div>
												</div>
											);
										}

										const action = row.action;
										const Icon = action.icon;
										const { scale } = getItemTransform(index);

										return (
											<div
												key={action.id}
												style={{ height: ITEM_HEIGHT }}
											>
												<motion.div
													initial={{ opacity: 0, y: 20 }}
													animate={{ opacity: 1, y: 0 }}
													exit={{ opacity: 0, y: 20 }}
													transition={{
														opacity: { duration: 0.2 },
														y: {
															type: 'spring',
															damping: 25,
															stiffness: 300,
															delay: isOpen ? (allActions.length - index) * 0 : 0
														}
													}}
													className="h-full"
												>
													<button
														data-tutorial={action.tutorialAnchor}
														className={cn(
															"flex items-center gap-3 h-full",
															isLeft ? "justify-start flex-row" : "justify-end flex-row-reverse"
														)}
                                          onClick={(e) => {
                                             e.stopPropagation()
                                             action.onClick();
                                             if (!action.keepOpen) onOpenChange(false);
                                          }}
														style={{
															transform: `scale(${scale})`,
															transformOrigin: isLeft ? 'left center' : 'right center',
															willChange: 'transform'
														}}
													>
														{/* Action button */}
														<div
															className={cn(
																"inline-flex items-center justify-center rounded-md h-11 w-11 shadow-lg shrink-0",
																action.variant === 'destructive'
																	? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
																	: 'bg-primary text-primary-foreground hover:bg-primary/90'
															)}
														>
															<Icon className="h-5 w-5" />
														</div>

														{/* Action label. Capped to the width left after the icon,
														    gap, and the container's edge insets (44px icon + 12px
														    gap + 2x16px px-4 = 5.5rem) and allowed to wrap, so even a
														    pathologically long label or translation stays within the
														    viewport instead of clipping. */}
														<div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg shrink-0 max-w-[calc(100vw-5.5rem)]">
															<span className="text-sm font-medium">
																{action.label}
															</span>
														</div>
													</button>
												</motion.div>
											</div>
										);
									})}
								</div>
							</motion.div>
					</>
				)}
			</AnimatePresence>

			{/* Primary FAB Button - Hide when menu FAB is expanded */}
			{!isMenuFABExpanded && (
				<motion.div
					className={cn(
						// Single resting inset on every tab; the card yields room for the FAB
						// on the cards tab (see MobileSheetCardSlot's FAB_CLEARANCE_PADDING) instead of
						// the FAB hopping inward here.
						"fixed layer-panel",
						isLeft ? "left-4" : "right-4"
					)}
					// Stagger 1 keeps the toolbelt FAB clear of the navigation FAB (stagger 0)
					// in FAB mode; both ride above the card nav bar on the cards tab.
					style={{ bottom: getFloatingBottom({ clearsCardsNavBar: !isOpen && activeTab === 'cards', stagger: isOpen ? 0 : 1 }) }}
					whileTap={{ scale: 0.95 }}
				>
					<IconButton
						variant="default"
						size="lg"
						onClick={() => onOpenChange(!isOpen)}
						data-tutorial="toolbelt"
						className="h-11 w-11 shadow-2xl"
					>
						<motion.div
							animate={{ rotate: isOpen ? 90 : 0 }}
							transition={{ duration: 0.2 }}
						>
							{isOpen ? (
								<X className="h-6 w-6" />
							) : (
								<Wrench className="h-6 w-6" />
							)}
						</motion.div>
					</IconButton>
				</motion.div>
			)}
		</>
	);
}
