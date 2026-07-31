// -- React Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Component Imports --
import { Button } from '@/components/ui/button';

/**
 * A small icon control in the journal's bar; stops the drag and fires its click. The default is a compact
 * transparent button tinted for the paper HEADER band it sits on (the footer pages bar); a host that hosts
 * these in its own card toolbar passes `toolbarClassName`, which switches to the shared
 * `<Button variant="outline" size="icon">` with that className so the control is pixel-identical to the
 * toolbar's other buttons (grip / delete / flip).
 */
export function JournalControlButton({
   title,
   disabled = false,
   onClick,
   onPointerDown,
   toolbarClassName,
   appChrome = false,
   touch = false,
   children,
}: {
   title: string;
   disabled?: boolean;
   onClick: () => void;
   onPointerDown: (event: ReactPointerEvent) => void;
   toolbarClassName?: string;
   /** Board-only fallback: color for the app-chrome selection toolbar (vs the default paper-band footer). */
   appChrome?: boolean;
   /** Mobile reader: grow the paper-band control to a >=44px touch target (the icon stays centered). */
   touch?: boolean;
   children: React.ReactNode;
}) {
   if (toolbarClassName) {
      return (
         <Button
            variant="outline"
            size="icon"
            title={title}
            aria-label={title}
            disabled={disabled}
            onPointerDown={onPointerDown}
            onClick={onClick}
            className={toolbarClassName}
         >
            {children}
         </Button>
      );
   }
   return (
      <button
         type="button"
         title={title}
         aria-label={title}
         disabled={disabled}
         onPointerDown={onPointerDown}
         onClick={onClick}
         className={cn(
            'flex items-center justify-center rounded p-0.5 disabled:opacity-40 disabled:cursor-default cursor-pointer',
            // Toolbar-slot actions portal into the board's app-chrome bar; the footer nav/insert buttons sit on the paper band.
            appChrome
               ? 'text-popover-foreground hover:bg-muted'
               : 'text-paper-primary-foreground/80 hover:bg-paper-primary-foreground/10 hover:text-paper-primary-foreground',
            touch && 'min-h-11 min-w-11',
         )}
      >
         {children}
      </button>
   );
}
