import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { captureInstallPrompt } from '../../lib/installPrompt';
import { InstallCard } from './InstallCard';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

function fireInstallPrompt() {
  const prompt = vi.fn(async () => undefined);
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return { event, prompt };
}

function runAsInstalledApp() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(display-mode: standalone)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeAll(() => captureInstallPrompt());
afterEach(() => {
  // `appinstalled` olvida el evento guardado: cada test empieza sin él.
  act(() => {
    window.dispatchEvent(new Event('appinstalled'));
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('InstallCard (spec §6)', () => {
  it('shows nothing until the browser offers the installation', () => {
    render(<InstallCard />);
    expect(screen.queryByText('Instalar la app')).not.toBeInTheDocument();
  });

  it('offers "Instalar Finanzas" and opens the browser prompt once', async () => {
    render(<InstallCard />);
    const { event, prompt } = fireInstallPrompt();
    expect(event.defaultPrevented).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Instalar Finanzas' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Instalar Finanzas' })).not.toBeInTheDocument();
  });

  it('explains how to add it on an iPhone with Safari', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI);
    render(<InstallCard />);
    expect(screen.getByText('En Safari: Compartir → Agregar a inicio')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Instalar Finanzas' })).not.toBeInTheDocument();
  });

  it('shows nothing when it already runs as an installed app', () => {
    runAsInstalledApp();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI);
    render(<InstallCard />);
    fireInstallPrompt();
    expect(screen.queryByText('Instalar la app')).not.toBeInTheDocument();
  });
});
