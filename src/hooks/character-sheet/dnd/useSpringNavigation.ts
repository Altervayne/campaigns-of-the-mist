// -- React Imports --
import { useState, useCallback, useRef, useEffect } from 'react';

// -- Utils Imports --
import { createSpringController } from '@/lib/utils/dragFeedback';

// -- Store Imports --
import { useDrawerStore } from '@/lib/stores/drawerStore';
import { getParentFolderId } from '@/lib/drawer/drawerFolderTree';

// -- Type Imports --
import type { RefObject } from 'react';
import type { WorkspaceDwellTarget } from '@/hooks/character-sheet/dnd/dragClassification';
import type { useTabManagerActions } from '@/lib/character/tabManagerStore';
import type { useAppGeneralStateActions } from '@/lib/stores/appGeneralStateStore';
import type { DrawerState } from '@/lib/stores/drawerStore';
import type { SpringController, SpringTarget } from '@/lib/utils/dragFeedback';

interface UseSpringNavigationArgs {
   setDrawerCurrentFolderId: DrawerState['actions']['setDrawerCurrentFolderId'];
   setActiveTab: ReturnType<typeof useTabManagerActions>['setActiveTab'];
   setDrawerReceded: ReturnType<typeof useAppGeneralStateActions>['setDrawerReceded'];
   /** The cursor as of the last move, owned by the feedback layer: a nav anchors its grace there. */
   lastPointerRef: RefObject<{ x: number; y: number } | null>;
   /** The grace anchor the feedback layer decays once the cursor genuinely moves away. */
   navGraceAnchorRef: RefObject<{ x: number; y: number } | null>;
}

/*
 * Spring-loaded drawer navigation.
 *
 * Dwelling on a folder row / Back button mid-drag drills the drawer there without
 * ending the drag, so a deep move is one continuous gesture. `springTarget` (state)
 * drives the progress affordance on the hovered row; `draggedFolderIdRef` excludes
 * the held folder; `springNavigatingRef` guards against re-firing while a (async)
 * navigation is in flight. The controller owns the dwell timer (see dragFeedback).
 *
 * The See-Workspace recede rides a second, independent instance of the same timer, so a
 * folder dwell and a recede dwell can be in flight at once; the caller drives both by ref.
 */
export function useSpringNavigation({
   setDrawerCurrentFolderId,
   setActiveTab,
   setDrawerReceded,
   lastPointerRef,
   navGraceAnchorRef,
}: UseSpringNavigationArgs) {
   const [springTarget, setSpringTarget] = useState<string | null>(null);
   const [workspaceDwellKey, setWorkspaceDwellKey] = useState<string | null>(null);
   const draggedFolderIdRef = useRef<string | null>(null);
   const springNavigatingRef = useRef(false);

   /**
    * Performs a spring navigation when a dwell completes: drill into a folder, or go
    * up via the parent (read fresh from the store so Back is never stale). Guards
    * against re-firing while a navigation is in flight; the next pointer move
    * re-derives the dwell against the freshly loaded view, chaining multi-level
    * drilling without ending the drag.
    */
   const handleSpringNavigate = useCallback((target: SpringTarget) => {
      // Tab auto-nav: spring-switch the active character (synchronous). The drag
      // stays alive via the shared DragOverlay; the next move re-evaluates against
      // the now-active tab's sheet.
      if (target.kind === 'tab') {
         setActiveTab(target.id);
         return;
      }
      if (springNavigatingRef.current) return;
      const destination = target.kind === 'back' ? getParentFolderId(useDrawerStore.getState().currentFolderId) : target.id;
      // Anchor the post-nav grace at the current cursor: until it moves NAV_GRACE_PX,
      // the drop resolves to the folder we navigated to (not a row that reflows under it).
      navGraceAnchorRef.current = lastPointerRef.current;
      springNavigatingRef.current = true;
      // No post-nav target reset needed: dropping over the Back button (or anywhere in
      // the drawer that isn't a folder row) resolves to `current-folder`, which reads
      // the live current folder at drop, so a dwell-Back-then-release lands in the
      // folder you navigated to, regardless of pointer movement after the nav.
      void Promise.resolve(setDrawerCurrentFolderId(destination)).finally(() => {
         springNavigatingRef.current = false;
      });
   }, [setDrawerCurrentFolderId, setActiveTab, lastPointerRef, navGraceAnchorRef]);

   // The dwell controller is an imperative object created once (in an effect, not
   // during render, so its ref-reading callback is allowed) and reused for the
   // hook's lifetime; the event handlers below drive it via the ref.
   const springControllerRef = useRef<SpringController | null>(null);
   useEffect(() => {
      springControllerRef.current = createSpringController({
         onTargetChange: setSpringTarget,
         onNavigate: handleSpringNavigate,
      });
      const controller = springControllerRef.current;
      return () => controller.cancel();
   }, [handleSpringNavigate]);

   // The See-Workspace dwell: a SECOND instance of the same spring timer (same hold/affordance), keyed by
   // its own string target, so dwelling the strip recedes the overlay and dwelling the edge re-expands it.
   const handleWorkspaceDwell = useCallback((target: WorkspaceDwellTarget) => {
      setDrawerReceded(target === 'see-workspace');
   }, [setDrawerReceded]);
   const workspaceDwellControllerRef = useRef<SpringController<WorkspaceDwellTarget> | null>(null);
   useEffect(() => {
      workspaceDwellControllerRef.current = createSpringController<WorkspaceDwellTarget>({
         keyOf: (target) => target,
         onTargetChange: setWorkspaceDwellKey,
         onNavigate: handleWorkspaceDwell,
      });
      const controller = workspaceDwellControllerRef.current;
      return () => controller.cancel();
   }, [handleWorkspaceDwell]);

   return {
      springTarget,
      workspaceDwellKey,
      setWorkspaceDwellKey,
      draggedFolderIdRef,
      springNavigatingRef,
      springControllerRef,
      workspaceDwellControllerRef,
   };
}
