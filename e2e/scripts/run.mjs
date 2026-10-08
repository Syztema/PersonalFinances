// npm run e2e: levanta el Docker de despliegue, corre Playwright y siempre apaga el stack que
// levantó (spec §9.4).
//
// - Una sola vez por máquina hay que descargar el navegador: `npx playwright install chromium`.
// - Ctrl-C a mitad de la corrida puede dejar el stack `finanzas-local` arriba y el .env temporal en
//   la raíz. Después de cortarla, `npm run e2e:down` apaga el stack (sin borrar el volumen) y borra
//   el .env solo si lo creó este script (lo marca `e2e/.env.created`).
// - `npm run e2e -- tests/pwa.spec.ts` pasa los argumentos a Playwright.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const e2eDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(e2eDir, '..');
const envFile = join(root, '.env');
// Ignorado por git (.env.*): la base de finanzas-local conserva su volumen entre corridas, así que
// la contraseña generada la primera vez se reutiliza.
const passwordFile = join(e2eDir, '.env.e2e');
// Ignorado por git (.env.*): existe mientras el .env de la raíz sea el temporal de este script.
const markerFile = join(e2eDir, '.env.created');
const APP_URL = 'http://localhost:8080';
const HEALTH_URL = `${APP_URL}/api/health`;
const COMPOSE = [
  'compose',
  '-p',
  'finanzas-local',
  '-f',
  'docker-compose.yml',
  '-f',
  'docker-compose.local.yml',
];
// Compose interpola todo el archivo también en `down`: sin .env, las variables obligatorias lo
// harían fallar. `down` no usa sus valores.
const DOWN_ENV = {
  ...process.env,
  APP_URL: process.env.APP_URL ?? APP_URL,
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? 'sin-uso-en-down',
};

const message = (error) => (error instanceof Error ? error.message : String(error));

function run(command, args, { cwd = root, env = process.env } = {}) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function postgresPassword() {
  if (existsSync(passwordFile)) return readFileSync(passwordFile, 'utf8').trim();
  const password = randomBytes(24).toString('hex');
  writeFileSync(passwordFile, `${password}\n`);
  return password;
}

/** El .env que escribe el script; null si todavía no hay contraseña guardada. */
function ownEnvContent() {
  if (!existsSync(passwordFile)) return null;
  return `APP_URL=${APP_URL}\nPOSTGRES_PASSWORD=${readFileSync(passwordFile, 'utf8').trim()}\n`;
}

/** El .env de la raíz es el temporal: hay marcador y tiene exactamente lo que escribió el script. */
function isOwnEnv() {
  return (
    existsSync(markerFile) &&
    existsSync(envFile) &&
    readFileSync(envFile, 'utf8') === ownEnvContent()
  );
}

/** Último valor de `name` en el .env: acepta `export `, comillas y un comentario al final. */
function envValue(env, name) {
  const line = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${name}[ \\t]*=(.*)$`, 'gm');
  const matches = [...env.matchAll(line)];
  const raw = matches.at(-1)?.[1]?.trim();
  if (raw === undefined) return undefined;
  const quoted = raw.match(/^(["'])(.*?)\1\s*(?:#.*)?$/);
  return quoted ? quoted[2] : raw.replace(/\s+#.*$/, '');
}

/**
 * Crea el .env temporal si no existe y devuelve true si es del script (hay que borrarlo al final).
 * Con el marcador, un .env que dejó una corrida cortada se reconoce como propio.
 */
function ensureEnv() {
  if (existsSync(envFile)) {
    if (isOwnEnv()) return true;
    // Un marcador viejo no convierte en temporal un .env que escribiste tú.
    rmSync(markerFile, { force: true });
    const env = readFileSync(envFile, 'utf8');
    if (envValue(env, 'APP_URL') !== APP_URL)
      throw new Error('Tu .env debe tener APP_URL=http://localhost:8080 para correr npm run e2e.');
    if (envValue(env, 'ALLOW_REGISTRATION')?.toLowerCase() === 'false')
      throw new Error(
        'Tu .env tiene ALLOW_REGISTRATION=false: las pruebas registran usuarios nuevos.',
      );
    return false;
  }
  // Primero el marcador: si el script se corta entre los dos, nunca queda un .env propio sin marca.
  postgresPassword();
  writeFileSync(markerFile, 'El .env de la raíz lo creó e2e/scripts/run.mjs.\n');
  writeFileSync(envFile, ownEnvContent());
  return true;
}

/** Borra el .env solo si es el temporal del script, y el marcador. */
function removeOwnEnv() {
  try {
    if (isOwnEnv()) rmSync(envFile, { force: true });
    rmSync(markerFile, { force: true });
  } catch (error) {
    console.error(`No se pudo borrar el .env temporal: ${message(error)}`);
  }
}

/** `down` sin `-v`: el volumen de la base se conserva (spec §9.4). */
function composeDown() {
  const status = run('docker', [...COMPOSE, 'down'], { env: DOWN_ENV });
  if (status !== 0) throw new Error(`docker compose down terminó con código ${status}`);
}

async function waitForHealth(timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
    } catch {
      // el stack todavía está arrancando (o la petición pasó de 5 s)
    }
    await new Promise((done) => setTimeout(done, 2000));
  }
  throw new Error(`${HEALTH_URL} no respondió en ${timeoutMs / 1000} s`);
}

function playwrightCli() {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
}

/** npm run e2e:down: limpieza manual después de una corrida cortada. */
function down() {
  let exitCode = 0;
  try {
    composeDown();
  } catch (error) {
    console.error(message(error));
    exitCode = 1;
  } finally {
    removeOwnEnv();
  }
  return exitCode;
}

async function main() {
  let ownsEnv = false;
  // Solo se apaga el stack si este script intentó levantarlo: si el .env no cumple, un
  // finanzas-local que ya tenías arriba sigue igual.
  let triedUp = false;
  let exitCode = 1;
  try {
    ownsEnv = ensureEnv();
    triedUp = true;
    if (run('docker', [...COMPOSE, 'up', '-d', '--build']) !== 0)
      throw new Error('docker compose up falló');
    await waitForHealth();
    exitCode = run(process.execPath, [playwrightCli(), 'test', ...process.argv.slice(2)], {
      cwd: e2eDir,
    });
  } catch (error) {
    console.error(message(error));
  } finally {
    try {
      if (triedUp) composeDown();
    } catch (error) {
      // Se informa, pero el código de salida sigue siendo el de las pruebas.
      console.error(message(error));
    } finally {
      if (ownsEnv) removeOwnEnv();
    }
  }
  return exitCode;
}

process.exit(process.argv[2] === '--down' ? down() : await main());
