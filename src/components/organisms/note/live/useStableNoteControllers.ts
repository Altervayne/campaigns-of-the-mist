// -- React Imports --
import { useRef } from 'react';

// -- Type Imports --
import type { CoverController } from './coverGutter';
import type { FormatController } from './formatToolbar';
import type { LinkEditController } from './linkEditToolbar';
import type { TableController } from './tableWidget';
import type { ImageController } from './assetImageWidget';

interface NoteControllers {
   coverController: CoverController;
   formatController: FormatController;
   linkEditController: LinkEditController;
   tableController: TableController;
   imageController?: ImageController;
}

interface StableNoteControllers {
   stableController: CoverController;
   stableFormatController: FormatController;
   stableLinkEditController: LinkEditController;
   stableTableController: TableController;
   stableImageController: ImageController;
}

/*
 * Wraps each note controller prop in a STABLE delegate whose identity never changes, so the CM6 extensions
 * (built once per view) always call the CURRENT callbacks - a re-render swaps the closures behind a latest-ref
 * without rebuilding the view. Optional presence flags (`onTap`, `onCaretLinkChange`) are resolved ONCE at
 * first render (fixed per surface: desktop never taps, mobile always does), never per-call, so a static
 * delegate can't force taps everywhere or suppress the desktop bar.
 */
export function useStableNoteControllers({ coverController, formatController, linkEditController, tableController, imageController }: NoteControllers): StableNoteControllers {
   const controllerRef = useRef(coverController);
   controllerRef.current = coverController;
   const stableController = useRef<CoverController>({
      get editable() { return controllerRef.current.editable; },
      get labels() { return controllerRef.current.labels; },
      onChange: () => controllerRef.current.onChange(),
      onRemove: () => controllerRef.current.onRemove(),
      onResizeBox: (w, a) => controllerRef.current.onResizeBox(w, a),
      onSetAspect: (a) => controllerRef.current.onSetAspect(a),
      onTap: coverController.onTap ? () => controllerRef.current.onTap?.() : undefined,
   }).current;

   const formatControllerRef = useRef(formatController);
   formatControllerRef.current = formatController;
   const stableFormatController = useRef<FormatController>({
      get editable() { return formatControllerRef.current.editable; },
      get labels() { return formatControllerRef.current.labels; },
      onInsertLink: () => formatControllerRef.current.onInsertLink(),
   }).current;

   const linkEditControllerRef = useRef(linkEditController);
   linkEditControllerRef.current = linkEditController;
   const stableLinkEditController = useRef<LinkEditController>({
      get editable() { return linkEditControllerRef.current.editable; },
      get labels() { return linkEditControllerRef.current.labels; },
      onOpen: (href) => linkEditControllerRef.current.onOpen(href),
      onChangeTarget: (seed) => linkEditControllerRef.current.onChangeTarget(seed),
      onCaretLinkChange: linkEditController.onCaretLinkChange ? (info) => linkEditControllerRef.current.onCaretLinkChange?.(info) : undefined,
   }).current;

   const tableControllerRef = useRef(tableController);
   tableControllerRef.current = tableController;
   const stableTableController = useRef<TableController>({
      openContextMenu: (request) => tableControllerRef.current.openContextMenu(request),
      onCaretCell: (ctx) => tableControllerRef.current.onCaretCell?.(ctx),
      get labels() { return tableControllerRef.current.labels; },
   }).current;

   const imageControllerRef = useRef(imageController);
   imageControllerRef.current = imageController;
   const stableImageController = useRef<ImageController>({
      onTap: imageController?.onTap ? (ctx) => imageControllerRef.current?.onTap?.(ctx) : undefined,
   }).current;

   return { stableController, stableFormatController, stableLinkEditController, stableTableController, stableImageController };
}
