// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

// -- Animation Imports --
import { useMotionValue, type MotionValue } from 'framer-motion';

/*
 * The gesture end-to-end over synthetic touches: the engage path pages, the editable-journal carve-out
 * stands the drag down (its body owns horizontal travel; the nav-bar arrows step instead), and a
 * leading-edge swipe on the trackers page opens the toolbelt rather than paging.
 */

import { useMobileSheetPagerGesture } from './useMobileSheetPagerGesture';

type GestureConfig = Omit<Parameters<typeof useMobileSheetPagerGesture>[0], 'x'>;

function Harness({ config, onReady }: { config: GestureConfig; onReady: (x: MotionValue<number>) => void }) {
   const x = useMotionValue(0);
   onReady(x);
   const setNode = useMobileSheetPagerGesture({ ...config, x });
   return <div data-testid="track" ref={setNode} />;
}

const baseConfig = (overrides: Partial<GestureConfig> = {}): GestureConfig => ({
   width: 300,
   lastPage: 3,
   suppress: false,
   canToolbeltEdge: false,
   isLeftHanded: false,
   onOpenToolbelt: vi.fn(),
   animateToPage: vi.fn(),
   onCommit: vi.fn(),
   ...overrides,
});

// jsdom has no TouchEvent constructor; fabricate the shape the handlers read.
const touchEvent = (type: string, x: number, y: number): Event => {
   const event = new Event(type, { bubbles: true, cancelable: true });
   const point = { clientX: x, clientY: y };
   Object.assign(event, { touches: type === 'touchend' ? [] : [point], changedTouches: [point] });
   return event;
};

const mount = (config: GestureConfig) => {
   let motion!: MotionValue<number>;
   const view = render(<Harness config={config} onReady={(x) => { motion = x; }} />);
   const node = view.getByTestId('track');
   return { node, motion, view };
};

const swipe = (node: HTMLElement, from: [number, number], to: [number, number]) => {
   node.dispatchEvent(touchEvent('touchstart', from[0], from[1]));
   node.dispatchEvent(touchEvent('touchmove', to[0], to[1]));
   node.dispatchEvent(touchEvent('touchend', to[0], to[1]));
};

afterEach(cleanup);

describe('useMobileSheetPagerGesture', () => {
   it('pages forward on a clearly-horizontal swipe', () => {
      const config = baseConfig();
      const { node } = mount(config);

      swipe(node, [200, 100], [80, 100]);

      expect(config.onCommit).toHaveBeenCalledWith(1);
   });

   it('does not page on a vertical drag', () => {
      const config = baseConfig();
      const { node } = mount(config);

      swipe(node, [100, 200], [100, 60]);

      expect(config.onCommit).not.toHaveBeenCalled();
   });

   it('stands down over an editable journal (suppressed)', () => {
      const config = baseConfig({ suppress: true });
      const { node } = mount(config);

      swipe(node, [200, 100], [80, 100]);

      expect(config.onCommit).not.toHaveBeenCalled();
   });

   it('opens the toolbelt on a leading-edge swipe instead of paging (right-handed)', () => {
      const config = baseConfig({ canToolbeltEdge: true });
      const { node } = mount(config);

      // Start inside the reserved right edge, swipe left (toolbelt-open direction).
      swipe(node, [window.innerWidth - 10, 100], [window.innerWidth - 120, 100]);

      expect(config.onOpenToolbelt).toHaveBeenCalledTimes(1);
      expect(config.onCommit).not.toHaveBeenCalled();
   });
});
