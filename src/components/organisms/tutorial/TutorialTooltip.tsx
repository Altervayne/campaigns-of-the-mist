// -- React Imports --
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Component Imports --
import { Button } from '@/components/ui/button';

// -- Hook Imports --
import { useWindowSize } from '@/hooks/mobile/useWindowSize';

// -- Icon Imports --
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// -- Utils --
import { TUTORIAL_Z } from '@/lib/tutorial/zLayers';
import { useSafeAreaInsets } from '@/lib/tutorial/safeAreaInsets';
import type { TutorialConfigProfile } from '@/lib/tutorial/tutorialConfig';
import type { TutorialPlacement } from '@/lib/tutorial/tutorialTypes';

// The dot-pill progress rail is unreadable past a handful of steps, so switch to a
// numeric "3 / 12" + a thin bar for longer tutorials.
const MAX_DOT_STEPS = 8;
const EDGE_PADDING = 16;
const ARROW_OFFSET = 12;
const POINTER_SIZE = 8;

type Side = 'top' | 'bottom' | 'left' | 'right';

interface TutorialTooltipProps {
   variant: 'spotlight' | 'centered' | 'bail';
   titleKey: string;
   bodyKey: string;
   tutorialNameKey: string;
   currentStep: number;
   totalSteps: number;
   targetRect: DOMRect | null;
   placement?: TutorialPlacement;
   profile: TutorialConfigProfile;
   /** Gated step: no Next; the action advances, plus a skip-this-step escape. */
   gated: boolean;
   isFirst: boolean;
   isLast: boolean;
   onNext: () => void;
   onBack: () => void;
   onSkip: () => void;
   onSkipStep: () => void;
}

function fits(side: Side, rect: DOMRect, width: number, height: number, viewWidth: number, viewHeight: number): boolean {
   if (side === 'bottom') return viewHeight - rect.bottom >= height + ARROW_OFFSET;
   if (side === 'top') return rect.top >= height + ARROW_OFFSET;
   if (side === 'right') return viewWidth - rect.right >= width + ARROW_OFFSET;
   return rect.left >= width + ARROW_OFFSET;
}

function clamp(value: number, min: number, max: number): number {
   return Math.max(min, Math.min(value, max));
}

/**
 * The shared coach-mark. Desktop flips among all four sides with a `border-primary` pointer;
 * mobile flips top/bottom only. Progress scales: dot-pills at or under {@link MAX_DOT_STEPS}
 * steps, numeric + bar beyond. Card chrome is app tokens only.
 */
