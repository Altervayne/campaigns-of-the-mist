// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

// -- Local Imports --
import { detectFormFactor, detectPointer, getEffectiveDeviceType, useDeviceType } from './useDeviceType';
import { BREAKPOINT_TABLET, BREAKPOINT_DESK, TABLET_PORTRAIT_FALLBACK } from '@/lib/breakpoints';

/*
 * The additive detection matrix: form factor from UA (with the iPad-as-Mac and Android
 * tablet/phone tells) falling back to width bands, and pointer profile from media queries.
 * The live matchMedia/orientation wiring lives in useAdaptive (browser-only).
 */

function stubNavigator(userAgent: string, maxTouchPoints = 0): void {
	vi.stubGlobal('navigator', { userAgent, maxTouchPoints });
}

function setWidth(width: number): void {
	Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
}

function stubMatchMedia(matching: Record<string, boolean>): void {
	window.matchMedia = ((query: string) => ({
		matches: matching[query] ?? false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {},
	})) as unknown as typeof window.matchMedia;
}

const GENERIC_DESKTOP_UA = 'mozilla/5.0 (windows nt 10.0; win64; x64)';
const ANDROID_TABLET_UA = 'mozilla/5.0 (linux; android 13; sm-x700)';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('detectFormFactor', () => {
	it('reads an iPad reporting a Macintosh UA as a tablet via touch points', () => {
		stubNavigator('mozilla/5.0 (macintosh; intel mac os x 10_15_7)', 5);
		expect(detectFormFactor()).toBe('tablet');
	});

	it('does not mistake a real Mac (no touch) for a tablet', () => {
		stubNavigator('mozilla/5.0 (macintosh; intel mac os x 10_15_7)', 0);
		setWidth(1440);
		expect(detectFormFactor()).toBe('desktop');
	});

	it('splits Android tablet from Android phone on the mobile token', () => {
		stubNavigator('mozilla/5.0 (linux; android 13; sm-x700)');
		expect(detectFormFactor()).toBe('tablet');

		stubNavigator('mozilla/5.0 (linux; android 13; pixel 7 mobile)');
		expect(detectFormFactor()).toBe('phone');
	});

	it('reads an iPhone as a phone and a legacy iPad UA as a tablet', () => {
		stubNavigator('mozilla/5.0 (iphone; cpu iphone os 17_0)');
		expect(detectFormFactor()).toBe('phone');

		stubNavigator('mozilla/5.0 (ipad; cpu os 12_0)');
		expect(detectFormFactor()).toBe('tablet');
	});

	it('falls back to width bands with no decisive UA signal', () => {
		stubNavigator(GENERIC_DESKTOP_UA);

		setWidth(BREAKPOINT_TABLET - 1);
		expect(detectFormFactor()).toBe('phone');

		setWidth(BREAKPOINT_TABLET);
		expect(detectFormFactor()).toBe('tablet');

		setWidth(BREAKPOINT_DESK - 1);
		expect(detectFormFactor()).toBe('tablet');

		setWidth(BREAKPOINT_DESK);
		expect(detectFormFactor()).toBe('desktop');
	});
});

describe('detectPointer', () => {
	it('reports coarse when the pointer media query matches', () => {
		stubMatchMedia({ '(pointer: coarse)': true });
		expect(detectPointer()).toBe('coarse');
	});

	it('falls back to the hover query when pointer is unsupported', () => {
		stubMatchMedia({ '(pointer: coarse)': false, '(hover: none)': true });
		expect(detectPointer()).toBe('coarse');
	});

	it('reports fine when neither query matches', () => {
		stubMatchMedia({ '(pointer: coarse)': false, '(hover: none)': false });
		expect(detectPointer()).toBe('fine');
	});
});

describe('breakpoint constants', () => {
	it('pins the canonical pixel values', () => {
		expect(BREAKPOINT_TABLET).toBe(768);
		expect(BREAKPOINT_DESK).toBe(1024);
		expect(TABLET_PORTRAIT_FALLBACK).toBe(820);
	});
});

