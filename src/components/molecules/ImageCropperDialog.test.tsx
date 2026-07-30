// @vitest-environment jsdom

// -- Testing Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/*
 * The crop dialog's small-image handling. A sub-200px short edge is a low-resolution WARNING, not a block:
 * the caution line shows, but Accept stays enabled so the user keeps the final call on whether the image is
 * good enough. Restoring the old size gate to the `disabled` expression turns the "enabled" case red.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The stage is out of scope here; expose a control that reports a chosen region back to the dialog.
vi.mock('@/components/molecules/CropSurface', () => ({
   CropSurface: ({ onCropChange }: { onCropChange: (region: { x: number; y: number; width: number; height: number }) => void }) => (
      <button type="button" data-testid="pick-small-region" onClick={() => onCropChange({ x: 0, y: 0, width: 50, height: 50 })}>
         region
      </button>
   ),
}));

import { ImageCropperDialog } from './ImageCropperDialog';

const bitmap = { width: 800, height: 600 } as unknown as ImageBitmap;

const renderDialog = () =>
   render(
      <ImageCropperDialog imageUrl="blob:test" bitmap={bitmap} aspect="free" onCancel={() => {}} onComplete={() => {}} />,
   );

const applyButton = () => screen.getByRole('button', { name: 'ImageCropper.apply' });

afterEach(cleanup);

describe('image cropper small-image handling', () => {
   it('keeps Apply enabled for a sub-200px region', () => {
      renderDialog();
      // No region yet: nothing to cut, so Apply is disabled.
      expect(applyButton().hasAttribute('disabled')).toBe(true);

      fireEvent.click(screen.getByTestId('pick-small-region'));

      expect(applyButton().hasAttribute('disabled')).toBe(false);
   });

   it('shows the low-resolution warning for a sub-200px region', () => {
      renderDialog();
      expect(screen.queryByText('ImageCropper.lowResolution')).toBeNull();

      fireEvent.click(screen.getByTestId('pick-small-region'));

      expect(screen.queryByText('ImageCropper.lowResolution')).not.toBeNull();
   });
});
