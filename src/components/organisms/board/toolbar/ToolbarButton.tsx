// -- Utils Imports --
import { cn } from '@/lib/utils';

/** A button in the canvas palette/view toolbar. `active` gives it a pressed-toggle state (aria-pressed + tint). */
export function ToolbarButton({ title, onClick, active, dataTutorial, children }: { title: string; onClick: () => void; active?: boolean; dataTutorial?: string; children: React.ReactNode }) {
   return (
      <button
         type="button"
         onClick={onClick}
         title={title}
         aria-label={title}
         aria-pressed={active}
         data-tutorial={dataTutorial}
         className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded text-foreground hover:bg-muted cursor-pointer',
            active && 'bg-muted ring-1 ring-primary/40',
         )}
      >
         {children}
      </button>
   );
}
