// -- Library Imports --
import { describe, expect, it } from 'vitest';

// -- Local Imports --
import { isPlaceholderPdf, selectableRepairSources } from './pdfPlaceholder';

// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';

/*
 * The placeholder discriminant + the repair picker's source filter. A placeholder is a null-hash
 * record; the picker offers every OTHER real file (never a placeholder, never the item being repaired).
 */

const real = (id: string): PdfDocument => ({ id, title: id, assetHash: `hash-${id}`, coverAssetHash: null, pageCount: 4 });
const placeholder = (id: string): PdfDocument => ({ id, title: id, assetHash: null, coverAssetHash: null, pageCount: 4 });

describe('isPlaceholderPdf', () => {
   it('flags a null-hash record and clears a real one', () => {
      expect(isPlaceholderPdf(placeholder('a'))).toBe(true);
      expect(isPlaceholderPdf(real('a'))).toBe(false);
      expect(isPlaceholderPdf(undefined)).toBe(false);
      expect(isPlaceholderPdf(null)).toBe(false);
   });
});

describe('selectableRepairSources', () => {
   it('keeps only real files, dropping placeholders and the item being repaired', () => {
      const list = [real('self'), real('other'), placeholder('ghost'), real('third')];
      const sources = selectableRepairSources(list, 'self');

      expect(sources.map((pdf) => pdf.id)).toEqual(['other', 'third']);
   });

   it('yields nothing when every other PDF is a placeholder', () => {
      const list = [placeholder('self'), placeholder('ghost')];
      expect(selectableRepairSources(list, 'self')).toEqual([]);
   });
});
