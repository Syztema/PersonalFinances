import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Se lee del disco: con `css: false`, Vitest entrega vacío cualquier import de .css (incluso ?raw).
const css = readFileSync(join(import.meta.dirname, 'index.css'), 'utf8');

/** Variables de un bloque `selector { … }` de index.css (el primero con ese selector). */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`index.css no tiene el bloque ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]),
  );
}

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relación de contraste WCAG 2.x. */
function contrast(a: string, b: string): number {
  const [high = 0, low = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const light = tokens(':root');
const dark = tokens(':root.dark');

describe('index.css tokens', () => {
  it('uses the AA muted and warning colors in the light theme (spec §7.1)', () => {
    expect(light['--muted']).toBe('#5b6779');
    expect(light['--warning']).toBe('#a14a06');
    for (const surface of ['--surface-2', '--bg', '--surface']) {
      expect(contrast(light['--muted'] ?? '', light[surface] ?? '')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(light['--warning'] ?? '', light[surface] ?? '')).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(light['--muted'] ?? '', light['--surface-2'] ?? '')).toBeCloseTo(5.06, 2);
    expect(contrast(light['--warning'] ?? '', light['--surface'] ?? '')).toBeCloseTo(6.0, 2);
    expect(contrast(light['--warning-fg'] ?? '', light['--warning'] ?? '')).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('keeps the dark theme as it was', () => {
    expect(dark['--muted']).toBe('#93a1b0');
    expect(dark['--warning']).toBe('#fbbf24');
  });

  it('defines the chart series for both themes (spec §5.1)', () => {
    const keys = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'];
    expect(keys.map((k) => light[k])).toEqual([
      '#0f766e',
      '#2563eb',
      '#c2410c',
      '#7c3aed',
      '#be185d',
      '#4d7c0f',
    ]);
    expect(light['--chart-other']).toBe('#94a3b8');
    expect(keys.map((k) => dark[k])).toEqual([
      '#2dd4bf',
      '#60a5fa',
      '#fb923c',
      '#a78bfa',
      '#f472b6',
      '#a3e635',
    ]);
    expect(dark['--chart-other']).toBe('#64748b');
    const theme = tokens('@theme inline');
    for (const name of [...keys.map((k) => k.slice(2)), 'chart-other']) {
      expect(theme[`--color-${name}`]).toBe(`var(--${name})`);
    }
  });

  it('turns animations and transitions off with reduced motion', () => {
    const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start);
    expect(block).toContain('animation-duration: 0.01ms !important;');
    expect(block).toContain('transition-duration: 0.01ms !important;');
  });
});
