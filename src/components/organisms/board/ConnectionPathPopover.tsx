// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Component Imports --
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ConnectionPathTypePicker, PathTypePreview } from './ConnectionPathTypePicker';

// -- Utils Imports --
import { CONNECTION_TRIGGER_CLASS } from './connectionToolbarButton';

// -- Type Imports --
import type { ConnectionPathType } from '@/lib/types/board';

/*
 * The Path group in the connection toolbar: a trigger showing the current routing glyph, opening a
 * popover with the four path types. A pick commits `pathType` as one style update.
 */
export function ConnectionPathPopover({ pathType, onChange }: { pathType: ConnectionPathType; onChange: (type: ConnectionPathType) => void }) {
   const { t } = useTranslation();
   return (
      <Popover>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={t('BoardView.connectionPathType')}
               aria-label={t('BoardView.connectionPathType')}
               onPointerDown={(event) => event.stopPropagation()}
               className={CONNECTION_TRIGGER_CLASS}
            >
               <PathTypePreview type={pathType} />
            </button>
         </PopoverTrigger>
         {/* Stop the pointer or the canvas background handler reads it as a click-away and drops the selection. */}
         <PopoverContent align="center" className="w-auto p-1" onPointerDown={(event) => event.stopPropagation()}>
            <ConnectionPathTypePicker pathType={pathType} onChange={onChange} />
         </PopoverContent>
      </Popover>
   );
}
