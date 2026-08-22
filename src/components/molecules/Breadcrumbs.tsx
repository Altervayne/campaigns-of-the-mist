// -- React Imports --
import React from 'react';

// -- Basic UI Imports --
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

// -- Icon Imports --
import { ChevronRight, MoreHorizontal } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

/** Minimal breadcrumb entry - any object carrying an id and a display name. */
interface BreadcrumbEntry {
    id: string;
    name: string;
}

interface BreadcrumbProps {
    path: BreadcrumbEntry[];
    onNavigate: (id: string | null) => void;
}



export function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
   const MAX_VISIBLE = 4;

   const renderPart = (part: BreadcrumbEntry, isLast: boolean) => (
      <span 
         className={cn(
            'cursor-pointer hover:text-foreground truncate',
            isLast ? 'font-semibold text-foreground shrink-0' : 'min-w-0'
         )}
         onClick={(e) => {
            e.stopPropagation();
            onNavigate(part.id);
         }}
         title={part.name}
      >
         {part.name}
      </span>
   );

   return (
      <div className="flex items-center text-sm text-muted-foreground min-w-0 h-6">
         {path.length <= MAX_VISIBLE ? (
            path.map((part, index) => (
               <React.Fragment key={part.id}>
                  {renderPart(part, index === path.length - 1)}
                  {index < path.length - 1 && <ChevronRight className="h-4 w-4 mx-1 shrink-0" />}
               </React.Fragment>
            ))
         ) : (
            <>
               {renderPart(path[0], false)}
               <ChevronRight className="h-4 w-4 mx-1 shrink-0" />
               
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer shrink-0 touch-target">
                        <MoreHorizontal className="h-4 w-4" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                     {path.slice(1, -1).map(part => (
                        <DropdownMenuItem key={part.id} onClick={() => onNavigate(part.id)} className="cursor-pointer">
                           {part.name}
                        </DropdownMenuItem>
                     ))}
                  </DropdownMenuContent>
               </DropdownMenu>

               <ChevronRight className="h-4 w-4 mx-1 shrink-0" />
               {renderPart(path[path.length - 1], true)}
            </>
         )}
      </div>
   );
};
