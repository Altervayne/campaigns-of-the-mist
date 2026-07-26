// -- Component Imports --
import { BoardNameField } from '../fields/BoardNameField';

// -- Utility Imports --
import { cn } from '@/lib/utils';

/**
 * Board name pill: identity, not a tool, so it sits in its own top-center frame rather than crowding
 * the tool bar. Same frosted chrome; stops the pointer so editing the title never pans, and grows
 * to fit the title (capped at the canvas width) via the field's own auto-size mirror.
 */
export function BoardNamePill({ name, placeholder, onCommit, layersPanelOpen, layersPanelWidth }: { name: string; placeholder: string; onCommit: (value: string) => void; layersPanelOpen: boolean; layersPanelWidth: number }) {
   return (
      <div
         onPointerDown={(event) => event.stopPropagation()}
         style={{ marginLeft: layersPanelOpen ? -(layersPanelWidth / 2) : 0 }}
         className={cn(
            'absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center overflow-hidden rounded-md border border-border bg-card/90 p-1.5 shadow-sm backdrop-blur-sm transition-[margin-left] duration-300 ease-out',
            // Slide out of the layers panel's column and cap the width to the free region, like the tool bar.
            layersPanelOpen ? 'max-w-[calc(100%-1.5rem-16rem)]' : 'max-w-[calc(100%-1.5rem)]',
         )}
      >
         <BoardNameField name={name} placeholder={placeholder} onCommit={onCommit} />
      </div>
   );
}
