import { execSync } from 'node:child_process';

// Los tests aíslan sus datos creando usuarios únicos, así que no hace falta resetear la base.
// Para vaciar la base de pruebas, reinicia el contenedor (usa tmpfs):
//   docker compose -f docker-compose.dev.yml restart db-test
export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://finanzas:finanzas@localhost:5433/finanzas_test';
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
