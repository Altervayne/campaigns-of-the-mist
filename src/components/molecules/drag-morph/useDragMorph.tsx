// -- React Imports --
import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// -- Component Imports --
import { DragMorphClone } from './DragMorphClone';
import { DragMorphCluster } from './DragMorphCluster';

// -- Type Imports --
import type { MorphArrow, MorphDescriptor } from '@/lib/utils/dragFeedback';

/** The morph signal pushed on each context/spring change. */
export interface DragMorphSignal {
   /** The active descriptor (icon + label), or null when nothing actionable. */
   descriptor: MorphDescriptor | null;
   /** The dwell key (restarts the ring on change), or null when no dwell is running. */
   springKey: string | null;
   /** The spring's direction arrow (folder -> in, back -> up), or null. */
   springArrow: MorphArrow;
   /**
    * Force the clone to funnel + the cluster to show even with no descriptor/spring
    * (e.g. a drawer item in neutral space morphs to dot + identity, no action glyph).
    */
   morph?: boolean;
}

/** A minimal rect shape for capturing the grab origin (matches @dnd-kit's ClientRect). */
interface GrabRect {
   left: number;
   top: number;
   width: number;
   height: number;
}

/** The drag-morph engine: imperative cursor + grab APIs plus two render slots. */
export interface DragMorphEngine {
   /** Capture the grab point as the clone's transform-origin (call once at drag start). */
   captureGrab(rect: GrabRect, x: number, y: number): void;
   /** Pin the cursor cluster to the pointer (call every move; no re-render). */
   setCursor(x: number, y: number): void;
   /** Push the current descriptor + spring signal (call when the context/target changes). */
   setMorph(signal: DragMorphSignal): void;
   /**
    * Set the optional, OPAQUE "what am I dragging" node for the cluster's right pill
    * (call once at drag start; pass null for no pill). The engine never builds or
    * inspects it, that keeps the engine agnostic of games/characters/drawers.
    */
   setIdentity(node: ReactNode | null): void;
   /** Clear all feedback (drag end / cancel). */
   reset(): void;
   /** Render the funneling clone INSIDE `<DragOverlay>`, wrapping the given preview. */
   renderClone(preview: ReactNode): ReactNode;
   /** Render the cursor cluster as a SIBLING of `<DragOverlay>`. */
   renderCluster(): ReactNode;
}

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

/**
 * The reusable drag-morph engine: owns the overlay feedback
 * choreography, the grab-point funnel, the converged cursor cluster (dot + label +
 * arrow + spring ring), and the cross-fades, and exposes it as a hook with two
 * render slots. dnd-kit transforms its `<DragOverlay>`, so the funneling clone must
 * render inside it while the cluster must be a sibling; one component cannot span
 * both, hence a hook owning shared state + two slots.
 *
 * The engine is deliberately behavior-agnostic: it knows nothing about drawers,
 * tabs, characters, or navigation. It is fed only a cursor position, a resolved
 * {@link MorphDescriptor}, and a spring signal; the drag system computes those and
 * keeps all hit-testing, navigation, and drop routing. That decoupling is what makes
 * the engine reusable, a new draggable's morph is a new descriptor, nothing here.
 *
 * Cursor position is imperative (a direct `style.left/top` write to the cluster ref
 * every move, no re-render); React state changes only when the descriptor / spring
 * target changes, which is rare.
 *
 * @returns The {@link DragMorphEngine} APIs + render slots.
 */
export function useDragMorph(): DragMorphEngine {
   const clusterRef = useRef<HTMLDivElement | null>(null);

   // React state: changes only on a context/target change (the cluster re-renders rarely).
   const [descriptor, setDescriptor] = useState<MorphDescriptor | null>(null);
   const [springKey, setSpringKey] = useState<string | null>(null);
   const [springArrow, setSpringArrow] = useState<MorphArrow>(null);
   const [forceMorph, setForceMorph] = useState(false);
   const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
   // The opaque dragged-item node, set once at drag start (no per-move churn).
   const [identity, setIdentityState] = useState<ReactNode>(null);

   // Mirror of the last signal, so setMorph can skip no-op state churn on every move.
   const signalRef = useRef<DragMorphSignal>({ descriptor: null, springKey: null, springArrow: null });

   const setCursor = useCallback((x: number, y: number) => {
      const el = clusterRef.current;
      if (el) {
         el.style.left = `${x}px`;
         el.style.top = `${y}px`;
      }
   }, []);

   const captureGrab = useCallback(
      (rect: GrabRect, x: number, y: number) => {
         const originX = rect.width ? ((x - rect.left) / rect.width) * 100 : 50;
         const originY = rect.height ? ((y - rect.top) / rect.height) * 100 : 50;
         setOrigin({ x: clamp(originX), y: clamp(originY) });
         setCursor(x, y); // place the cluster at the grab point before the first move
      },
      [setCursor],
   );

   const setMorph = useCallback((signal: DragMorphSignal) => {
      const prev = signalRef.current;
      const morph = signal.morph ?? false;
      if (
         prev.descriptor === signal.descriptor &&
         prev.springKey === signal.springKey &&
         prev.springArrow === signal.springArrow &&
         (prev.morph ?? false) === morph
      ) {
         return; // unchanged: avoid a needless re-render
      }
      signalRef.current = signal;
      setDescriptor(signal.descriptor);
      setSpringKey(signal.springKey);
      setSpringArrow(signal.springArrow);
      setForceMorph(morph);
   }, []);

   const setIdentity = useCallback((node: ReactNode | null) => {
      setIdentityState(node ?? null);
   }, []);

   const reset = useCallback(() => {
      signalRef.current = { descriptor: null, springKey: null, springArrow: null, morph: false };
      setDescriptor(null);
      setSpringKey(null);
      setSpringArrow(null);
      setForceMorph(false);
      setOrigin(null);
      setIdentityState(null);
   }, []);

   // The clone funnels (and the cluster cross-fades in) whenever a descriptor is
   // active, a spring dwell is running, OR the consumer forced morph mode.
   const funneling = descriptor !== null || springKey !== null || forceMorph;

   const renderClone = useCallback(
      (preview: ReactNode): ReactNode => (
         <DragMorphClone funneling={funneling} origin={origin}>
            {preview}
         </DragMorphClone>
      ),
      [funneling, origin],
   );

   const renderCluster = useCallback(
      (): ReactNode => (
         <DragMorphCluster
            ref={clusterRef}
            active={funneling}
            descriptor={descriptor}
            springKey={springKey}
            arrow={descriptor?.arrow ?? springArrow}
            identity={identity}
         />
      ),
      [funneling, descriptor, springKey, springArrow, identity],
   );

   return { captureGrab, setCursor, setMorph, setIdentity, reset, renderClone, renderCluster };
}
