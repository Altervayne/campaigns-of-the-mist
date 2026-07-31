// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n/config';

// The dev-mode missingKeyHandler is the runtime safety net for translation keys the static build
// guard (scripts/check-i18n.mjs) can't see - dynamically-built ones. It must fire for a key absent
// from en (which renders raw to users) and stay silent for one that resolves. (Lives under src/lib
// because vitest only collects tests there; it exercises the config in src/i18n.)

describe('i18n missing-key handler', () => {
   afterEach(() => vi.restoreAllMocks());

   it('errors on a key absent from en.json', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      i18n.t('HeroCard.__guard_selftest_absent__');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('__guard_selftest_absent__'));
   });

   it('stays silent for a key present in en.json', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      i18n.t('Common.close');
      expect(spy).not.toHaveBeenCalled();
   });
});
