// @vitest-environment jsdom

// -- Library Imports --
import { afterEach, describe, expect, it, vi } from 'vitest';

// -- Local Imports --
import { detectFormFactor, detectPointer } from './useDeviceType';
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

afterEach(() => {
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