// Auto base routing (no override): a detected coarse tablet routes by width around the
// portrait fallback; every non-tablet device keeps the original 2.0 detection.
describe('base routing for a detected tablet', () => {
	function coarseTablet(userAgent: string, width: number): void {
		stubNavigator(userAgent, 5);
		stubMatchMedia({ '(pointer: coarse)': true });
		setWidth(width);
	}

	it('routes a wide coarse tablet to the desktop base', () => {
		coarseTablet(ANDROID_TABLET_UA, TABLET_PORTRAIT_FALLBACK);
		expect(getEffectiveDeviceType()).toBe('desktop');
	});

	it('routes a narrow-portrait coarse tablet to the mobile base', () => {
		coarseTablet(ANDROID_TABLET_UA, TABLET_PORTRAIT_FALLBACK - 1);
		expect(getEffectiveDeviceType()).toBe('mobile');
	});

	it('routes an iPad (Macintosh UA) by width on both sides of the fallback', () => {
		const iPadUA = 'mozilla/5.0 (macintosh; intel mac os x 10_15_7)';
		coarseTablet(iPadUA, 1024);
		expect(getEffectiveDeviceType()).toBe('desktop');

		coarseTablet(iPadUA, 800);
		expect(getEffectiveDeviceType()).toBe('mobile');
	});

	it('leaves a fine-pointer desktop windowed into the tablet band on the desktop base', () => {
		// Width alone reads as the tablet band, but a fine pointer means this is a real
		// desktop, not a tablet: the base must stay desktop, unchanged from 2.0.
		stubNavigator(GENERIC_DESKTOP_UA, 0);
		stubMatchMedia({ '(pointer: coarse)': false, '(hover: none)': false });
		setWidth(800);
		expect(getEffectiveDeviceType()).toBe('desktop');
	});

	it('keeps phones on the mobile base regardless of width', () => {
		stubNavigator('mozilla/5.0 (iphone; cpu iphone os 17_0)', 5);
		stubMatchMedia({ '(pointer: coarse)': true });
		setWidth(900);
		expect(getEffectiveDeviceType()).toBe('mobile');

		stubNavigator('mozilla/5.0 (linux; android 13; pixel 7 mobile)', 5);
		expect(getEffectiveDeviceType()).toBe('mobile');
	});
});

// The live hook freezes a tablet's base so a rotation across the portrait fallback
// reflows the mounted tree instead of remounting it; non-tablet devices still re-detect.
describe('useDeviceType tablet base freeze', () => {
	function resizeTo(width: number): void {
		act(() => {
			setWidth(width);
			window.dispatchEvent(new Event('resize'));
		});
		act(() => {
			vi.advanceTimersByTime(200);
		});
	}

	it('does not re-flip a coarse tablet rotated below the fallback', () => {
		vi.useFakeTimers();
		stubNavigator(ANDROID_TABLET_UA, 5);
		stubMatchMedia({ '(pointer: coarse)': true });
		setWidth(1000);

		const { result } = renderHook(() => useDeviceType());
		expect(result.current.isDesktop).toBe(true);

		resizeTo(800);

		// The pure decision would flip to mobile at this width; the live hook stays frozen.
		expect(getEffectiveDeviceType()).toBe('mobile');
		expect(result.current.isDesktop).toBe(true);
		expect(result.current.isMobile).toBe(false);
	});

	it('still re-detects a non-tablet device across the 768 boundary', () => {
		vi.useFakeTimers();
		stubNavigator(GENERIC_DESKTOP_UA, 1);
		stubMatchMedia({ '(pointer: coarse)': false, '(hover: none)': false });
		setWidth(700);

		const { result } = renderHook(() => useDeviceType());
		expect(result.current.isMobile).toBe(true);

		resizeTo(900);
		expect(result.current.isDesktop).toBe(true);
	});
});