export default function TutorialTooltip({
   variant,
   titleKey,
   bodyKey,
   tutorialNameKey,
   currentStep,
   totalSteps,
   targetRect,
   placement,
   profile,
   gated,
   isFirst,
   isLast,
   onNext,
   onBack,
   onSkip,
   onSkipStep,
}: TutorialTooltipProps) {
   const { t } = useTranslation();
   const { width: viewWidth, height: viewHeight } = useWindowSize();
   const insets = useSafeAreaInsets();
   const [measuredHeight, setMeasuredHeight] = useState(200);
   const observerRef = useRef<ResizeObserver | null>(null);

   // The on-screen keyboard shrinks the visual viewport without changing `innerHeight` (notably iOS), so a
   // coach anchored to a focused input would otherwise clamp against the full height and hide behind the
   // keyboard. Track the visual-viewport height and clamp the bottom against it. Desktop has no shrink, so
   // this equals the layout height and leaves positioning unchanged.
   const [visualHeight, setVisualHeight] = useState<number | null>(() =>
      typeof window !== 'undefined' ? window.visualViewport?.height ?? null : null,
   );
   useEffect(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      const update = () => setVisualHeight(vv.height);
      update();
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      return () => {
         vv.removeEventListener('resize', update);
         vv.removeEventListener('scroll', update);
      };
   }, []);

   // Measure via a callback ref so the height tracks the real element the frame it mounts,
   // not a stale one, and reflows keep it in sync.
   const measureCard = useCallback((element: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!element) return;
      const read = () => {
         const height = element.offsetHeight;
         if (height > 0) setMeasuredHeight(height);
      };
      read();
      const observer = new ResizeObserver(read);
      observer.observe(element);
      observerRef.current = observer;
   }, []);

   const cardWidth = useMemo(() => {
      const available = (viewWidth || window.innerWidth) - EDGE_PADDING * 2;
      return clamp(profile.coachMaxWidth, profile.coachMinWidth, Math.max(profile.coachMinWidth, available));
   }, [viewWidth, profile]);

   const layout = useMemo(() => {
      const vw = viewWidth || window.innerWidth;
      const vh = viewHeight || window.innerHeight;
      // Bottom edge follows the visual viewport (keyboard-aware); the safe-area insets carve the notch /
      // home-indicator margins out of every edge. All zero on desktop, so the clamps below are unchanged there.
      const effectiveVh = visualHeight ?? vh;
      const height = measuredHeight;
      const minLeft = EDGE_PADDING + insets.left;
      const maxLeft = Math.max(minLeft, vw - cardWidth - EDGE_PADDING - insets.right);
      const minTop = EDGE_PADDING + insets.top;
      const maxTop = Math.max(minTop, effectiveVh - height - EDGE_PADDING - insets.bottom);

      // Centered/modal step (no anchor, or an explicit center placement).
      if (!targetRect || placement === 'center' || variant !== 'spotlight') {
         return {
            left: clamp((vw - cardWidth) / 2, minLeft, maxLeft),
            top: clamp((effectiveVh - height) / 2, minTop, maxTop),
            side: null as Side | null,
            pointer: 0,
         };
      }

      const allowed = profile.placements.filter((entry): entry is Side => entry !== 'center');
      // The centered branch already returned for `undefined`/`center`, so a remaining placement is a Side.
      const preferred: Side | null = placement ?? null;

      const side: Side =
         (preferred && allowed.includes(preferred) && fits(preferred, targetRect, cardWidth, height, vw, vh) && preferred) ||
         allowed.find((entry) => fits(entry, targetRect, cardWidth, height, vw, vh)) ||
         // Nothing fits cleanly: fall back to the side with the most room.
         ([
            { side: 'bottom' as Side, space: vh - targetRect.bottom },
            { side: 'top' as Side, space: targetRect.top },
            { side: 'right' as Side, space: vw - targetRect.right },
            { side: 'left' as Side, space: targetRect.left },
         ]
            .filter((entry) => allowed.includes(entry.side))
            .sort((a, b) => b.space - a.space)[0]?.side ?? 'bottom');

      let left: number;
      let top: number;
      if (side === 'bottom' || side === 'top') {
         left = clamp(targetRect.left + targetRect.width / 2 - cardWidth / 2, minLeft, maxLeft);
         top = side === 'bottom' ? targetRect.bottom + ARROW_OFFSET : targetRect.top - ARROW_OFFSET - height;
         top = clamp(top, minTop, maxTop);
      } else {
         top = clamp(targetRect.top + targetRect.height / 2 - height / 2, minTop, maxTop);
         left = side === 'right' ? targetRect.right + ARROW_OFFSET : targetRect.left - ARROW_OFFSET - cardWidth;
         left = clamp(left, minLeft, maxLeft);
      }

      // Pointer offset: the anchor center along the shared edge, clamped inside the card.
      const anchorCenter = side === 'bottom' || side === 'top'
         ? targetRect.left + targetRect.width / 2 - left
         : targetRect.top + targetRect.height / 2 - top;
      const span = side === 'bottom' || side === 'top' ? cardWidth : height;
      const pointer = clamp(anchorCenter, POINTER_SIZE * 2, span - POINTER_SIZE * 2);

      return { left, top, side, pointer };
   }, [targetRect, placement, variant, viewWidth, viewHeight, visualHeight, insets, measuredHeight, cardWidth, profile.placements]);

   if ((viewWidth || window.innerWidth) === 0) return null;

   const showPointer = profile.hasPointer && variant === 'spotlight' && layout.side !== null;
   const useNumericProgress = totalSteps > MAX_DOT_STEPS;

   return (
      <motion.div
         ref={measureCard}
         key={`tutorial-coach-${currentStep}`}
         initial={{ opacity: 0, y: 8 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ duration: 0.25, delay: 0.1 }}
         className="fixed bg-card text-card-foreground border border-border rounded-lg shadow-2xl p-4 pointer-events-auto"
         style={{ zIndex: TUTORIAL_Z.coach, left: layout.left, top: layout.top, width: cardWidth }}
      >
         {showPointer && <Pointer side={layout.side as Side} offset={layout.pointer} />}

         {/* Skip whole tutorial. */}
         <button
            onClick={onSkip}
            className="absolute top-2 right-2 p-1.5 rounded-full hover:bg-muted transition-colors cursor-pointer"
            aria-label={t('Common.skip')}
         >
            <X className="w-4 h-4 text-muted-foreground" />
         </button>

         {variant !== 'bail' && (
            <p className="text-xs font-medium text-primary mb-1 pr-6 truncate">
               {t('Tutorial.header', { name: t(tutorialNameKey), current: currentStep + 1, total: totalSteps })}
            </p>
         )}

         <div className="pr-6">
            <h3 className="text-lg font-semibold mb-2">{variant === 'bail' ? t('Common.skip') : t(titleKey)}</h3>
            <p className="text-sm text-muted-foreground mb-4">
               {variant === 'bail' ? t('Tutorial.anchorMissing') : t(bodyKey)}
            </p>
         </div>

         {variant !== 'bail' && (
            useNumericProgress ? (
               <div className="mb-4">
                  <div className="flex justify-end mb-1.5">
                     <span className="text-xs text-muted-foreground tabular-nums">
                        {t('Tutorial.progress', { current: currentStep + 1, total: totalSteps })}
                     </span>
                  </div>
                  <div className="h-0.5 w-full rounded-full bg-muted overflow-hidden">
                     <div className="h-full bg-primary rounded-full" style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }} />
                  </div>
               </div>
            ) : (
               <div className="flex items-center justify-center gap-1.5 mb-4">
                  {Array.from({ length: totalSteps }).map((_, index) => (
                     <div
                        key={index}
                        className={`h-1.5 rounded-full transition-all ${
                           index === currentStep ? 'w-4 bg-primary' : index < currentStep ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-muted'
                        }`}
                     />
                  ))}
               </div>
            )
         )}

         {variant === 'bail' ? (
            <div className="flex justify-end">
               <Button size="sm" onClick={onSkip} className="cursor-pointer">
                  {t('Tutorial.controls.done')}
               </Button>
            </div>
         ) : (
            <>
               <div className="flex items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={onBack} disabled={isFirst} className="cursor-pointer">
                     <ChevronLeft className="w-4 h-4 mr-1" />
                     {t('Tutorial.controls.back')}
                  </Button>

                  {!gated && (
                     <Button size="sm" onClick={onNext} className="cursor-pointer">
                        {isLast ? t('Tutorial.controls.done') : t('Common.next')}
                        {!isLast && <ChevronRight className="w-4 h-4 ml-1" />}
                     </Button>
                  )}
               </div>

               {gated && (
                  <button onClick={onSkipStep} className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                     {t('Tutorial.controls.skipStep')}
                  </button>
               )}
            </>
         )}
      </motion.div>
   );
}

