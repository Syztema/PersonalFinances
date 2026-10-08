// Control del tamaño de la carga inicial (spec Fase 3 §7.2).
// Uso: npm run build -w @finanzas/web && npm run check:bundle -w @finanzas/web
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Margen permitido sobre la línea base de la Fase 2: 5 KB en gzip. */
export const TOLERANCE_BYTES = 5120;

/** Chunks con nombre (vite.config.ts → codeSplitting.groups) que nunca pueden cargarse con la entrada. */
export const DEFERRED_CHUNKS = ['charts', 'pwa'];

/** Tamaño en gzip (nivel 9) de un archivo. */
export function gzipSize(buffer) {
  return gzipSync(buffer, { level: 9 }).length;
}

/** Claves del manifest de Vite que se cargan con la entrada: ella misma y todo lo que importa estáticamente. */
export function staticClosure(manifest) {
  const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry);
  if (entries.length !== 1) {
    throw new Error(`El manifest debe tener una sola entrada y tiene ${entries.length}`);
  }
  const seen = new Set();
  const pending = [entries[0]];
  while (pending.length > 0) {
    const key = pending.pop();
    if (seen.has(key) || !manifest[key]) continue;
    seen.add(key);
    pending.push(...(manifest[key].imports ?? []));
  }
  return [...seen];
}

/**
 * Revisa el build. `sizeOf(file)` devuelve el tamaño en gzip de un archivo de `dist` (ruta del manifest).
 * Falla si la carga inicial (entrada + chunks estáticos + su CSS) supera la línea base + 5 KB, o si un
 * chunk diferido (`charts`, `pwa`) quedó en el grafo estático de la entrada.
 */
export function checkBundle({ manifest, baseline, sizeOf }) {
  const closure = staticClosure(manifest);
  const files = new Set();
  for (const key of closure) {
    files.add(manifest[key].file);
    for (const css of manifest[key].css ?? []) files.add(css);
  }
  let size = 0;
  for (const file of files) size += sizeOf(file);
  const limit = baseline + TOLERANCE_BYTES;
  const errors = [];
  if (size > limit) {
    errors.push(
      `La carga inicial pesa ${size} B en gzip y el límite es ${limit} B (línea base ${baseline} B + ${TOLERANCE_BYTES} B).`,
    );
  }
  for (const key of closure) {
    const { name, file } = manifest[key];
    if (DEFERRED_CHUNKS.includes(name)) {
      errors.push(
        `El chunk "${name}" (${file}) se carga con la entrada: debe llegar solo por un import() diferido.`,
      );
    }
  }
  return { ok: errors.length === 0, size, limit, errors };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dist = join(root, 'dist');
  const manifestPath = join(dist, '.vite', 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(
      'check:bundle: falta dist/.vite/manifest.json; corre antes `npm run build -w @finanzas/web`.',
    );
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const { entryGzipBytes } = JSON.parse(readFileSync(join(root, 'bundle-baseline.json'), 'utf8'));
  const result = checkBundle({
    manifest,
    baseline: entryGzipBytes,
    sizeOf: (file) => gzipSize(readFileSync(join(dist, file))),
  });
  for (const error of result.errors) console.error(`check:bundle: ${error}`);
  if (!result.ok) process.exit(1);
  console.log(
    `check:bundle OK: carga inicial ${result.size} B en gzip (límite ${result.limit} B).`,
  );
}

// Solo corre como comando (node scripts/check-bundle.mjs), no al importarlo desde el test.
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/scripts/check-bundle.mjs')) main();
