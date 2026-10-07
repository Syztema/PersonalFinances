import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY } from './theme';
import { clearUserLocalData } from './storage';

afterEach(() => vi.restoreAllMocks());

describe('clearUserLocalData (final review M7)', () => {
  it('removes the remembered source and category use but keeps the theme', () => {
    localStorage.setItem('fz:lastSource', '{}');
    localStorage.setItem('fz:categoryUse', '{}');
    localStorage.setItem(THEME_KEY, 'DARK');
    clearUserLocalData();
    expect(localStorage.getItem('fz:lastSource')).toBeNull();
    expect(localStorage.getItem('fz:categoryUse')).toBeNull();
    expect(localStorage.getItem(THEME_KEY)).toBe('DARK');
  });

  it('does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => clearUserLocalData()).not.toThrow();
  });
});
