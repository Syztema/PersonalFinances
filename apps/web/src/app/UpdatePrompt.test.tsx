import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadPage } from '../lib/reload';
import { resetSwStub, swStub } from '../test/pwaRegisterStub';
import { UpdatePrompt } from './UpdatePrompt';

vi.mock('../lib/reload', () => ({ reloadPage: vi.fn() }));

beforeEach(() => {
  resetSwStub();
  vi.mocked(reloadPage).mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('UpdatePrompt (spec §6)', () => {
  it('stays hidden while there is no new version', () => {
    render(<UpdatePrompt />);
    expect(screen.queryByText('Nueva versión disponible')).not.toBeInTheDocument();
  });

  it('activates the new version only when "Actualizar" is tapped, then reloads', async () => {
    resetSwStub({ needRefresh: true });
    render(<UpdatePrompt />);
    expect(screen.getByRole('status')).toHaveTextContent('Nueva versión disponible');
    expect(swStub.updateCalls).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(swStub.updateCalls).toEqual([true]);
    act(() => swStub.options?.onNeedReload?.());
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('never reloads by itself, even when another tab activates the new version (review focus #4)', async () => {
    resetSwStub({ needRefresh: true });
    render(<UpdatePrompt />);
    act(() => swStub.options?.onNeedReload?.());
    expect(reloadPage).not.toHaveBeenCalled();
    expect(screen.getByText('Nueva versión disponible')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(swStub.updateCalls).toEqual([]);
  });

  it('looks for a new version when the app becomes visible again', () => {
    render(<UpdatePrompt />);
    const update = vi.fn(async () => undefined);
    swStub.options?.onRegisteredSW?.('/sw.js', { update } as unknown as ServiceWorkerRegistration);
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(1);
  });
});
