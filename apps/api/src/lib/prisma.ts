import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
    // Review M8: el inicio lanza muchas consultas a la vez sobre un pool de 10 conexiones; una
    // transacción interactiva espera hasta 5 s por conexión (no 2 s) y puede durar hasta 10 s.
    transactionOptions: { maxWait: 5000, timeout: 10000 },
  });
}
