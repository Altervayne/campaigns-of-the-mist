// -- Test Imports --
import { describe, it, expect } from 'vitest';

// -- Unit Under Test --
import { boardBackgroundStyle, withBackgroundColor, withBackgroundTexture } from './boardBackgroundStyle';

describe('boardBackgroundStyle', () => {
   it('paints nothing for an absent or fully-empty background', () => {
      expect(boardBackgroundStyle(undefined)).toEqual({});
      expect(boardBackgroundStyle({})).toEqual({});
      expect(boardBackgroundStyle({ color: undefined, texture: undefined })).toEqual({});
   });

   it('paints a fill color with no texture', () => {
      const style = boardBackgroundStyle({ color: '#123456' });
      expect(style.backgroundColor).toBe('#123456');
      expect(style.backgroundImage).toBeUndefined();
   });

   it('paints the paper texture (over a fill or the bare canvas)', () => {
      const withFill = boardBackgroundStyle({ color: '#eee', texture: 'paper' });
      expect(withFill.backgroundColor).toBe('#eee');
      expect(withFill.backgroundImage).toContain('data:image/svg+xml');
      expect(withFill.backgroundSize).toBeDefined();

      const bare = boardBackgroundStyle({ texture: 'paper' });
      expect(bare.backgroundColor).toBeUndefined();
      expect(bare.backgroundImage).toContain('data:image/svg+xml');
   });

   it('crosses two skewed-noise layers for the woven linen texture', () => {
      const style = boardBackgroundStyle({ texture: 'linen' });
      // Two layers (warp + weft), so the data URI and the tile size each appear twice.
      expect(style.backgroundImage?.match(/data:image\/svg\+xml/g)).toHaveLength(2);
      expect(style.backgroundSize).toBe('120px 120px, 120px 120px');
   });
});

describe('withBackgroundColor / withBackgroundTexture', () => {
   it('sets a field, preserving the other', () => {
      expect(withBackgroundColor({ texture: 'paper' }, '#fff')).toEqual({ texture: 'paper', color: '#fff' });
      expect(withBackgroundTexture({ color: '#fff' }, 'linen')).toEqual({ color: '#fff', texture: 'linen' });
   });

   it('clears a field, and collapses a now-empty background to undefined', () => {
      expect(withBackgroundColor({ color: '#fff' }, undefined)).toBeUndefined();
      expect(withBackgroundTexture({ texture: 'paper' }, undefined)).toBeUndefined();
      expect(withBackgroundColor(undefined, undefined)).toBeUndefined();
   });

   it('keeps the surviving field when the other is cleared', () => {
      expect(withBackgroundColor({ color: '#fff', texture: 'paper' }, undefined)).toEqual({ texture: 'paper' });
      expect(withBackgroundTexture({ color: '#fff', texture: 'paper' }, undefined)).toEqual({ color: '#fff' });
   });
});
