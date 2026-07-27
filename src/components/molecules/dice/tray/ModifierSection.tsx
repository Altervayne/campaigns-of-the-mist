// -- React Imports --
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

// -- Icon Imports --
import { Plus } from 'lucide-react';

// -- Utils Imports --
import { cn } from '@/lib/utils';
import { signed } from '@/lib/dice/diceFormat';

// -- Component Imports --
import { ModifierRow } from './ModifierRow';

// -- Type Imports --
import type { DiceTrayModifier } from '@/lib/dice/diceTrayTypes';

/** Modifiers: a labeled list, each row one undoable change. */
export function ModifierSection({ modifiers, modifierTotal, isMobile, stopDrag, onAddModifier, onRemoveModifier, onChangeValue, onChangeLabel }: {
   modifiers: DiceTrayModifier[];
   modifierTotal: number;
   isMobile: boolean;
   stopDrag: (event: ReactPointerEvent) => void;
   onAddModifier: () => void;
   onRemoveModifier: (id: string) => void;
   onChangeValue: (id: string, value: number) => void;
   onChangeLabel: (id: string, label: string) => void;
}) {
   const { t } = useTranslation();

   return (
      <div className="border-t border-border p-2">
         <div className="mb-1 flex items-center justify-between px-0.5">
            <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{t('BoardView.diceModifiers')}</span>
            {modifiers.length > 0 && <span className="font-mono text-xs tabular-nums text-muted-foreground">{signed(modifierTotal)}</span>}
         </div>
         <div className="flex flex-col gap-1">
            {modifiers.map((modifier) => (
               <ModifierRow
                  key={modifier.id}
                  modifier={modifier}
                  placeholder={t('BoardView.diceModifierPlaceholder')}
                  removeLabel={t('BoardView.diceRemoveModifier')}
                  stopDrag={stopDrag}
                  onChangeValue={(value) => onChangeValue(modifier.id, value)}
                  onChangeLabel={(label) => onChangeLabel(modifier.id, label)}
                  onRemove={() => onRemoveModifier(modifier.id)}
                  isMobile={isMobile}
               />
            ))}
            <button
               type="button"
               onPointerDown={stopDrag}
               onClick={onAddModifier}
               className={cn(
                  'flex items-center justify-center gap-1 rounded border border-dashed border-border py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground cursor-pointer',
                  isMobile && 'py-2.5 text-sm',
               )}
            >
               <Plus className={isMobile ? 'h-4 w-4' : 'h-3 w-3'} />
               {t('BoardView.diceAddModifier')}
            </button>
         </div>
      </div>
   );
}
