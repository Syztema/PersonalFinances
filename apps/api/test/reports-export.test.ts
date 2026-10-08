import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ReportDTO } from '@finanzas/shared';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createPrisma } from '../src/lib/prisma';
import { setupFinances } from './finance-fixtures';
import { createTestApp, registerUser, SESSION_COOKIE } from './helpers';

let app: FastifyInstance;
const NOW = () => new Date('2026-10-20T15:00:00Z');
const BOM = String.fromCharCode(0xfeff);
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Exportaciones retenidas por `holdExports` (null: ninguna). */
let gate: {
  userIds: Set<string>;
  arrive: (userId: string) => void;
  released: Promise<void>;
} | null = null;

const base = createPrisma(process.env.DATABASE_URL!);
/** El Prisma de `app`: igual al normal, salvo que el conteo de una exportación retenida espera. */
const gated = base.$extends({
  query: {
    transaction: {
      async count({ args, query }) {
        const current = gate;
        const userId = (args.where as { userId?: string } | undefined)?.userId;
        if (current && userId && current.userIds.has(userId)) {
          current.arrive(userId);
          await current.released;
        }
        return query(args);
      },
    },
  },
}) as unknown as PrismaClient;

/**
 * Review 3A M4a: retiene las exportaciones de estos usuarios dentro de su transacción (en el
 * conteo, su primera lectura) hasta `release()`. `inside(userId)` se cumple cuando la de ese
 * usuario ya llegó ahí: las pruebas de concurrencia no dependen de cuánto tarda cada petición.
 */
function holdExports(userIds: string[]) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const arrived = new Map<string, () => void>();
  const inside = new Map(
    userIds.map((id) => [id, new Promise<void>((resolve) => arrived.set(id, resolve))]),
  );
  gate = { userIds: new Set(userIds), arrive: (id) => arrived.get(id)?.(), released };
  return {
    inside: (userId: string) => inside.get(userId)!,
    release: () => {
      gate = null;
      release();
    },
  };
}

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: NOW, prisma: gated }));
});

afterAll(async () => {
  await app.close();
  await base.$disconnect();
});

const download = (target: FastifyInstance, cookie: string, query: string) =>
  target.inject({
    method: 'GET',
    url: `/api/reports/export?${query}`,
    cookies: { [SESSION_COOKIE]: cookie },
  });

/** Lector RFC 4180 con `;` (solo para leer de vuelta lo exportado). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += ch;
  }
  if (field !== '' || row.length > 0) rows.push([...row, field]);
  return rows;
}

async function withTimeZone<T>(timeZone: string, run: () => Promise<T>): Promise<T> {
  const original = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return await run();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

async function readXlsx(payload: Buffer) {
  const wb = new ExcelJS.Workbook();
  // exceljs tipa la entrada como ArrayBuffer: se copia el Buffer de Node a uno propio.
  await wb.xlsx.load(new Uint8Array(payload).buffer);
  return wb;
}

const values = (ws: ExcelJS.Worksheet, n: number) => (ws.getRow(n).values as unknown[]).slice(1);

/** Movimientos de octubre con textos difíciles (y uno de septiembre que no se exporta). */
async function userWithMovements() {
  const { api, cookie } = await registerUser(app);
  const f = await setupFinances(api);
  const restaurants = (
    await api.post('/api/categories', {
      name: 'Restaurantes',
      kind: 'EXPENSE',
      parentId: f.cat.food,
    })
  ).body.category.id as string;
  await api.post('/api/transactions', {
    type: 'EXPENSE',
    amount: 70_000,
    date: '2026-09-30',
    accountId: f.cash,
    categoryId: f.cat.food,
  });
  await api.post('/api/transactions', {
    type: 'INCOME',
    amount: 4_000_000,
    date: '2026-10-01',
    accountId: f.bank,
    categoryId: f.cat.salary,
    description: '+bono',
    notes: '@nota',
  });
  await api.post(`/api/credit-cards/${f.card}/purchase`, {
    amount: 1_200_000,
    date: '2026-10-03',
    categoryId: f.cat.fun,
    installments: 12,
    description: '-descuento',
  });
  await api.post('/api/transfers', {
    amount: 300_000,
    date: '2026-10-04',
    accountId: f.bank,
    toAccountId: f.wallet,
    description: 'Paso a Nequi',
  });
  await api.post('/api/transactions', {
    type: 'EXPENSE',
    amount: 45_000,
    date: '2026-10-07',
    accountId: f.bank,
    categoryId: f.cat.food,
    paymentMethod: 'DEBIT_CARD',
    description: 'Almuerzo; "especial"\ncon postre 🍕',
    notes: '=HYPERLINK("http://x")',
    tags: ['trabajo', 'comida'],
  });
  await api.post('/api/transactions', {
    type: 'EXPENSE',
    amount: 30_000,
    date: '2026-10-08',
    accountId: f.cash,
    categoryId: restaurants,
    description: 'Cena',
  });
  await api.post(`/api/debts/${f.debt}/payments`, {
    accountId: f.bank,
    principal: 400_000,
    interest: 50_000,
    date: '2026-10-10',
  });
  await api.post(`/api/debts/${f.debt}/disbursements`, {
    accountId: f.bank,
    amount: 1_000_000,
    date: '2026-10-12',
  });
  return { api, cookie, f };
}

