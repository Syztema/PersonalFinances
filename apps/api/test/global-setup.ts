import { execSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

// Los tests aíslan sus datos creando usuarios únicos, así que no hace falta resetear la base.
// Para vaciar la base de pruebas, reinicia el contenedor (usa tmpfs):
//   docker compose -f docker-compose.dev.yml restart db-test
export default async function setup(project: TestProject) {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://finanzas:finanzas@localhost:5433/finanzas_test';
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
  await assertConnectionBudget(project, url);
}

/**
 * Cada archivo de integración corre en su propio proceso y levanta su propia app, con un pool de pg
 * que llega a su máximo (`GET /api/dashboard` lanza más consultas en paralelo que el pool). Si
 * workers × pool supera `max_connections`, Postgres rechaza conexiones (53300, Prisma P2037) y
 * fallan pruebas al azar con 500. Se reserva un pool más para las apps anidadas de algunos archivos
 * y para herramientas (psql, Prisma Studio).
 */
async function assertConnectionBudget(project: TestProject, url: string) {
  // Igual que Vitest resuelve los workers de un proyecto.
  const workers =
    Number(project.config.maxWorkers || project.vitest.config.maxWorkers) ||
    Math.max(availableParallelism() - 1, 1);
  const poolMax = new pg.Pool().options.max ?? 10; // PrismaPg usa el máximo por defecto de pg.Pool
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const { rows } = await db.query<{ max_connections: string }>('SHOW max_connections');
    const maxConnections = Number(rows[0]!.max_connections);
    const needed = (workers + 1) * poolMax;
    if (needed > maxConnections) {
      throw new Error(
        `Las pruebas de integración pueden abrir ${needed} conexiones ((${workers} workers + 1) × ${poolMax}) ` +
          `y la base de pruebas acepta ${maxConnections}: baja maxWorkers del proyecto "integration".`,
      );
    }
  } finally {
    await db.end();
  }
}
