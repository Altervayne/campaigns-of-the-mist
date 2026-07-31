// -- React Imports --
import type { CSSProperties } from 'react';

// -- Icon Imports --
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// -- Utils --
import { cn } from '@/lib/utils';
import { TUTORIAL_Z } from '@/lib/tutorial/zLayers';
import type { TutorialGestureCue as GestureCue } from '@/lib/tutorial/tutorialTypes';

// 2pi-16 - matches the app's `spring-ring` keyframe (a 16px-radius ring).
const RING_CIRCUMFERENCE = 100.53;

// Half-travel (the loop runs from -x to +x), at 'normal'. A swipe is a whole-surface sweep, a drag a
// deliberate lift-and-move, a scroll a nudge - so each kind carries its own base.
const SWIPE_TRAVEL = 40;
const DRAG_TRAVEL = 18;
const SCROLL_TRAVEL = 8;

/** Per-step travel scaling; 'wide' is sized to read as a sweep across a full-width surface. */
const INTENSITY_FACTOR: Record<NonNullable<GestureCue['intensity']>, number> = {
   subtle: 0.6,
   normal: 1,
   wide: 2.5,
};

const DOT_SIZE = 12;

function travelOf(cue: GestureCue, base: number) {
   return base * INTENSITY_FACTOR[cue.intensity ?? 'normal'];
}

// Every layer centers on the container origin; overlapping layers stack here.
const CENTER = 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2';
const DOT = 'block size-3 rounded-full bg-primary shadow-md ring-2 ring-background';

type Direction = NonNullable<GestureCue['direction']>;

const CHEVRON: Record<Direction, LucideIcon> = { up: ChevronUp, down: ChevronDown, left: ChevronLeft, right: ChevronRight };

const isVertical = (direction: Direction) => direction === 'up' || direction === 'down';
/** Up / left travel runs toward the negative end of its axis. */
const signOf = (direction: Direction) => (direction === 'up' || direction === 'left' ? -1 : 1);
const opposite = (direction: Direction): Direction =>
   direction === 'up' ? 'down' : direction === 'down' ? 'up' : direction === 'left' ? 'right' : 'left';

/** Offsets a centered layer `spread` px along `direction`, preserving the -50%/-50% centering. */
function offsetAlong(direction: Direction, spread: number) {
   const sign = signOf(direction) > 0 ? '+' : '-';
   return isVertical(direction)
      ? `translate(-50%, calc(-50% ${sign} ${spread}px))`
      : `translate(calc(-50% ${sign} ${spread}px), -50%)`;
}

interface TutorialGestureCueProps {
   cue: GestureCue;
   /** The spotlighted anchor's rect; the cue centers on it (viewport center when absent). */
   targetRect: DOMRect | null;
}

/**
 * A looping touch-gesture hint painted at a step's anchor - the "do THIS here" pointer mobile lacks. Purely
 * decorative: `pointer-events-none` so it never intercepts the gesture it teaches, token-only visuals, and
 * every animated layer is gated behind `motion-safe:` with a static glyph shown under reduced motion. The
 * swipe / drag / scroll loops travel along `--cue-shift`, whose sign follows the cue's direction;
 * press-drag travels per-axis along `--cue-shift-x` / `--cue-shift-y`.
 */
export default function TutorialGestureCue({ cue, targetRect }: TutorialGestureCueProps) {
   const x = targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2;
   // With no anchor the cue falls to the lower half, clear of a centered coach card at the viewport middle.
   const y = targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight * 0.68;

   return (
      <div
         aria-hidden
         className="fixed pointer-events-none"
         style={{ zIndex: TUTORIAL_Z.gestureCue, left: x, top: y, width: 56, height: 56, transform: 'translate(-50%, -50%)' }}
      >
         <CueBody cue={cue} />
      </div>
   );
}