const HEADER = [
  'Fecha',
  'Tipo',
  'Descripción',
  'Categoría',
  'Subcategoría',
  'Cuenta',
  'Cuenta destino',
  'Tarjeta',
  'Préstamo',
  'Cuotas',
  'Método de pago',
  'Valor',
  'Etiquetas',
  'Notas',
];

describe('GET /api/reports/export — CSV (spec Fase 3 §4)', () => {
  it('reads back exactly, with BOM, ; CRLF, quotes, emojis and neutralized formulas (review focus 3)', async () => {
    const { cookie } = await userWithMovements();
    const res = await download(app, cookie, 'preset=THIS_MONTH&format=csv');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="finanzas-movimientos-2026-10-01_2026-10-20.csv"',
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect([...res.rawPayload.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(res.body).toContain('"Almuerzo; ""especial""\ncon postre 🍕"');
    expect(res.body.endsWith('\r\n')).toBe(true);

    expect(parseCsv(res.body.slice(1))).toEqual([
      HEADER,
      [
        '2026-10-01',
        'Ingreso',
        "'+bono",
        'Salario',
        '',
        'Bancolombia',
        '',
        '',
        '',
        '',
        '',
        '4000000',
        '',
        "'@nota",
      ],
      [
        '2026-10-03',
        'Compra con tarjeta',
        "'-descuento",
        'Entretenimiento',
        '',
        '',
        '',
        'Nu Crédito',
        '',
        '12',
        'Tarjeta crédito',
        '1200000',
        '',
        '',
      ],
      [
        '2026-10-04',
        'Transferencia',
        'Paso a Nequi',
        '',
        '',
        'Bancolombia',
        'Nequi',
        '',
        '',
        '',
        '',
        '300000',
        '',
        '',
      ],
      [
        '2026-10-07',
        'Gasto',
        'Almuerzo; "especial"\ncon postre 🍕',
        'Alimentación',
        '',
        'Bancolombia',
        '',
        '',
        '',
        '',
        'Tarjeta débito',
        '45000',
        'comida, trabajo',
        '\'=HYPERLINK("http://x")',
      ],
      [
        '2026-10-08',
        'Gasto',
        'Cena',
        'Alimentación',
        'Restaurantes',
        'Efectivo',
        '',
        '',
        '',
        '',
        'Efectivo',
        '30000',
        '',
        '',
      ],
      [
        '2026-10-10',
        'Pago de préstamo',
        '',
        '',
        '',
        'Bancolombia',
        '',
        '',
        'Libre inversión',
        '',
        '',
        '400000',
        '',
        '',
      ],
      [
        '2026-10-10',
        'Gasto',
        'Intereses Libre inversión',
        'Intereses y comisiones',
        '',
        'Bancolombia',
        '',
        '',
        '',
        '',
        'Cuenta bancaria',
        '50000',
        '',
        '',
      ],
      [
        '2026-10-12',
        'Desembolso',
        '',
        '',
        '',
        'Bancolombia',
        '',
        '',
        'Libre inversión',
        '',
        '',
        '1000000',
        '',
        '',
      ],
    ]);
  });

  it('validates the format and the period', async () => {
    const { cookie } = await registerUser(app);
    const missing = await download(app, cookie, 'preset=THIS_MONTH');
    expect(missing.statusCode).toBe(400);
    expect(Object.keys(missing.json().error.fields)).toEqual(['format']);
    expect((await download(app, cookie, 'preset=THIS_MONTH&format=pdf')).statusCode).toBe(400);
    const future = await download(app, cookie, 'from=2026-10-01&to=2026-10-21&format=csv');
    expect(future.statusCode).toBe(400);
    expect(future.json().error.fields).toEqual({ to: 'La fecha final no puede ser futura' });
  });
});

describe('GET /api/reports/export — Excel (spec Fase 3 §4)', () => {
  it('has four sheets whose totals match /api/reports, with real dates and money formats', async () => {
    const { api, cookie } = await userWithMovements();
    const report = (await api.get<ReportDTO>('/api/reports?preset=THIS_MONTH')).body;
    // UTC+14: una fecha creada a medianoche local se correría de día (review focus 4).
    const res = await withTimeZone('Pacific/Kiritimati', () =>
      download(app, cookie, 'preset=THIS_MONTH&format=xlsx'),
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe(XLSX);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="finanzas-reporte-2026-10-01_2026-10-20.xlsx"',
    );
    expect(res.headers['cache-control']).toBe('no-store');

    const wb = await readXlsx(res.rawPayload);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Resumen',
      'Movimientos',
      'Por categoría',
      'Por cuenta',
    ]);

    const summary = wb.getWorksheet('Resumen')!;
    expect(values(summary, 1)).toEqual(['Periodo', 'Este mes']);
    expect((summary.getCell('B2').value as Date).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect((summary.getCell('B3').value as Date).toISOString()).toBe('2026-10-20T00:00:00.000Z');
    expect([5, 6, 7, 8, 9, 10].map((n) => values(summary, n))).toEqual([
      ['Ingresos', report.totals.income],
      ['Gastos', report.totals.expense],
      ['Ahorro', report.totals.savings],
      ['Inversión', report.totals.investment],
      ['Restante', report.totals.remaining],
      ['Tasa de ahorro', report.totals.savingsRate],
    ]);
    expect(report.totals).toMatchObject({
      income: 4_000_000,
      expense: 1_325_000,
      remaining: 2_675_000,
    });
    expect(values(summary, 12)).toEqual(['Generado el', '20/10/2026 10:00']);

    const movements = wb.getWorksheet('Movimientos')!;
    expect(values(movements, 1)).toEqual(HEADER);
    expect(movements.rowCount).toBe(9);
    expect(movements.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(movements.autoFilter).toBe('A1:N1');
    const first = movements.getRow(2);
    expect(first.getCell(1).numFmt).toBe('dd/mm/yyyy');
    expect((first.getCell(1).value as Date).toISOString().slice(0, 10)).toBe('2026-10-01');
    expect((first.getCell(1).value as Date).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(first.getCell(3).value).toBe("'+bono");
    expect(first.getCell(12).value).toBe(4_000_000);
    expect(first.getCell(12).numFmt).toBe('"$"#,##0');
    expect(movements.getRow(3).getCell(10).value).toBe(12);
    const lunch = movements.getRow(5);
    expect(lunch.getCell(3).value).toBe('Almuerzo; "especial"\ncon postre 🍕');
    expect(lunch.getCell(14).value).toBe('\'=HYPERLINK("http://x")');

    const byCategory = wb.getWorksheet('Por categoría')!;
    const expenseRows = report.expenseByCategory.map((c) => [c.category.name, c.amount, c.share]);
    expect(expenseRows).toEqual([
      ['Entretenimiento', 1_200_000, 0.9057],
      ['Alimentación', 75_000, 0.0566],
      ['Intereses y comisiones', 50_000, 0.0377],
    ]);
    expect([3, 4, 5].map((n) => values(byCategory, n))).toEqual(expenseRows);
    expect(values(byCategory, 7)).toEqual(['Ingresos']);
    expect(values(byCategory, 9)).toEqual(['Salario', 4_000_000, 1]);

    const byAccount = wb.getWorksheet('Por cuenta')!;
    expect([2, 3, 4].map((n) => values(byAccount, n))).toEqual([
      ['Bancolombia', 'Cuenta bancaria', 2_000_000, 5_000_000, 795_000, 6_205_000],
      ['Nequi', 'Billetera digital', 0, 300_000, 0, 300_000],
      ['Efectivo', 'Efectivo', 30_000, 0, 30_000, 0],
    ]);
    expect(report.accounts.map((a) => a.closing)).toEqual([6_205_000, 300_000, 0]);
  });
});

describe('GET /api/reports/export — limits and isolation (spec Fase 3 §4)', () => {
  it('answers 400 EXPORT_TOO_LARGE above EXPORT_MAX_ROWS, at the boundary (3 allowed, 4 refused)', async () => {
    const { app: small } = await createTestApp({ EXPORT_MAX_ROWS: '3' }, { now: NOW });
    try {
      const { api, cookie } = await registerUser(small);
      const f = await setupFinances(api);
      const ids: string[] = [];
      for (const day of ['01', '02', '03', '04']) {
        const res = await api.post('/api/transactions', {
          type: 'EXPENSE',
          amount: 10_000,
          date: `2026-10-${day}`,
          accountId: f.bank,
          categoryId: f.cat.food,
        });
        ids.push(res.body.transaction.id);
      }
      for (const format of ['csv', 'xlsx']) {
        const res = await download(small, cookie, `preset=THIS_MONTH&format=${format}`);
        expect(res.statusCode, format).toBe(400);
        expect(res.json().error).toEqual({
          code: 'EXPORT_TOO_LARGE',
          message: 'Elige un periodo más corto.',
        });
      }
      await api.del(`/api/transactions/${ids[0]}`);
      expect((await download(small, cookie, 'preset=THIS_MONTH&format=csv')).statusCode).toBe(200);
    } finally {
      await small.close();
    }
  });

  it('allows 10 exports per minute per user and answers 429 to the 11th', async () => {
    const a = await registerUser(app);
    for (let i = 1; i <= 10; i++) {
      expect(
        (await download(app, a.cookie, 'preset=THIS_MONTH&format=csv')).statusCode,
        `#${i}`,
      ).toBe(200);
    }
    const eleventh = await download(app, a.cookie, 'preset=THIS_MONTH&format=csv');
    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json().error.code).toBe('RATE_LIMITED');
    // La clave es el usuario: otra persona puede exportar en el mismo minuto.
    const b = await registerUser(app);
    expect((await download(app, b.cookie, 'preset=THIS_MONTH&format=csv')).statusCode).toBe(200);
    // El límite es solo para exportar.
    expect((await a.api.get('/api/reports?preset=THIS_MONTH')).status).toBe(200);
  });

  it('keeps the 429 body shape, counts HEAD as nothing and ignores the IP (per user)', async () => {
    const a = await registerUser(app);
    const send = (method: 'GET' | 'HEAD', remoteAddress: string) =>
      app.inject({
        method,
        url: '/api/reports/export?preset=THIS_MONTH&format=csv',
        cookies: { [SESSION_COOKIE]: a.cookie },
        remoteAddress,
      });
    // No hay ruta HEAD automática: no es un segundo contador ni corre la exportación.
    expect([404, 405]).toContain((await send('HEAD', '10.0.0.1')).statusCode);
    for (let i = 1; i <= 10; i++) {
      // Cada petición llega desde otra IP y aun así cuenta para el mismo usuario.
      expect((await send('GET', `10.0.1.${i}`)).statusCode, `#${i}`).toBe(200);
    }
    const eleventh = await send('GET', '10.0.2.1');
    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json()).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
      },
    });
  });

  it('throttles unauthenticated requests with the global IP limit', async () => {
    const { app: limited } = await createTestApp({ RATE_LIMIT_MAX: '5' }, { now: NOW });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 8; i++) {
        codes.push(
          (
            await limited.inject({
              method: 'GET',
              url: '/api/reports/export?preset=THIS_MONTH&format=csv',
              cookies: { [SESSION_COOKIE]: 'cookie-falsa' },
            })
          ).statusCode,
        );
      }
      expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(codes.slice(5)).toEqual([429, 429, 429]);
    } finally {
      await limited.close();
    }
  });

  it('allows one export at a time per user and frees the slot afterwards', async () => {
    const { cookie, user } = await registerUser(app);
    const hold = holdExports([user.id]);
    try {
      const first = download(app, cookie, 'preset=THIS_MONTH&format=xlsx');
      // La primera ya está dentro de su transacción y retiene el cupo del usuario.
      await hold.inside(user.id);
      const second = await download(app, cookie, 'preset=THIS_MONTH&format=xlsx');
      expect(second.statusCode).toBe(429);
      expect(second.json()).toEqual({
        error: { code: 'RATE_LIMITED', message: 'Espera a que termine la exportación anterior.' },
      });
      hold.release();
      expect((await first).statusCode).toBe(200);
    } finally {
      hold.release();
    }
    expect((await download(app, cookie, 'preset=THIS_MONTH&format=csv')).statusCode).toBe(200);
  });

  it('builds at most 2 Excel files at once on the server and answers 429 to a third (review 3A M1)', async () => {
    const [a, b, c] = await Promise.all([registerUser(app), registerUser(app), registerUser(app)]);
    const hold = holdExports([a.user.id, b.user.id]);
    try {
      const first = download(app, a.cookie, 'preset=THIS_MONTH&format=xlsx');
      const second = download(app, b.cookie, 'preset=THIS_MONTH&format=xlsx');
      await Promise.all([hold.inside(a.user.id), hold.inside(b.user.id)]);
      const third = await download(app, c.cookie, 'preset=THIS_MONTH&format=xlsx');
      expect(third.statusCode).toBe(429);
      expect(third.json()).toEqual({
        error: {
          code: 'RATE_LIMITED',
          message: 'Hay muchas exportaciones en curso; intenta en un momento.',
        },
      });
      // El CSV es liviano: no cuenta para ese tope.
      expect((await download(app, c.cookie, 'preset=THIS_MONTH&format=csv')).statusCode).toBe(200);
      hold.release();
      expect((await first).statusCode).toBe(200);
      expect((await second).statusCode).toBe(200);
    } finally {
      hold.release();
    }
    expect((await download(app, c.cookie, 'preset=THIS_MONTH&format=xlsx')).statusCode).toBe(200);
  });

  it('frees the slot when the export fails', async () => {
    const { cookie } = await registerUser(app);
    expect((await download(app, cookie, 'preset=THIS_MONTH&format=pdf')).statusCode).toBe(400);
    expect((await download(app, cookie, 'preset=THIS_MONTH&format=csv')).statusCode).toBe(200);
  });

  it('neutralizes formulas in account, card, loan and tag names of the workbook', async () => {
    const { api, cookie } = await registerUser(app);
    const bank = (
      await api.post('/api/accounts', { name: '=Cuenta', type: 'BANK', initialBalance: 1_000_000 })
    ).body.account.id as string;
    const card = (
      await api.post('/api/credit-cards', {
        name: '+Tarjeta',
        creditLimit: 5_000_000,
        statementDay: 15,
        paymentDueDay: 30,
      })
    ).body.card.id as string;
    const debt = (
      await api.post('/api/debts', {
        name: '-Préstamo',
        initialBalance: 1_000_000,
        monthlyPayment: 100_000,
        paymentDay: 5,
      })
    ).body.debt.id as string;
    const food = (
      (await api.get('/api/categories')).body.items as Array<{ id: string; name: string }>
    ).find((c) => c.name === 'Alimentación')!.id;
    await api.post('/api/transactions', {
      type: 'EXPENSE',
      amount: 10_000,
      date: '2026-10-02',
      accountId: bank,
      categoryId: food,
      tags: ['@etiqueta'],
    });
    await api.post(`/api/credit-cards/${card}/purchase`, {
      amount: 20_000,
      date: '2026-10-03',
      categoryId: food,
    });
    await api.post(`/api/debts/${debt}/payments`, {
      accountId: bank,
      principal: 100_000,
      interest: 0,
      date: '2026-10-04',
    });
    const wb = await readXlsx(
      (await download(app, cookie, 'preset=THIS_MONTH&format=xlsx')).rawPayload,
    );
    const cells = wb.getWorksheet('Movimientos')!;
    expect(cells.getRow(2).getCell(6).value).toBe("'=Cuenta");
    expect(cells.getRow(2).getCell(13).value).toBe("'@etiqueta");
    expect(cells.getRow(3).getCell(8).value).toBe("'+Tarjeta");
    expect(cells.getRow(4).getCell(9).value).toBe("'-Préstamo");
    expect(values(wb.getWorksheet('Por cuenta')!, 2)[0]).toBe("'=Cuenta");
  });

  it("never exports another user's movements", async () => {
    await userWithMovements();
    const b = await registerUser(app);
    const csv = await download(app, b.cookie, 'preset=THIS_MONTH&format=csv');
    expect(csv.body).toBe(`${BOM}${HEADER.join(';')}\r\n`);
    const wb = await readXlsx(
      (await download(app, b.cookie, 'preset=THIS_MONTH&format=xlsx')).rawPayload,
    );
    expect(wb.getWorksheet('Movimientos')!.rowCount).toBe(1);
    expect(wb.getWorksheet('Por cuenta')!.rowCount).toBe(1);
    expect(values(wb.getWorksheet('Resumen')!, 5)).toEqual(['Ingresos', 0]);
  });

  it('requires a session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/export?preset=THIS_MONTH&format=csv',
    });
    expect(res.statusCode).toBe(401);
  });
});
