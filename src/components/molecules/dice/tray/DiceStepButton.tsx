// -- React Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

export function StepButton({ onClick, onPointerDown, children, isMobile = false }: { onClick: () => void; onPointerDown: (event: ReactPointerEvent) => void; children: React.ReactNode; isMobile?: boolean }) {
   return (
      <button
         type="button"
         onPointerDown={onPointerDown}
         onClick={onClick}
         className={cn('flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer', isMobile && 'h-8 w-8')}
      >
         {children}
      </button>
   );
}
