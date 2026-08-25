// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { hasAnnotations } from './annotations';

// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';

function doc(annotations?: PdfDocument['annotations']): PdfDocument {
   return { id: 'pdf-1', title: 'Rulebook', assetHash: 'hash', pageCount: 42, annotations };
}

describe('hasAnnotations', () => {
   it('is false for a nullish doc', () => {
      expect(hasAnnotations(undefined)).toBe(false);
      expect(hasAnnotations(null)).toBe(false);
   });

   it('is false when the map is absent or empty', () => {
      expect(hasAnnotations(doc())).toBe(false);
      expect(hasAnnotations(doc({}))).toBe(false);
   });

   it('is true once a mark is present', () => {
      expect(hasAnnotations(doc({ a1: { id: 'a1', kind: 'ink', page: 1, color: '#000', createdAt: 1, points: [0, 0], width: 0.01 } }))).toBe(true);
   });
});
