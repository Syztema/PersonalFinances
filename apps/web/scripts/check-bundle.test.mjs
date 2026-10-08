import { describe, expect, it } from 'vitest';
import { checkBundle, DEFERRED_CHUNKS, staticClosure, TOLERANCE_BYTES } from './check-bundle.mjs';

/** Manifest con la forma del de Vite 8: entrada, chunk compartido, pantallas diferidas y chunks con nombre. */
function fakeManifest({ entryImports = [] } = {}) {
  return {
    'index.html': {
      file: 'assets/index-a1.js',
      name: 'index',
      src: 'index.html',
      isEntry: true,
      imports: ['_react-b2.js', ...entryImports],
      dynamicImports: ['src/features/reports/charts/ReportCharts.tsx', 'src/app/UpdatePrompt.tsx'],
      css: ['assets/index-c3.css'],
    },
    '_react-b2.js': { file: 'assets/react-b2.js', name: 'react' },
    'src/features/reports/charts/ReportCharts.tsx': {
      file: 'assets/ReportCharts-d4.js',
      name: 'ReportCharts',
      src: 'src/features/reports/charts/ReportCharts.tsx',
      isDynamicEntry: true,
      imports: ['_charts-e5.js', '_react-b2.js', 'index.html'],
    },
    '_charts-e5.js': { file: 'assets/charts-e5.js', name: 'charts', imports: ['_react-b2.js'] },
    'src/app/UpdatePrompt.tsx': {
      file: 'assets/UpdatePrompt-f6.js',
      name: 'UpdatePrompt',
      src: 'src/app/UpdatePrompt.tsx',
      isDynamicEntry: true,
      imports: ['_pwa-g7.js', '_react-b2.js', 'index.html'],
    },
    '_pwa-g7.js': {
      file: 'assets/pwa-g7.js',
      name: 'pwa',
      imports: ['_react-b2.js', 'index.html'],
    },
  };
}

const SIZES = {
  'assets/index-a1.js': 40_000,
  'assets/react-b2.js': 60_000,
  'assets/index-c3.css': 6_000,
  'assets/ReportCharts-d4.js': 4_000,
  'assets/charts-e5.js': 110_000,
  'assets/UpdatePrompt-f6.js': 500,
  'assets/pwa-g7.js': 3_000,
};
const sizeOf = (file) => SIZES[file];

describe('staticClosure', () => {
  it('follows only the static imports of the entry, cycles included', () => {
    expect(staticClosure(fakeManifest()).sort()).toEqual(['_react-b2.js', 'index.html']);
  });

  it('requires exactly one entry', () => {
    const manifest = fakeManifest();
    manifest['index.html'].isEntry = false;
    expect(() => staticClosure(manifest)).toThrow(
      'El manifest debe tener una sola entrada y tiene 0',
    );
  });
});

describe('checkBundle', () => {
  it('adds up the entry, the chunks it imports and its CSS', () => {
    expect(checkBundle({ manifest: fakeManifest(), baseline: 106_000, sizeOf })).toEqual({
      ok: true,
      size: 106_000,
      limit: 106_000 + TOLERANCE_BYTES,
      errors: [],
    });
  });

  it('allows exactly 5 KB over the baseline and fails one byte more', () => {
    const atLimit = checkBundle({
      manifest: fakeManifest(),
      baseline: 106_000 - TOLERANCE_BYTES,
      sizeOf,
    });
    expect(atLimit.ok).toBe(true);
    const over = checkBundle({
      manifest: fakeManifest(),
      baseline: 106_000 - TOLERANCE_BYTES - 1,
      sizeOf,
    });
    expect(over.ok).toBe(false);
    expect(over.errors).toEqual([
      'La carga inicial pesa 106000 B en gzip y el límite es 105999 B (línea base 100879 B + 5120 B).',
    ]);
  });

  it('fails when the entry imports the charts chunk statically', () => {
    const result = checkBundle({
      manifest: fakeManifest({ entryImports: ['_charts-e5.js'] }),
      baseline: 1_000_000,
      sizeOf,
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      'El chunk "charts" (assets/charts-e5.js) se carga con la entrada: debe llegar solo por un import() diferido.',
    ]);
  });

  it('fails when the PWA registration ends up in the static graph of the entry', () => {
    const result = checkBundle({
      manifest: fakeManifest({ entryImports: ['src/app/UpdatePrompt.tsx'] }),
      baseline: 1_000_000,
      sizeOf,
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      'El chunk "pwa" (assets/pwa-g7.js) se carga con la entrada: debe llegar solo por un import() diferido.',
    ]);
  });

  it('watches the charts and the PWA registration chunks', () => {
    expect(DEFERRED_CHUNKS).toEqual(['charts', 'pwa']);
  });
});
