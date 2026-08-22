// -- Test Imports --
import { describe, expect, it } from 'vitest';

// -- Subject Imports --
import {
   framePlateSpec,
   imageBoxShadowCss,
   imageDropShadowCss,
   imageFilterCss,
   IMAGE_FRAME_MATTE,
   IMAGE_SLIDE_MATTE,
} from './imageStyle';

describe('imageFilterCss', () => {
   it('maps each named look', () => {
      expect(imageFilterCss('grayscale')).toBe('grayscale(1)');
      expect(imageFilterCss('sepia')).toBe('sepia(0.85)');
      expect(imageFilterCss('noir')).toBe('grayscale(1) contrast(1.4)');
   });

   it('appends a non-unit brightness after the look', () => {
      expect(imageFilterCss('sepia', 1.2)).toBe('sepia(0.85) brightness(1.2)');
      expect(imageFilterCss(undefined, 0.7)).toBe('brightness(0.7)');
   });

   it('ignores a unit or absent brightness', () => {
      expect(imageFilterCss('grayscale', 1)).toBe('grayscale(1)');
      expect(imageFilterCss('grayscale', undefined)).toBe('grayscale(1)');
   });

   it('yields undefined with no look and a unit or absent brightness', () => {
      expect(imageFilterCss()).toBeUndefined();
      expect(imageFilterCss(undefined, 1)).toBeUndefined();
   });

   it('appends non-unit contrast and saturation in order after brightness', () => {
      expect(imageFilterCss(undefined, undefined, 1.3)).toBe('contrast(1.3)');
      expect(imageFilterCss(undefined, undefined, undefined, 0)).toBe('saturate(0)');
      expect(imageFilterCss('sepia', 1.2, 1.3, 0.5)).toBe('sepia(0.85) brightness(1.2) contrast(1.3) saturate(0.5)');
      expect(imageFilterCss(undefined, 1, 1, 1)).toBeUndefined();
   });
});

describe('image shadow css', () => {
   it('yields undefined when absent', () => {
      expect(imageBoxShadowCss(undefined)).toBeUndefined();
      expect(imageDropShadowCss(undefined)).toBeUndefined();
   });

   it('grows with depth', () => {
      expect(imageBoxShadowCss('sm')).toBe('0 1px 4px rgba(0, 0, 0, 0.25)');
      expect(imageBoxShadowCss('md')).toBe('0 4px 10px rgba(0, 0, 0, 0.3)');
      expect(imageBoxShadowCss('lg')).toBe('0 10px 24px rgba(0, 0, 0, 0.35)');
   });

   it('wraps the same depth as a drop-shadow token for masked images', () => {
      expect(imageDropShadowCss('md')).toBe('drop-shadow(0 4px 10px rgba(0, 0, 0, 0.3))');
   });
});

describe('framePlateSpec', () => {
   it('has no plate for tape or an absent frame', () => {
      expect(framePlateSpec(undefined)).toBeNull();
      expect(framePlateSpec('tape')).toBeNull();
   });

   it('gives polaroid a heavier bottom lip on the matte stock', () => {
      const spec = framePlateSpec('polaroid');
      expect(spec).toEqual({ padding: '6% 6% 20% 6%', background: IMAGE_FRAME_MATTE, radius: 2 });
   });

   it('mounts matte evenly on the matte stock', () => {
      expect(framePlateSpec('matte')).toEqual({ padding: '7%', background: IMAGE_FRAME_MATTE, radius: 2 });
   });

   it('mounts slide thicker on the cooler stock', () => {
      expect(framePlateSpec('slide')).toEqual({ padding: '10%', background: IMAGE_SLIDE_MATTE, radius: 4 });
   });
});
