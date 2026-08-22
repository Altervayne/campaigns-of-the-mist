// -- React Imports --
import { useCallback } from 'react';

// -- Icon Imports --
import { MonitorSmartphone, Smartphone, Tablet, Monitor, type LucideIcon } from 'lucide-react';

// -- Store and Hook Imports --
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';
import { useAdaptive } from '@/hooks/useAdaptive';
import type { DeviceType, FormFactor } from '@/lib/stores/appSettingsStore';

/** The user-facing Interface choices: `auto` clears both overrides, the rest pin base + layout. */
export type InterfaceChoice = 'auto' | 'phone' | 'tablet' | 'desktop';

export const INTERFACE_CHOICES: InterfaceChoice[] = ['auto', 'phone', 'tablet', 'desktop'];

export const INTERFACE_ICONS: Record<InterfaceChoice, LucideIcon> = {
	auto: MonitorSmartphone,
	phone: Smartphone,
	tablet: Tablet,
	desktop: Monitor,
};

/**
 * A manual Interface choice pins BOTH axes so base and layout stay coherent: base stays binary (tablet
 * maps to the desktop regime), while the layout profile refines it. `auto` clears both to auto-detect.
 * Pointer capability is never touched here - it is always detected (see `detectPointer`).
 */
export function interfaceChoiceToOverrides(choice: InterfaceChoice): {
	deviceTypeOverride: DeviceType | undefined;
	formFactorOverride: FormFactor | undefined;
} {
	switch (choice) {
		case 'phone':
			return { deviceTypeOverride: 'mobile', formFactorOverride: 'phone' };
		case 'tablet':
			return { deviceTypeOverride: 'desktop', formFactorOverride: 'tablet' };
		case 'desktop':
			return { deviceTypeOverride: 'desktop', formFactorOverride: 'desktop' };
		case 'auto':
		default:
			return { deviceTypeOverride: undefined, formFactorOverride: undefined };
	}
}

export interface InterfaceSetting {
	/** The active choice, derived from the persisted layout override (`undefined` = `auto`). */
	choice: InterfaceChoice;
	/** The currently-resolved layout profile, for the `auto` hint so a wrong guess is visible. */
	resolvedFormFactor: FormFactor;
	/** Write both override axes from a choice. */
	selectInterface: (choice: InterfaceChoice) => void;
}

/** Shared Interface control state: the active choice, the resolved layout, and a coherent both-axes setter. */
export function useInterfaceSetting(): InterfaceSetting {
	const formFactorOverride = useAppSettingsStore((state) => state.formFactorOverride);
	const { setDeviceTypeOverride, setFormFactorOverride } = useAppSettingsActions();
	const { formFactor: resolvedFormFactor } = useAdaptive();

	const selectInterface = useCallback(
		(choice: InterfaceChoice) => {
			const overrides = interfaceChoiceToOverrides(choice);
			setDeviceTypeOverride(overrides.deviceTypeOverride);
			setFormFactorOverride(overrides.formFactorOverride);
		},
		[setDeviceTypeOverride, setFormFactorOverride],
	);

	return { choice: formFactorOverride ?? 'auto', resolvedFormFactor, selectInterface };
}
