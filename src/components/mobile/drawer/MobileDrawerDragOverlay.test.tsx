// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// -- Component Imports --
import MobileDrawerDragOverlay from './MobileDrawerDragOverlay';

// -- Type Imports --
import type { ComponentProps } from 'react';
import type { DrawerItem, DrawerItemContent } from '@/lib/types/drawer';
import type { DrawerFolderRecord } from '@/lib/drawer/drawerRecords';

/*
 * The drag overlay's snapshots are pure functions of their props, so they render directly here without a
 * drag: no mouse can arm the drawer's TouchSensor, and the gesture that mounts them on a device is out of
 * reach of any test. What IS reachable is the output - the folder summary line, the compact/rich item
 * shapes, and the handedness flip that mirrors the row onto the other edge.
 *
 * These are presentational copies of `MobileFolderItem` / `MobileDrawerItem`; a class drift between the
 * copy and its original only shows up mid-drag on a real device, so the chrome is asserted, not just the
 * text.
 */

// Echo the i18n key, with the interpolated count appended so the folder summary's numbers are assertable.
vi.mock('react-i18next', () => ({
   useTranslation: () => ({
      t: (key: string, options?: { count?: number }) => (options?.count == null ? key : `${key}:${options.count}`),
   }),
}));
vi.mock('@/components/organisms/drawer/DrawerItemPreview', () => ({
   DrawerItemPreview: ({ item }: { item: DrawerItem }) => <div data-testid="item-preview">{item.name}</div>,
}));

const folder: DrawerFolderRecord = { id: 'folder-a', name: 'Folder A', parentFolderId: 'root', order: 0 };
const item: DrawerItem = {
   id: 'item-a',
   name: 'Item A',
   game: 'LEGENDS',
   type: 'CHARACTER_CARD',
   content: { id: 'content-a' } as unknown as DrawerItemContent,
};

type OverlayProps = ComponentProps<typeof MobileDrawerDragOverlay>;

const defaults: OverlayProps = {
   activeFolder: undefined,
   activeItem: undefined,
   folderCount: 0,
   itemCount: 0,
   isCompact: true,
   isLeftHanded: false,
};

const renderOverlay = (props: Partial<OverlayProps>) => render(<MobileDrawerDragOverlay {...defaults} {...props} />);
const snapshot = (container: HTMLElement) => container.firstElementChild!;
/** The corner context-menu slot: the fixed-width block trailing the row body. */
const menuSlot = (container: HTMLElement) => snapshot(container).querySelector('.w-11');

afterEach(cleanup);

describe('MobileDrawerDragOverlay folder snapshot', () => {
   it('renders the folder name and both child counts', () => {
      const { container } = renderOverlay({ activeFolder: folder, folderCount: 2, itemCount: 3 });

      expect(screen.getByText('Folder A')).toBeTruthy();
      expect(snapshot(container).textContent).toContain('Drawer.folderCount:2');
      expect(snapshot(container).textContent).toContain('Drawer.itemCount:3');
   });

   it('labels a folder with no children as empty', () => {
      const { container } = renderOverlay({ activeFolder: folder });

      expect(snapshot(container).textContent).toContain('Drawer.empty');
   });

   it('carries the lifted-row chrome and the context-menu slot', () => {
      const { container } = renderOverlay({ activeFolder: folder });

      expect(snapshot(container).className).toContain('shadow-2xl');
      expect(snapshot(container).className).toContain('bg-card');
      expect(menuSlot(container)?.querySelector('svg')).toBeTruthy();
   });

   it('lays the row out leading-edge-first for a right-handed user', () => {
      const { container } = renderOverlay({ activeFolder: folder, isLeftHanded: false });

      expect(snapshot(container).className).not.toContain('flex-row-reverse');
   });

   it('mirrors the row for a left-handed user', () => {
      const { container } = renderOverlay({ activeFolder: folder, isLeftHanded: true });

      expect(snapshot(container).className).toContain('flex-row-reverse');
   });
});

describe('MobileDrawerDragOverlay item snapshot', () => {
   it('renders the compact shape with the item name and its game tag', () => {
      const { container } = renderOverlay({ activeItem: item, isCompact: true });

      expect(screen.getByText('Item A')).toBeTruthy();
      expect(screen.getByText('Drawer.Types.LEGENDS')).toBeTruthy();
      expect(screen.queryByTestId('item-preview')).toBeNull();
      expect(snapshot(container).className).toContain('items-center');
   });

   it('renders the rich shape as the shared item preview', () => {
      const { container } = renderOverlay({ activeItem: item, isCompact: false });

      expect(screen.getByTestId('item-preview')).toBeTruthy();
      expect(screen.queryByText('Drawer.Types.LEGENDS')).toBeNull();
      expect(snapshot(container).className).toContain('items-start');
   });

   it('drops the game tag for a game-agnostic item', () => {
      renderOverlay({ activeItem: { ...item, game: 'NEUTRAL' }, isCompact: true });

      expect(screen.queryByText('Drawer.Types.NEUTRAL')).toBeNull();
   });

   it('carries the lifted-row chrome and the context-menu slot', () => {
      const { container } = renderOverlay({ activeItem: item });

      expect(snapshot(container).className).toContain('shadow-2xl');
      expect(menuSlot(container)?.querySelector('svg')).toBeTruthy();
   });

   it('lays the row out leading-edge-first for a right-handed user', () => {
      const { container } = renderOverlay({ activeItem: item, isLeftHanded: false });

      expect(snapshot(container).className).not.toContain('flex-row-reverse');
   });

   it('mirrors the row for a left-handed user', () => {
      const { container } = renderOverlay({ activeItem: item, isLeftHanded: true });

      expect(snapshot(container).className).toContain('flex-row-reverse');
   });
});

describe('MobileDrawerDragOverlay active kind', () => {
   it('renders nothing while no row is lifted', () => {
      const { container } = renderOverlay({});

      expect(container.firstElementChild).toBeNull();
   });

   it('renders only the folder snapshot for a folder drag', () => {
      renderOverlay({ activeFolder: folder });

      expect(screen.getByText('Folder A')).toBeTruthy();
      expect(screen.queryByText('Item A')).toBeNull();
   });

   it('renders only the item snapshot for an item drag', () => {
      renderOverlay({ activeItem: item });

      expect(screen.getByText('Item A')).toBeTruthy();
      expect(screen.queryByText('Folder A')).toBeNull();
   });
});
