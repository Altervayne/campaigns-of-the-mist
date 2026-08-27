// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

// -- Local Imports --
import { PdfAnnotationLayer } from './PdfAnnotationLayer';

// -- Type Imports --
import type { PdfAnnotation } from '@/lib/types/pdfAnnotation';

afterEach(cleanup);

const WIDTH = 200;
const HEIGHT = 400;

const annotations: PdfAnnotation[] = [
   { id: 'hl', page: 1, createdAt: 1, kind: 'highlight', color: '#22cc55', rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, alpha: 0.3 },
   { id: 'ik', page: 1, createdAt: 2, kind: 'ink', color: '#ff3300', points: [0, 0, 0.5, 0.5], width: 0.02 },
   { id: 'cm', page: 1, createdAt: 3, kind: 'comment', color: '#3355ff', rect: { x: 0.25, y: 0.5, w: 0.25, h: 0.25 }, body: 'house rule' },
];

describe('PdfAnnotationLayer', () => {
   it('paints highlight and ink with denormalized geometry, never comments', () => {
      const { container } = render(<PdfAnnotationLayer annotations={annotations} width={WIDTH} height={HEIGHT} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('viewBox')).toBe(`0 0 ${WIDTH} ${HEIGHT}`);

      // Highlight: a translucent rect at the denormalized rect coords.
      const highlight = svg.querySelector('rect[fill-opacity="0.3"]')!;
      expect(highlight.getAttribute('x')).toBe('20');
      expect(highlight.getAttribute('y')).toBe('80');
      expect(highlight.getAttribute('width')).toBe('60');
      expect(highlight.getAttribute('height')).toBe('160');
      expect(highlight.getAttribute('fill')).toBe('#22cc55');

      // Ink: the board stroke renderer emits a <path>.
      expect(svg.querySelectorAll('path').length).toBeGreaterThanOrEqual(1);

      // Comments render in PdfCommentLayer, so this layer paints no region fill for one.
      expect(svg.querySelector('rect[fill-opacity="0.08"]')).toBeNull();
   });

   it('paints one denormalized rect per text-highlight quad', () => {
      const textHighlight: PdfAnnotation = {
         id: 'th',
         page: 1,
         createdAt: 4,
         kind: 'textHighlight',
         color: '#ffcc00',
         alpha: 0.35,
         text: 'two lines',
         quads: [
            { x: 0.1, y: 0.1, w: 0.2, h: 0.05 },
            { x: 0.1, y: 0.2, w: 0.3, h: 0.05 },
         ],
      };
      const { container } = render(<PdfAnnotationLayer annotations={[textHighlight]} width={WIDTH} height={HEIGHT} />);
      const rects = [...container.querySelectorAll('rect[fill-opacity="0.35"]')];
      expect(rects).toHaveLength(2);
      // First quad: {0.1,0.1,0.2,0.05} at 200x400 -> {20,40,40,20}.
      expect(rects[0].getAttribute('x')).toBe('20');
      expect(rects[0].getAttribute('y')).toBe('40');
      expect(rects[0].getAttribute('width')).toBe('40');
      expect(rects[0].getAttribute('height')).toBe('20');
      expect(rects[0].getAttribute('fill')).toBe('#ffcc00');
      // Second quad: {0.1,0.2,0.3,0.05} -> {20,80,60,20}.
      expect(rects[1].getAttribute('x')).toBe('20');
      expect(rects[1].getAttribute('y')).toBe('80');
      expect(rects[1].getAttribute('width')).toBe('60');
   });

   it('is inert to pointer input this phase', () => {
      const { container } = render(<PdfAnnotationLayer annotations={annotations} width={WIDTH} height={HEIGHT} />);
      expect(container.querySelector('svg')!.classList.contains('pointer-events-none')).toBe(true);
   });
});
