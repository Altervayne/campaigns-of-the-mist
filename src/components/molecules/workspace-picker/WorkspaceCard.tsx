// -- React Imports --
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

/*
 * A premium workspace-type card for the desktop tab picker: a full-bleed vignette (a little window into that
 * workspace) with the icon and label riding on top. Each type feeds its own `vignette` node and a signature
 * hover micro-animation; the shell owns the frame, a faint accent wash, the chips, and the accent.
 * `accentRgb` is a space-separated RGB triple, exposed as `--accent` so the vignette and chrome can tint from
 * one source. Chrome stays on theme tokens; the accent + vignette art are the intentional content exceptions.
 */

interface WorkspaceCardProps {
   /** Space-separated RGB triple (e.g. `16 185 129`) driving `--accent`. */
   accentRgb: string;
   /** The type glyph, rendered in the top-left chip; inherits the accent via `currentColor`. */
   icon: ReactNode;
   /** Card title (already translated). */
   title: string;
   /** Card subtitle (already translated). */
   subtitle: string;
   /** Activation handler (create-or-open; the picker dismisses on it). */
   onClick: () => void;
   /** The full-bleed art layer for this type, tinted from `--accent` via `currentColor`. */
   vignette: ReactNode;
   /** Extra root props (the PDF card spreads its native drag handlers here). */
   rootProps?: ButtonHTMLAttributes<HTMLButtonElement>;
   /** Nodes rendered inside the root but outside the layout (the PDF card's hidden file input). */
   children?: ReactNode;
}

export function WorkspaceCard({ accentRgb, icon, title, subtitle, onClick, vignette, rootProps, children }: WorkspaceCardProps) {
   return (
      <button
         type="button"
         onClick={onClick}
         {...rootProps}
         style={{ '--accent': accentRgb } as CSSProperties}
         className={cn(
            'group relative flex h-56 w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card text-left',
            'transition-[box-shadow,border-color] duration-300 hover:border-[rgb(var(--accent)_/_0.6)] hover:shadow-lg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
         )}
      >
         {/* Static accent wash blooming from the top-left corner over the card base. */}
         <span
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(120% 100% at 0% 0%, rgb(var(--accent) / 0.1), transparent 60%)' }}
         />

         {/* The type's full-bleed vignette art. */}
         <span className="absolute inset-0" style={{ color: 'rgb(var(--accent))' }}>
            {vignette}
         </span>

         {/* Icon top-left, label pill bottom. Solid accent chip so the glyph stays legible on any accent; the
             label stays a frosted light pill (soft scrim + a hair of blur, not a glass slab). */}
         <span className="relative z-10 flex h-full flex-col items-start justify-between p-3.5">
            <span
               className="rounded-lg border border-white/15 p-2.5 text-white shadow-sm"
               style={{ backgroundColor: 'rgb(var(--accent))', backgroundImage: 'linear-gradient(rgba(0,0,0,0.14), rgba(0,0,0,0.02))' }}
            >
               {icon}
            </span>
            <span className="max-w-full rounded-lg border border-border/50 bg-background/90 px-3 py-2 backdrop-blur-[2px]">
               <span className="block text-base font-semibold text-foreground">{title}</span>
               <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
            </span>
         </span>

         {children}
      </button>
   );
}
