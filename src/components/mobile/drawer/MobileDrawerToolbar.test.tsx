// @vitest-environment jsdom

// -- Library Imports --
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

// -- Component Imports --
import MobileDrawerToolbar from './MobileDrawerToolbar';

// -- Utils Imports --
import { ACCEPT_DRAWER_IMPORT } from '@/lib/utils/fileAccept';

/*
 * The mobile drawer picker feeds the same `useDrawerFileImport` handler as the side panel's, so it has to
 * offer the same files. It once offered a different set; the side panel pins its half in
 * `Drawer.surface.test.tsx`, and this pins the mobile half against the same constant.
 */

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('MobileDrawerToolbar import picker', () => {
   it('offers the drawer import family', () => {
      const fileInputRef = createRef<HTMLInputElement>();
      render(
         <MobileDrawerToolbar
            isLeftHanded={false}
            fabSlotStyle={undefined}
            formRef={createRef<HTMLFormElement>()}
            fileInputRef={fileInputRef}
            onFileSelected={() => {}}
            onAddFolder={() => {}}
            isCompactView={false}
            onToggleView={() => {}}
            canUndo={false}
            canRedo={false}
            onUndo={() => {}}
            onRedo={() => {}}
         />
      );
      expect(fileInputRef.current?.getAttribute('accept')).toBe(ACCEPT_DRAWER_IMPORT);
   });
});