function CueBody({ cue }: { cue: GestureCue }) {
   if (cue.kind === 'long-press') {
      return (
         <>
            <span className={cn(CENTER, DOT)} />
            <DwellRing fillClassName="animate-spring-ring" fillStyle={{ animationIterationCount: 'infinite' }} />
            <StaticRing />
         </>
      );
   }

   if (cue.kind === 'tap') {
      return (
         <>
            <span className={cn(CENTER, DOT, 'motion-safe:animate-cue-tap motion-reduce:hidden')} />
            {/* Static fallback: a dot inside a ring. */}
            <span className={cn(CENTER, DOT, 'motion-safe:hidden')} />
            <span className={cn(CENTER, 'block size-7 rounded-full border-2 border-primary motion-safe:hidden')} />
         </>
      );
   }

   if (cue.kind === 'swipe') {
      const direction = cue.direction ?? 'left';
      const travel = travelOf(cue, SWIPE_TRAVEL);
      const shift = direction === 'right' ? travel : -travel;
      return (
         <>
            {/* Faint trail behind the travelling dot, spanning the whole sweep rather than a fixed stub. */}
            <span
               className={cn(CENTER, 'block h-0.5 rounded-full bg-primary/25 motion-reduce:hidden')}
               style={{ width: travel * 2 + DOT_SIZE }}
            />
            <span
               className={cn(CENTER, DOT, 'motion-safe:animate-cue-swipe motion-reduce:hidden')}
               style={{ ['--cue-shift']: `${shift}px` } as CSSProperties}
            />
            <DirectionalGlyph direction={direction} />
         </>
      );
   }

   if (cue.kind === 'drag') {
      const travel = travelOf(cue, DRAG_TRAVEL);
      const shift = cue.direction === 'up' ? -travel : travel;
      // The chevrons frame the motion, so they sit just past the loop's ends rather than at a fixed box edge.
      const spread = travel + DOT_SIZE;
      return (
         <>
            <ChevronUp
               className="absolute left-1/2 top-1/2 size-4 text-primary/60"
               style={{ transform: `translate(-50%, calc(-50% - ${spread}px))` }}
            />
            <span
               className={cn(CENTER, DOT, 'motion-safe:animate-cue-drag motion-reduce:hidden')}
               style={{ ['--cue-shift']: `${shift}px` } as CSSProperties}
            />
            {/* Static fallback dot. */}
            <span className={cn(CENTER, DOT, 'motion-safe:hidden')} />
            <ChevronDown
               className="absolute left-1/2 top-1/2 size-4 text-primary/60"
               style={{ transform: `translate(-50%, calc(-50% + ${spread}px))` }}
            />
         </>
      );
   }

   if (cue.kind === 'press-drag') {
      const direction = cue.direction ?? 'down';
      const travel = travelOf(cue, DRAG_TRAVEL);
      const shift = signOf(direction) * travel;
      const spread = travel + DOT_SIZE;
      const LeadChevron = CHEVRON[direction];
      const TrailChevron = CHEVRON[opposite(direction)];
      return (
         <>
            {/* Chevrons frame the travel axis, as on the plain drag cue - reorder runs both ways. */}
            <TrailChevron
               className="absolute left-1/2 top-1/2 size-4 text-primary/60 motion-reduce:hidden"
               style={{ transform: offsetAlong(opposite(direction), spread) }}
            />
            <LeadChevron
               className="absolute left-1/2 top-1/2 size-4 text-primary/60 motion-reduce:hidden"
               style={{ transform: offsetAlong(direction, spread) }}
            />
            <span
               className={cn(CENTER, DOT, 'motion-safe:animate-cue-press-drag motion-reduce:hidden')}
               style={
                  {
                     [isVertical(direction) ? '--cue-shift-y' : '--cue-shift-x']: `${shift}px`,
                  } as CSSProperties
               }
            />
            <DwellRing fillClassName="motion-safe:animate-cue-press-drag-ring" />
            {/* Static fallback: hold here (ring + dot), then move that way (chevron). */}
            <StaticRing />
            <span className={cn(CENTER, DOT, 'motion-safe:hidden')} />
            <LeadChevron
               className="absolute left-1/2 top-1/2 size-4 text-primary motion-safe:hidden"
               style={{ transform: offsetAlong(direction, spread) }}
            />
         </>
      );
   }

   // scroll: a dot that bobs along the direction.
   const direction = cue.direction ?? 'down';
   const travel = travelOf(cue, SCROLL_TRAVEL);
   const shift = direction === 'up' ? -travel : travel;
   return (
      <>
         <span
            className={cn(CENTER, DOT, 'motion-safe:animate-cue-scroll motion-reduce:hidden')}
            style={{ ['--cue-shift']: `${shift}px` } as CSSProperties}
         />
         <DirectionalGlyph direction={direction} />
      </>
   );
}

/**
 * The dwell ring that fills over a hold window - shared by every cue that teaches a press-and-hold, so a
 * hold reads the same wherever it appears. The caller supplies the fill's timing; the track and the
 * reduced-motion gate are fixed.
 */
function DwellRing({ fillClassName, fillStyle }: { fillClassName: string; fillStyle?: CSSProperties }) {
   return (
      <svg viewBox="0 0 36 36" className={cn(CENTER, 'size-9 -rotate-90 motion-reduce:hidden')}>
         <circle cx="18" cy="18" r="16" fill="none" strokeWidth="2.5" className="stroke-primary/20" />
         <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            className={cn('stroke-primary', fillClassName)}
            style={fillStyle}
         />
      </svg>
   );
}

/** The reduced-motion twin of {@link DwellRing}: the same ring, already full. */
function StaticRing() {
   return <span className={cn(CENTER, 'block size-8 rounded-full border-2 border-primary motion-safe:hidden')} />;
}

/** Static reduced-motion fallback for a directional cue: a dot with a chevron leading toward its direction. */
function DirectionalGlyph({ direction }: { direction: Direction }) {
   const chevronLeads = signOf(direction) < 0;
   const Icon = CHEVRON[direction];
   const dot = <span className="block size-3 rounded-full bg-primary" />;
   const chevron = <Icon className="size-4 text-primary" />;
   return (
      <span className={cn(CENTER, 'flex items-center gap-0.5 motion-safe:hidden', isVertical(direction) ? 'flex-col' : 'flex-row')}>
         {chevronLeads ? chevron : dot}
         {chevronLeads ? dot : chevron}
      </span>
   );
}
