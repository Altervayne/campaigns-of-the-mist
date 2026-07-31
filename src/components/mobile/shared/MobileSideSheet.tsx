// -- React Imports --
import type { ReactNode } from 'react';

// -- Animation Imports --
import { motion, AnimatePresence } from 'framer-motion';

// -- Utils Imports --
import { cn } from '@/lib/utils';



interface MobileSideSheetProps {
	/** Whether the sheet is shown. The primitive owns the enter/exit animation via AnimatePresence. */
	isOpen: boolean;
	/** Called when the backdrop is tapped. */
	onClose: () => void;
	/** The sheet's content (header, body, action buttons). Stays caller-specific. */
	children: ReactNode;
	/** The edge the panel pins to and slides in from. */
	side: 'left' | 'right';
	/** Optional extra classes merged onto the sheet container, for one-off adjustments. */
	contentClassName?: string;
}

/**
 * The X-axis counterpart of {@link MobileBottomSheet}: a tap-to-dismiss backdrop plus a
 * full-height, spring-slide-in panel pinned to one edge. The `side` decides which edge it
 * pins to, which corners round, and the off-screen direction it slides from. The panel is a
 * flex column so callers can lay out a header, scrollable body, and pinned footer.
 */
export function MobileSideSheet({ isOpen, onClose, children, side, contentClassName }: MobileSideSheetProps) {
	const offscreen = side === 'right' ? '100%' : '-100%';

	return (
		<AnimatePresence>
			{isOpen && (
				<>
					{/* Backdrop */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="fixed inset-0 bg-black/50 layer-overlay"
						onClick={onClose}
					/>

					{/* Side panel */}
					<motion.div
						initial={{ x: offscreen }}
						animate={{ x: 0 }}
						exit={{ x: offscreen }}
						transition={{ type: 'spring', damping: 30, stiffness: 300 }}
						className={cn(
							"fixed top-0 bottom-0 w-[min(20rem,80%)] flex flex-col layer-overlay bg-card border-border shadow-2xl",
							side === 'right' ? "right-0 border-l rounded-l-2xl" : "left-0 border-r rounded-r-2xl",
							contentClassName
						)}
					>
						{children}
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
}
