import { config as loadDotenv } from 'dotenv';
import { buildApp } from './app';
import { loadConfig } from './config/env';

loadDotenv({ quiet: true });

const config = loadConfig();
const app = await buildApp(config);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Cerrando servidor');
  await app.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.host, port: config.port });
