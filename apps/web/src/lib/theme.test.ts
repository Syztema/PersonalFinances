import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import initScript from '../../public/theme-init.js?raw';
import { applyTheme, storedTheme, THEME_KEY, useThemeSync } from './theme';

const html = document.documentElement;
const themeColor = () =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

beforeEach(() => {
  localStorage.clear();
  html.classList.remove('dark');
  document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
});
afterEach(() => vi.unstubAllGlobals());

describe('theme', () => {
  it('is dark by default', () => {
    expect(storedTheme()).toBe('DARK');
  });

  it('applies the class, the browser color and remembers the choice', () => {
    applyTheme('LIGHT');
    expect(html.classList.contains('dark')).toBe(false);
    expect(themeColor()).toBe('#f5f6f8');
    expect(localStorage.getItem(THEME_KEY)).toBe('LIGHT');
    applyTheme('DARK');
    expect(html.classList.contains('dark')).toBe(true);
    expect(themeColor()).toBe('#0b1016');
  });

  it('removes the dark class when the system prefers light and the theme is SYSTEM', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    html.classList.add('dark');
    applyTheme('SYSTEM');
    expect(html.classList.contains('dark')).toBe(false);
  });

  it('adds the dark class when the system prefers dark and the theme is SYSTEM', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }));
    applyTheme('SYSTEM');
    expect(html.classList.contains('dark')).toBe(true);
  });
});

describe('useThemeSync', () => {
  it('re-applies the theme when the user changes it', () => {
    const { rerender } = renderHook(({ theme }) => useThemeSync(theme), {
      initialProps: { theme: 'DARK' as 'DARK' | 'LIGHT' },
    });
    expect(html.classList.contains('dark')).toBe(true);
    rerender({ theme: 'LIGHT' });
    expect(html.classList.contains('dark')).toBe(false);
  });

  function stubSystem() {
    const state = { matches: false, listener: () => {}, remove: vi.fn() };
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return state.matches;
      },
      addEventListener: (_: string, fn: () => void) => {
        state.listener = fn;
      },
      removeEventListener: state.remove,
    }));
    return state;
  }

  it('follows system changes while the theme is SYSTEM', () => {
    const system = stubSystem();
    renderHook(() => useThemeSync('SYSTEM'));
    expect(html.classList.contains('dark')).toBe(false);
    system.matches = true;
    system.listener();
    expect(html.classList.contains('dark')).toBe(true);
    system.matches = false;
    system.listener();
    expect(html.classList.contains('dark')).toBe(false);
  });

  it('stops listening to the system when unmounted', () => {
    const system = stubSystem();
    const { unmount } = renderHook(() => useThemeSync('SYSTEM'));
    expect(system.remove).not.toHaveBeenCalled();
    unmount();
    expect(system.remove).toHaveBeenCalledTimes(1);
  });

  it('stops listening to the system when the theme changes to a fixed one', () => {
    const system = stubSystem();
    const { rerender } = renderHook(({ theme }) => useThemeSync(theme), {
      initialProps: { theme: 'SYSTEM' as 'SYSTEM' | 'LIGHT' },
    });
    rerender({ theme: 'LIGHT' });
    expect(system.remove).toHaveBeenCalledTimes(1);
  });
});

describe('theme-init.js (review focus #2)', () => {
  it('applies the stored light theme before the app loads', () => {
    localStorage.setItem(THEME_KEY, 'LIGHT');
    html.classList.add('dark');
    new Function(initScript)();
    expect(html.classList.contains('dark')).toBe(false);
    expect(themeColor()).toBe('#f5f6f8');
  });

  it('falls back to dark when storage is not available', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('bloqueado');
      },
    });
    new Function(initScript)();
    expect(html.classList.contains('dark')).toBe(true);
  });

  it('is dark when there is no stored preference', () => {
    new Function(initScript)();
    expect(html.classList.contains('dark')).toBe(true);
    expect(themeColor()).toBe('#0b1016');
  });

  it('is dark when the stored value is not a known theme', () => {
    localStorage.setItem(THEME_KEY, 'foo');
    new Function(initScript)();
    expect(html.classList.contains('dark')).toBe(true);
  });
});
