import { useState, useEffect } from 'react';
import { BREAKPOINT_TABLET, BREAKPOINT_DESK, TABLET_PORTRAIT_FALLBACK } from '@/lib/breakpoints';

export type DeviceType = 'mobile' | 'desktop';

// Layout profile (width-driven); orthogonal to the binary base regime.
export type FormFactor = 'phone' | 'tablet' | 'desktop';

// Input profile (pointer-capability driven), independent of width.
export type PointerType = 'coarse' | 'fine';

interface UseDeviceTypeResult {
	deviceType: DeviceType;
	isMobile: boolean;
	isDesktop: boolean;
}

// Mobile detection based on user agent
function isMobileUserAgent(): boolean {
	if (typeof navigator === 'undefined') return false;

	const userAgent = navigator.userAgent.toLowerCase();
	const mobileKeywords = [
		'android',
		'webos',
		'iphone',
		'ipad',
		'ipod',
		'blackberry',
		'windows phone',
		'mobile'
	];

	return mobileKeywords.some(keyword => userAgent.includes(keyword));
}

// Touch capability detection
function hasTouchCapability(): boolean {
	if (typeof window === 'undefined') return false;

	return (
		'ontouchstart' in window ||
		navigator.maxTouchPoints > 0 ||
		// @ts-expect-error - msMaxTouchPoints is a legacy IE property not in TypeScript types
		navigator.msMaxTouchPoints > 0
	);
}

// Screen width detection (fallback)
function isMobileScreenWidth(): boolean {
	if (typeof window === 'undefined') return false;
	return window.innerWidth < BREAKPOINT_TABLET;
}

// Form factor from width, used only when UA gives no decisive signal.
function formFactorForWidth(): FormFactor {
	if (typeof window === 'undefined') return 'desktop';
	const width = window.innerWidth;
	if (width < BREAKPOINT_TABLET) return 'phone';
	if (width < BREAKPOINT_DESK) return 'tablet';
	return 'desktop';
}

/**
 * Detect the layout profile. UA disambiguates the cases width alone can't:
 * - iPad on iPadOS 13+ reports a `Macintosh` UA; a real Mac has `maxTouchPoints === 0`
 *   while an iPad reports 5, so touch points separate them.
 * - Android tablets omit `mobile` from the UA; phones include it.
 * - `iphone`/`ipod` are phones; `ipad` (legacy UA) is a tablet.
 * Everything else falls back to width bands.
 */
export function detectFormFactor(): FormFactor {
	if (typeof navigator === 'undefined') return formFactorForWidth();

	const userAgent = navigator.userAgent.toLowerCase();
	const maxTouchPoints = navigator.maxTouchPoints ?? 0;

	if (userAgent.includes('macintosh') && maxTouchPoints > 1) return 'tablet';
	if (userAgent.includes('android')) return userAgent.includes('mobile') ? 'phone' : 'tablet';
	if (userAgent.includes('iphone') || userAgent.includes('ipod')) return 'phone';
	if (userAgent.includes('ipad')) return 'tablet';

	return formFactorForWidth();
}

/**
 * Detect the input profile from pointer capability, catching hybrids (iPad + trackpad,
 * touchscreen laptop) that no UA rule gets right. Falls back to `hover` where
 * `pointer` is unsupported.
 */
export function detectPointer(): PointerType {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'fine';
	if (window.matchMedia('(pointer: coarse)').matches) return 'coarse';
	if (window.matchMedia('(hover: none)').matches) return 'coarse';
	return 'fine';
}

/**
 * Non-hook effective device type for code that runs outside React (e.g. the boot
 * step in `AppStartManager`/`tabManagerStore`). Pure auto-detection; only touches
 * `navigator`/`window`, so it is safe to call before first paint.
 *
 * @returns The effective device type (`'mobile'` or `'desktop'`).
 */
export function getEffectiveDeviceType(): DeviceType {
	return detectDeviceType();
}

/**
 * Non-hook effective form factor for code that runs outside React. Pure auto-detection.
 *
 * @returns The effective form factor (`'phone'`, `'tablet'`, or `'desktop'`).
 */
export function getEffectiveFormFactor(): FormFactor {
	return detectFormFactor();
}

// A width-routed tablet is the Auto base case whose base regime is chosen by width
// rather than by UA: a genuine touch tablet. Gated on a coarse primary pointer so a
// fine-pointer desktop windowed into the tablet width band (or a touchscreen laptop)
// keeps its unchanged desktop-vs-mobile base.
function isWidthRoutedTablet(): boolean {
	return detectFormFactor() === 'tablet' && detectPointer() === 'coarse';
}

// Auto-detect device type. A detected tablet routes by width: wide/landscape gets the
// adapted desktop tree, narrow portrait falls to the phone tree. Every other device
// keeps the original UA + touch + width detection unchanged.
function detectDeviceType(): DeviceType {
	if (isWidthRoutedTablet()) {
		const width = typeof window === 'undefined' ? 0 : window.innerWidth;
		return width >= TABLET_PORTRAIT_FALLBACK ? 'desktop' : 'mobile';
	}

	const isUserAgentMobile = isMobileUserAgent();
	const hasTouch = hasTouchCapability();
	const isSmallScreen = isMobileScreenWidth();

	// If user agent says mobile, it's probably mobile
	if (isUserAgentMobile) return 'mobile';

	// If touch + small screen, treat as mobile
	if (hasTouch && isSmallScreen) return 'mobile';

	// Otherwise desktop
	return 'desktop';
}

export function useDeviceType(): UseDeviceTypeResult {
	const [detectedDeviceType, setDetectedDeviceType] = useState<DeviceType>(() => detectDeviceType());

	// Re-detect on window resize (debounced). A width-routed tablet freezes its base
	// here: rotating across the portrait boundary must reflow the mounted tree, not
	// remount it (board/note edit buffers flush on unmount with no onBlur). Boot picks
	// the tablet base once; a reload re-decides by current width. Non-tablet devices
	// re-detect as before, preserving the desktop<->mobile flip + its safety net.
	useEffect(() => {
		let timeoutId: ReturnType<typeof setTimeout>;

		const handleResize = () => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => {
				if (isWidthRoutedTablet()) return;
				setDetectedDeviceType(detectDeviceType());
			}, 200);
		};

		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
			clearTimeout(timeoutId);
		};
	}, []);

	const deviceType = detectedDeviceType;

	return {
		deviceType,
		isMobile: deviceType === 'mobile',
		isDesktop: deviceType === 'desktop'
	};
}
