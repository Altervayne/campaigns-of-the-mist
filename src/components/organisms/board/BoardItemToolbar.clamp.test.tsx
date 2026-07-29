// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

// -- Component Imports --
import { BoardItemToolbar } from './BoardItemToolbar';

/*
 * Locks the per-item toolbar's off-edge clamps.
 *
 * The bar is CENTRED over its item, so its own `translateX(-50%)` is load-bearing: the sideways clamp has
 * to compose with that offset rather than replace it. The group bar is left-aligned and composes from a
 * bare translate instead, so the two cannot share one transform.
 *
 * The clip is overflow-hidden, so an unclamped bar near the sidebar / drawer / navigator is CUT OFF at the
 * board's edge rather than drawn over the panel; both clamps exist to keep it reachable.
 */

// Echo the i18n key instead of standing up a provider - only labels are read here.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(cleanup);

const MOVE_LABEL = 'BoardView.moveItem';

function renderBar(props: { zoom?: number; clampX?: number; clampDown?: number; extraBottom?: number }) {
   const result = render(
      <BoardItemToolbar
         zoom={props.zoom ?? 1}
         onMoveStart={() => {}}
         onConnectStart={() => {}}
         onBringToFront={() => {}}
         onSendToBack={() => {}}
         onDelete={() => {}}
         slotRef={() => {}}
         measureRef={() => {}}
         extraBottom={props.extraBottom}
         clampDown={props.clampDown}
         clampX={props.clampX}
      />,
   );
   const grip = result.getByLabelText(MOVE_LABEL);
   return grip.parentElement!.parentElement!.parentElement!;
}

describe('per-item toolbar clamps', () => {
   it('keeps the centring offset when it needs no sideways clamp', () => {
      expect(renderBar({}).style.transform).toContain('translateX(-50%)');
   });

   it('composes the sideways clamp WITH the centring offset, not instead of it', () => {
      const root = renderBar({ clampX: 120 });

      // Both terms must survive: dropping the -50% un-centres every bar, dropping the clamp re-hides it.
      expect(root.style.transform).toContain('-50%');
      expect(root.style.transform).toContain('120px');
   });

   it('shifts left as well as right, so the bar clears both edges', () => {
      expect(renderBar({ clampX: -75 }).style.transform).toContain('-75px');
   });

   it('counter-scales by 1/zoom independently of the clamp', () => {
      expect(renderBar({ zoom: 2, clampX: 40 }).style.transform).toContain('scale(0.5)');
   });

   // The style is authored as `calc(100% + Npx)`; a negative N normalizes to a subtraction.
   it('still clamps off the top edge', () => {
      expect(renderBar({ clampDown: 30 }).style.bottom).toBe('calc(100% - 30px)');
   });

   it('composes the top clamp with a zone lift', () => {
      expect(renderBar({ clampDown: 30, extraBottom: 12 }).style.bottom).toBe('calc(100% - 18px)');
   });
});
