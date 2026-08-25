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
   it('paints highlight, ink, and comment with denormalized geometry', () => {
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

      // Comment: a faint region rect plus a corner marker, both in the annotation color.
      const region = svg.querySelector('rect[fill-opacity="0.08"]')!;
      expect(region.getAttribute('x')).toBe('50');
      expect(region.getAttribute('y')).toBe('200');
      expect(region.getAttribute('width')).toBe('50');
      expect(region.getAttribute('height')).toBe('100');
      expect(region.getAttribute('stroke')).toBe('#3355ff');
      const marker = svg.querySelector('g rect[width="12"][height="12"]')!;
      expect(marker.getAttribute('x')).toBe('50');
      expect(marker.getAttribute('y')).toBe('200');
      expect(marker.getAttribute('fill')).toBe('#3355ff');
   });

   it('is inert to pointer input this phase', () => {
      const { container } = render(<PdfAnnotationLayer annotations={annotations} width={WIDTH} height={HEIGHT} />);
      expect(container.querySelector('svg')!.classList.contains('pointer-events-none')).toBe(true);
   });
});