/** A small primary arrow linking the card to the halo, on the side facing the anchor. */
function Pointer({ side, offset }: { side: Side; offset: number }) {
   const base: React.CSSProperties = { position: 'absolute', width: 0, height: 0 };
   const transparent = `${POINTER_SIZE}px solid transparent`;
   const solid = `${POINTER_SIZE}px solid var(--primary)`;

   if (side === 'bottom') {
      // Card below the anchor: point up from the card's top edge.
      return <span aria-hidden style={{ ...base, top: -POINTER_SIZE, left: offset - POINTER_SIZE, borderLeft: transparent, borderRight: transparent, borderBottom: solid }} />;
   }
   if (side === 'top') {
      return <span aria-hidden style={{ ...base, bottom: -POINTER_SIZE, left: offset - POINTER_SIZE, borderLeft: transparent, borderRight: transparent, borderTop: solid }} />;
   }
   if (side === 'right') {
      return <span aria-hidden style={{ ...base, left: -POINTER_SIZE, top: offset - POINTER_SIZE, borderTop: transparent, borderBottom: transparent, borderRight: solid }} />;
   }
   return <span aria-hidden style={{ ...base, right: -POINTER_SIZE, top: offset - POINTER_SIZE, borderTop: transparent, borderBottom: transparent, borderLeft: solid }} />;
}
