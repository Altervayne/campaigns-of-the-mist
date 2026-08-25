// -- React Imports --
import React from 'react';

// -- Basic UI Imports --
import { IconButton } from '@/components/ui/icon-button';
import type { IconButtonProps } from '@/components/ui/icon-button';

// -- Utils Imports --
import { cn } from '@/lib/utils';



// Define the props for our new component
interface SidebarButtonProps extends Omit<IconButtonProps, 'children'> {
  isCollapsed: boolean;
  Icon: React.ElementType;
  children: React.ReactNode;
}

export function SidebarButton({ isCollapsed, Icon, children, ...props }: SidebarButtonProps) {
  const buttonText = typeof children === 'string' ? children : '';

  return (
     <IconButton
         title={buttonText}
         className={cn(
            // `h-auto min-h-10 py-2` lets a wrapped label grow the row past the square minimum; `overflow-hidden`
            // clips the width collapse. The width morph + color transitions are driven inline (below) so the
            // width can carry the directional delay without lagging the hover/colour transition.
            "flex h-auto min-h-10 cursor-pointer overflow-hidden py-2",
            isCollapsed ? "w-10 px-2 justify-center" : "w-56 px-2.5 justify-start min-w-0"
         )}
         style={{
            // WIDTH group: the width morph leads on EXPAND (delay 0) but waits for the height to collapse
            // first on COLLAPSE (delay 200ms). Colours never wait, so a collapsed button's hover stays snappy.
            transitionProperty: 'width, background-color, color',
            transitionDuration: '200ms',
            transitionTimingFunction: 'ease-in-out',
            transitionDelay: isCollapsed ? '200ms, 0ms, 0ms' : '0ms',
         }}
         {...props}
      >

         <Icon
         className={cn(
            "shrink-0 transition-all h-5 w-5",
            !isCollapsed && "mr-1"
         )}
         />

         {/* Phased label reveal, all CSS, mirrored by direction. WIDTH group = the wrapper's width/margin/
             opacity (the horizontal reveal); HEIGHT = its grid-rows 0fr<->1fr (one line <-> full wrap).
             EXPAND: width reveals now, height grows only after the rail is open (height delay 300ms).
             COLLAPSE: height shrinks to one line first, then width/margin/opacity close (delay 200ms) - so
             the label never reflows taller as the rail narrows. grid-rows interpolates the REAL rendered
             height (no measurement), so it can't overshoot. `w-[168px]` is the label width (the `w-56` button
             minus `px-4`*2, the icon, and the gap); it collapses to `w-0` so `justify-center` re-centers the
             icon. Keep 168 in sync with `w-56`. */}
         <div
            className={cn(
               'grid overflow-hidden ease-in-out',
               isCollapsed ? 'grid-rows-[0fr] w-0 ml-0 opacity-0' : 'grid-rows-[1fr] w-[168px] ml-2 opacity-100',
            )}
            style={{
               transitionProperty: 'grid-template-rows, width, margin-left, opacity',
               transitionDuration: '200ms',
               transitionTimingFunction: 'ease-in-out',
               // Order matches transitionProperty. EXPAND: height waits 300ms (the rail's open slide), the
               // WIDTH group runs now. COLLAPSE: height runs now, the WIDTH group waits 200ms (the height
               // collapse) so the rail only narrows once the buttons are back to one line.
               transitionDelay: isCollapsed ? '0ms, 200ms, 200ms, 200ms' : '300ms, 0ms, 0ms, 0ms',
            }}
         >
            {/* `min-h-[1lh]` floors the grid track at one line, so a single line of the label shows through
                both slides (never an empty button); `overflow-hidden` clips the rest until the height grows. */}
            <span className="min-h-[1lh] overflow-hidden block whitespace-normal break-words text-left leading-snug">
               {children}
            </span>
         </div>
      </IconButton>
  );
}
