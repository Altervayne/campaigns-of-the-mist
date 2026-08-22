// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { X } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Constants --
import { LEGENDS_CHALLENGE_TYPES } from '@/lib/constants/challengeCard';

/*
 * The Challenge Card's type multi-select: the suggested toggles + removable custom-type chips + a
 * free-entry add row, shared by the editor dialog and the expanded board sheet so both drive one
 * implementation. Each host skins it via `variant`: the dialog wears chrome tokens (primary/border),
 * the sheet wears card-palette tokens (card-accent/card-border) so a chrome toggle never lands foreign
 * on the parchment. Selection state is fully controlled - the host owns `types` and applies `onChange`.
 */

type ChallengeTypeSelectorVariant = 'chrome' | 'card';

/** The token classes each host paints the control with, keyed by variant. */
const VARIANT_SKINS: Record<ChallengeTypeSelectorVariant, {
   selected: string;
   unselected: string;
   chip: string;
   input: string;
   addButton: string;
}> = {
   chrome: {
      selected: 'border-primary bg-primary text-primary-foreground',
      unselected: 'border-border hover:border-foreground',
      chip: 'border-primary bg-primary text-primary-foreground',
      input: 'h-8 w-full min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      addButton: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
   },
   card: {
      selected: 'border-card-accent bg-card-accent text-card-paper-bg',
      unselected: 'border-card-border/40 text-card-paper-fg hover:border-card-paper-fg',
      chip: 'border-card-accent bg-card-accent text-card-paper-bg',
      input: 'h-8 w-full min-w-0 flex-1 rounded-md border-0 bg-card-popover-bg/40 px-2 py-1 text-sm text-card-paper-fg shadow-none placeholder:text-card-paper-fg/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-card-accent/50',
      addButton: 'border border-card-border/40 text-card-paper-fg/80 hover:bg-card-paper-fg/10',
   },
};

interface ChallengeTypeSelectorProps {
   types: string[];
   onChange: (types: string[]) => void;
   /** Which token skin to wear: `chrome` for the dialog, `card` for the parchment sheet. */
   variant: ChallengeTypeSelectorVariant;
   className?: string;
}

export function ChallengeTypeSelector({ types, onChange, variant, className }: ChallengeTypeSelectorProps) {
   const { t } = useTranslation();
   const [customType, setCustomType] = useState('');
   const skin = VARIANT_SKINS[variant];

   const toggleType = (type: string) =>
      onChange(types.includes(type) ? types.filter((entry) => entry !== type) : [...types, type]);

   const addCustomType = () => {
      const trimmed = customType.trim();
      if (trimmed && !types.includes(trimmed)) onChange([...types, trimmed]);
      setCustomType('');
   };

   // Custom types are those the user added beyond the suggested list; shown as removable chips.
   const customTypes = types.filter((type) => !LEGENDS_CHALLENGE_TYPES.includes(type as (typeof LEGENDS_CHALLENGE_TYPES)[number]));

   return (
      <div className={className}>
         <div className="flex flex-wrap gap-1.5">
            {LEGENDS_CHALLENGE_TYPES.map((type) => (
               <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={cn(
                     'rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors',
                     types.includes(type) ? skin.selected : skin.unselected,
                  )}
               >
                  {type}
               </button>
            ))}
         </div>
         {customTypes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
               {customTypes.map((type) => (
                  <span key={type} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium', skin.chip)}>
                     {type}
                     {/* Touch: pad the bare X into a real target. Negative margin absorbs the growth back into
                         the chip's own padding, so the chip barely widens (the editor dialog has the room anyway). */}
                     <button type="button" onClick={() => toggleType(type)} className="cursor-pointer rounded-full coarse:-m-1 coarse:p-2" aria-label={t('ChallengeCard.editor.removeType')}><X className="h-3 w-3" /></button>
                  </span>
               ))}
            </div>
         )}
         <div className="mt-2 flex items-center gap-2">
            <input
               value={customType}
               onChange={(event) => setCustomType(event.target.value)}
               onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustomType(); } }}
               placeholder={t('ChallengeCard.editor.customTypePlaceholder')}
               className={skin.input}
            />
            <button
               type="button"
               onClick={addCustomType}
               className={cn('shrink-0 rounded-md px-3 py-1 text-sm font-medium cursor-pointer transition-colors', skin.addButton)}
            >
               {t('ChallengeCard.editor.addType')}
            </button>
         </div>
      </div>
   );
}
