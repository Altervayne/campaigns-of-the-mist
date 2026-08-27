// -- Testing Imports --
import { describe, expect, it, vi } from 'vitest';

// -- Unit Under Test --
import { getTextLayerHandle, registerTextLayer, subscribeTextLayer, unregisterTextLayer } from './pdfTextLayerRegistry';

// -- Type Imports --
import type { TextLayerHandle } from './pdfTextLayerRegistry';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/*
 * The registry keys DOM handles by document then page. A fake proxy (any object works as the WeakMap key)
 * and plain handles exercise register/get/unregister, the stale-unmount guard, and subscriber notification
 * without pdf.js or a real text layer.
 */

function fakeProxy(): PDFDocumentProxy {
   return {} as unknown as PDFDocumentProxy;
}

function handle(tag: string): TextLayerHandle {
   return { textDivs: [], itemsStr: [tag] };
}

describe('pdfTextLayerRegistry', () => {
   it('publishes a handle and reads it back per (document, page)', () => {
      const proxy = fakeProxy();
      const h = handle('a');
      expect(getTextLayerHandle(proxy, 1)).toBeNull();
      registerTextLayer(proxy, 1, h);
      expect(getTextLayerHandle(proxy, 1)).toBe(h);
      expect(getTextLayerHandle(proxy, 2)).toBeNull();
   });

   it('notifies subscribers on register and unregister of their page only', () => {
      const proxy = fakeProxy();
      const onPage1 = vi.fn();
      const onPage2 = vi.fn();
      subscribeTextLayer(proxy, 1, onPage1);
      subscribeTextLayer(proxy, 2, onPage2);

      const h = handle('a');
      registerTextLayer(proxy, 1, h);
      expect(onPage1).toHaveBeenCalledTimes(1);
      expect(onPage2).not.toHaveBeenCalled();

      unregisterTextLayer(proxy, 1, h);
      expect(onPage1).toHaveBeenCalledTimes(2);
      expect(getTextLayerHandle(proxy, 1)).toBeNull();
   });

   it('ignores a stale unregister so a newer render is not wiped', () => {
      const proxy = fakeProxy();
      const first = handle('first');
      const second = handle('second');
      registerTextLayer(proxy, 1, first);
      registerTextLayer(proxy, 1, second);
      // The first layer's late unmount must not clear the second's registration.
      unregisterTextLayer(proxy, 1, first);
      expect(getTextLayerHandle(proxy, 1)).toBe(second);
      unregisterTextLayer(proxy, 1, second);
      expect(getTextLayerHandle(proxy, 1)).toBeNull();
   });

   it('stops notifying after unsubscribe', () => {
      const proxy = fakeProxy();
      const cb = vi.fn();
      const unsubscribe = subscribeTextLayer(proxy, 1, cb);
      registerTextLayer(proxy, 1, handle('a'));
      expect(cb).toHaveBeenCalledTimes(1);
      unsubscribe();
      registerTextLayer(proxy, 1, handle('b'));
      expect(cb).toHaveBeenCalledTimes(1);
   });
});
