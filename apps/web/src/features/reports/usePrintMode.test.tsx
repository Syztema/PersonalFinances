import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePrintMode } from './usePrintMode';

afterEach(() => vi.restoreAllMocks());

describe('usePrintMode (spec §5.3)', () => {
  it('turns print mode on before window.print and off after printing', () => {
    const { result } = renderHook(() => usePrintMode());
    const seen: boolean[] = [];
    vi.spyOn(window, 'print').mockImplementation(() => {
      seen.push(result.current.printMode);
    });
    act(() => result.current.print());
    expect(seen).toEqual([true]);
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(result.current.printMode).toBe(false);
  });

  it('follows beforeprint and afterprint, so Ctrl+P works the same', () => {
    const { result } = renderHook(() => usePrintMode());
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    expect(result.current.printMode).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(result.current.printMode).toBe(false);
  });
});
