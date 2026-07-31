// -- React Imports --
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import toast from 'react-hot-toast';

// -- Store Imports --
import { useAppSettingsStore, useAppSettingsActions } from '@/lib/stores/appSettingsStore';



/**
 * Fires the mobile drawer's one-time long-press hint from the drawer's mount.
 *
 * Takes nothing and returns nothing: the toast and the seen-flag write are the
 * whole effect. The guard order and the live store read are load-bearing and are
 * documented inline.
 */
export function useDrawerLongPressHint() {
	const { t } = useTranslation();

	// One-time long-press hint: shown once when gesture tips are enabled, then
	// remembered so it never repeats. Gated on the setting (never shown when off).
	// The overflow (...) button on each row is the always-present fallback.
	const areGestureHintsEnabled = useAppSettingsStore((state) => state.areGestureHintsEnabled);
	const hasSeenDrawerMenuHint = useAppSettingsStore((state) => state.hasSeenDrawerMenuHint);
	const { setHasSeenDrawerMenuHint } = useAppSettingsActions();

	useEffect(() => {
		// StrictMode invokes effect setup twice synchronously; both invocations
		// would see the same committed `hasSeenDrawerMenuHint = false` closure and
		// toast twice. Re-read the store live, and set the flag before toasting so
		// the second invoke's live read is already `true`.
		if (!areGestureHintsEnabled) return;
		if (useAppSettingsStore.getState().hasSeenDrawerMenuHint) return;
		setHasSeenDrawerMenuHint(true);
		toast(t('MobileGestureHints.drawerLongPress'));
	}, [areGestureHintsEnabled, hasSeenDrawerMenuHint, setHasSeenDrawerMenuHint, t]);
}
