// -- React Imports --
import { useTranslation } from 'react-i18next';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { ConnectionPathType } from '@/lib/types/board';

/*
 * The routing-mode control (the Path popover's content): four buttons (straight / orthogonal /
 * circle / bezier), each a tiny inline preview of its shape, the active one ring-highlighted. A click
 * commits the new `pathType` as one style update.
 */

/** The path types, in toolbar order, paired with their label i18n keys. */
const PATH_TYPES: { type: ConnectionPathType; labelKey: string }[] = [
   { type: 'straight', labelKey: 'BoardView.connectionPathStraight' },
   { type: 'orthogonal', labelKey: 'BoardView.connectionPathOrthogonal' },
   { type: 'circle', labelKey: 'BoardView.connectionPathCircle' },
   { type: 'bezier', labelKey: 'BoardView.connectionPathBezier' },
];

export function ConnectionPathTypePicker({ pathType, onChange }: { pathType: ConnectionPathType; onChange: (type: ConnectionPathType) => void }) {
   const { t } = useTranslation();
   return (
      <div className="flex items-center gap-1" title={t('BoardView.connectionPathType')}>
         {PATH_TYPES.map(({ type, labelKey }) => (
            <button
               key={type}
               type="button"
               aria-label={t(labelKey)}
               onClick={() => onChange(type)}
               className={cn(
                  'flex h-6 w-6 items-center justify-center rounded text-foreground hover:bg-muted cursor-pointer',
                  pathType === type && 'bg-muted ring-1 ring-primary',
               )}
            >
               <PathTypePreview type={type} />
            </button>
         ))}
      </div>
   );
}

/** A tiny glyph of a routing mode, for the toolbar buttons (uses the button's color). */
export function PathTypePreview({ type }: { type: ConnectionPathType }) {
   return (
      <svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
         {type === 'straight' && <line x1="2" y1="6" x2="16" y2="6" />}
         {type === 'orthogonal' && <polyline points="2,10 9,10 9,2 16,2" />}
         {type === 'circle' && <path d="M2 10 Q9 0 16 10" />}
         {type === 'bezier' && <path d="M2 10 C6 2 12 10 16 2" />}
      </svg>
   );
}
