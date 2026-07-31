// -- React Imports --
import type { ReactNode } from 'react';

// -- Custom Hooks --
import { useInputDebouncer } from '@/hooks/useInputDebouncer';

// -- Utils Imports --
import { cn } from '@/lib/utils';



interface MobileCharacterNameHeaderProps {
	name: string;
	onCommit: (value: string) => void;
	placeholder: string;
	/** Optional control docked on the handedness-leading edge (the workspace switcher trigger). */
	trigger?: ReactNode;
	/** Places the trigger on the leading edge: left when true, else right. */
	isLeftHanded?: boolean;
}

/**
 * Header holding the mobile character-name input. Owns its debounced buffer so the
 * edit rides the hook's unmount flush, keyed by `character.id` at the call site: a
 * character switch unmounts this header and flushes the pending name through the
 * `onCommit` captured at its last render, landing on the correct character. Mobile
 * styling differs from the shared desktop header (full-bleed bold input with a
 * primary-tinted focus state and no drawer-tour anchor).
 */
export function MobileCharacterNameHeader({ name, onCommit, placeholder, trigger, isLeftHanded = false }: MobileCharacterNameHeaderProps) {
	const [localName, setLocalName] = useInputDebouncer(name, onCommit);

	return (
		<header
			className={cn(
				"px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] bg-popover border-b border-border flex items-center gap-3",
				// The trigger docks on the leading edge; reversing the row moves it left for a left-handed layout.
				isLeftHanded && "flex-row-reverse"
			)}
		>
			<input
				type="text"
				data-tutorial="character-name-input"
				value={localName}
				onChange={(e) => setLocalName(e.target.value)}
				className={cn(
					"flex-1 text-2xl font-bold bg-transparent outline-none transition-colors",
					"placeholder:text-muted-foreground/50",
					"focus:text-primary"
				)}
				placeholder={placeholder}
			/>
			{trigger}
		</header>
	);
}
