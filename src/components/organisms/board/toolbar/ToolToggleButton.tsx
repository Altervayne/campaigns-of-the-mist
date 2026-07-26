// -- Utils Imports --
import { cn } from '@/lib/utils';

/** A sticky, pressed-state toggle in the mode segment (Elements / Drawing). Carries a text label beside its
    stable icon so the modes read distinct from the icon-only clusters below. Chrome is app tokens only. */
export function ToolToggleButton({ title, label, active, onClick, children }: { title: string; label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
   return (
      <button
         type="button"
         onClick={onClick}
         title={title}
         aria-label={title}
         aria-pressed={active}
         className={cn(
            'flex h-6 shrink-0 items-center justify-center gap-1.5 rounded px-2.5 text-sm hover:bg-muted cursor-pointer',
            active ? 'bg-muted text-foreground ring-1 ring-primary/40' : 'text-foreground',
         )}
      >
         {children}
         <span>{label}</span>
      </button>
   );
}
