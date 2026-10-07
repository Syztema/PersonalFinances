import { config as loadDotenv } from 'dotenv';
import { createPrisma } from '../src/lib/prisma';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from './seed-demo';

loadDotenv({ quiet: true });

if (process.env.NODE_ENV === 'production') {
  console.error('El seed de demostración no se ejecuta en producción.');
  process.exit(1);
}

const prisma = createPrisma(process.env.DATABASE_URL!);
try {
  await seedDemo(prisma);
  console.log(`Usuario demo listo: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
} finally {
  await prisma.$disconnect();
}
