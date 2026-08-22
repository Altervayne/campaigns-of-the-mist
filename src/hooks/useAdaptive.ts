import { useState, useEffect } from 'react';
import {
	useDeviceType,
	detectFormFactor,
	detectPointer,
	type DeviceType,
	type FormFactor,
	type PointerType,
} from './useDeviceType';
import { BREAKPOINT_TABLET, BREAKPOINT_DESK } from '@/lib/breakpoints';

/**
 * The two orthogonal adaptive axes plus the raw width, layered on top of the
 * unchanged binary base. `base` is the render/behavioral regime (drives the
 * WorkspacePage shell + boot); `formFactor`/`pointer` are additive refinements
 * tablet-aware surfaces opt into.
 */
export interface AdaptiveState {
	base: DeviceType;
	formFactor: FormFactor;
	pointer: PointerType;
	width: number;
}

interface AdaptiveAxes {
	formFactor: FormFactor;
	pointer: PointerType;
	width: number;
}

function readAxes(): AdaptiveAxes {
	return {
		formFactor: detectFormFactor(),
		pointer: detectPointer(),
		width: typeof window === 'undefined' ? 0 : window.innerWidth,
	};
}

/**
 * Adaptive device state. `base` comes straight from `useDeviceType()`, so base
 * behavior is identical to every existing consumer. The `formFactor`/`pointer`
 * axes recompute on `matchMedia` boundary crossings and `orientationchange` -
 * media-query events, not a resize debounce, so a rotate reflows without lag.
 */
export function useAdaptive(): AdaptiveState {
	const { deviceType: base } = useDeviceType();
	const [axes, setAxes] = useState<AdaptiveAxes>(() => readAxes());

	useEffect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

		const recompute = () => setAxes(readAxes());

		const queries = [
			window.matchMedia(`(min-width: ${BREAKPOINT_TABLET}px)`),
			window.matchMedia(`(min-width: ${BREAKPOINT_DESK}px)`),
			window.matchMedia('(pointer: coarse)'),
		];
		queries.forEach((query) => query.addEventListener('change', recompute));
		window.addEventListener('orientationchange', recompute);

		// Sync once, in case a boundary shifted between the initial render and this effect.
		recompute();

		return () => {
			queries.forEach((query) => query.removeEventListener('change', recompute));
			window.removeEventListener('orientationchange', recompute);
		};
	}, []);

	return { base, ...axes };
}

export interface BreakpointState {
	tier: FormFactor;
	isCoarse: boolean;
}

/** Thin view over `useAdaptive` for callers that only need the layout tier + touch flag. */
export function useBreakpoint(): BreakpointState {
	const { formFactor, pointer } = useAdaptive();
	return { tier: formFactor, isCoarse: pointer === 'coarse' };
}
