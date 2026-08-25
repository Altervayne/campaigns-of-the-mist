// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

// -- Local Imports --
import { PdfCommentLayer } from './PdfCommentLayer';
import { PdfMarkupContext, type PdfMarkupContextValue } from '@/lib/pdf/PdfMarkupContext';

// -- Type Imports --
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(cleanup);

const WIDTH = 200;
const HEIGHT = 400;

const annotations: PdfAnnotation[] = [
   { id: 'hl', page: 1, createdAt: 1, kind: 'highlight', color: '#22cc55', rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, alpha: 0.3 },
   { id: 'cm', page: 1, createdAt: 3, kind: 'comment', color: '#3355ff', rect: { x: 0.25, y: 0.5, w: 0.25, h: 0.25 }, body: 'house rule' },
];

function renderLayer(overrides: Partial<PdfMarkupContextValue> = {}) {
   // The layer reads only mode / focusComment / focusedCommentId; a partial value covers it.
   const value = { mode: 'read', focusComment: vi.fn(), focusedCommentId: null, ...overrides } as PdfMarkupContextValue;
   return {
      value,
      ...render(
         <PdfMarkupContext.Provider value={value}>
            <PdfCommentLayer annotations={annotations} width={WIDTH} height={HEIGHT} />
         </PdfMarkupContext.Provider>,
      ),
   };
}

describe('PdfCommentLayer', () => {
   it('paints only comments, as a colored zone with a speech-bubble badge', () => {
      const { container } = renderLayer({ mode: 'read', focusComment: vi.fn() });

      // One button per comment (the highlight is not this layer's concern).
      const zones = container.querySelectorAll('button');
      expect(zones).toHaveLength(1);

      const zone = zones[0] as HTMLButtonElement;
      // Positioned at the denormalized region origin, sized to the region.
      expect(zone.style.left).toBe('50px');
      expect(zone.style.top).toBe('200px');
      expect(zone.style.width).toBe('50px');
      expect(zone.style.height).toBe('100px');

      // The region rect draws in the comment's own color; a badge icon marks it as a note.
      const rect = zone.querySelector('svg rect')!;
      expect(rect.getAttribute('fill')).toBe('#3355ff');
      expect(rect.getAttribute('stroke')).toBe('#3355ff');
      expect(zone.querySelector('span svg')).not.toBeNull();
   });

   it('focuses the comment card on click in read mode', () => {
      const focusComment = vi.fn();
      const { container } = renderLayer({ mode: 'read', focusComment });

      const zone = container.querySelector('button')!;
      expect(zone.className).toContain('pointer-events-auto');
      fireEvent.click(zone);
      expect(focusComment).toHaveBeenCalledWith('cm');
   });

   it('goes inert in markup mode (the capture layer owns interaction)', () => {
      const focusComment = vi.fn();
      const { container } = renderLayer({ mode: 'markup', focusComment });

      const zone = container.querySelector('button')!;
      expect(zone.className).toContain('pointer-events-none');
      expect(zone.disabled).toBe(true);
      fireEvent.click(zone);
      expect(focusComment).not.toHaveBeenCalled();
   });
});
