import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { CompanionDTO, ReportDTO } from '@finanzas/shared';
import { setupFinances } from './finance-fixtures';
import ExcelJS from 'exceljs';
import { createTestApp, registerUser, SESSION_COOKIE, type Client } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await createTestApp({}, { now: () => new Date('2026-10-20T15:00:00Z') }));
});

afterAll(async () => {
  await app.close();
});

/**
 * Octubre (hasta el 20): Amigos $150.000, Pareja $1.200.000 (tarjeta), sin compañía $30.000,
 * intereses $50.000 y un ajuste de $10.000. En septiembre, Amigos $70.000 (no cuenta en "Este mes").
 */
async function userWithWho() {
  const reg = await registerUser(app);
  const { api } = reg;
  const f = await setupFinances(api);
  const options = (await api.get<{ items: CompanionDTO[] }>('/api/companions')).body.items;
  const who = (name: string) => options.find((c) => c.name === name)!.id;
  const post = async (path: string, body: unknown) => {
    const res = await api.post(path, body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  };
  const expense = { type: 'EXPENSE', accountId: f.bank, categoryId: f.cat.food };
  await post('/api/transactions', {
    ...expense,
    amount: 70_000,
    date: '2026-09-28',
    companionId: who('Amigos'),
  });
  await post('/api/transactions', {
    ...expense,
    amount: 150_000,
    date: '2026-10-05',
    companionId: who('Amigos'),
    description: 'Asado',
  });
  await post(`/api/credit-cards/${f.card}/purchase`, {
    amount: 1_200_000,
    date: '2026-10-06',
    categoryId: f.cat.fun,
    installments: 12,
    companionId: who('Pareja'),
  });
  await post('/api/transactions', { ...expense, amount: 30_000, date: '2026-10-07' });
  await post('/api/transactions', {
    type: 'DEBT_PAYMENT',
    amount: 400_000,
    interest: 50_000,
    date: '2026-10-08',
    accountId: f.bank,
    debtId: f.debt,
  });
  const adjust = await api.post(`/api/accounts/${f.cash}/adjust`, {
    actualBalance: 90_000,
    date: '2026-10-09',
  });
  expect(adjust.status, JSON.stringify(adjust.body)).toBe(201);
  return { ...reg, f, who };
}

const report = async (api: Client, query = 'preset=THIS_MONTH') => {
  const res = await api.get<ReportDTO>(`/api/reports?${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
};

describe('GET /api/reports — who (spec con quién §4.1)', () => {
  it('adds up spending by who exactly to the expense total, with interest and adjustments as Sin indicar', async () => {
    const { api } = await userWithWho();
    const r = await report(api);
    expect(r.expenseByCompanion.map((row) => [row.companion?.name ?? null, row.amount])).toEqual([
      ['Pareja', 1_200_000],
      ['Amigos', 150_000],
      [null, 90_000],
    ]);
    expect(r.expenseByCompanion.reduce((s, row) => s + row.amount, 0)).toBe(r.totals.expense);
    expect(r.totals.expense).toBe(1_440_000);
    expect(r.companionMonths).toHaveLength(1);
    expect(r.companionMonths[0]!.items.reduce((s, i) => s + i.amount, 0)).toBe(
      r.months[0]!.expense,
    );
  });

  it('spans months for a longer period', async () => {
    const { api, who } = await userWithWho();
    const r = await report(api, 'from=2026-09-01&to=2026-10-20');
    expect(r.companionMonths.map((m) => m.month)).toEqual(['2026-09', '2026-10']);
    expect(r.companionMonths[0]!.items).toEqual([{ companionId: who('Amigos'), amount: 70_000 }]);
    expect(r.expenseByCompanion.find((row) => row.companion?.name === 'Amigos')?.amount).toBe(
      220_000,
    );
  });

  it('marks a deleted option and never mixes users', async () => {
    const { api, who } = await userWithWho();
    expect((await api.del(`/api/companions/${who('Pareja')}`)).body).toEqual({ deleted: 'soft' });
    const r = await report(api);
    expect(r.expenseByCompanion[0]!.companion).toMatchObject({ name: 'Pareja', isActive: false });
    const other = await registerUser(app);
    const theirs = await report(other.api);
    expect(theirs.expenseByCompanion).toEqual([]);
    expect(theirs.companionMonths).toEqual([{ month: '2026-10', items: [] }]);
  });
});

describe('GET /api/reports/export — who (spec con quién §4.4)', () => {
  const download = (cookie: string, query: string) =>
    app.inject({
      method: 'GET',
      url: `/api/reports/export?${query}`,
      cookies: { [SESSION_COOKIE]: cookie },
    });

  it('writes the "Con quién" column and the "Por compañía" sheet', async () => {
    const { cookie } = await userWithWho();
    const csv = await download(cookie, 'preset=THIS_MONTH&format=csv');
    expect(csv.statusCode).toBe(200);
    const lines = csv.body.slice(1).split('\r\n');
    expect(lines[0]!.split(';').slice(4, 7)).toEqual(['Subcategoría', 'Con quién', 'Cuenta']);
    const asado = lines.find((l) => l.includes(';Asado;'))!;
    expect(asado.split(';')[5]).toBe('Amigos');

    const xlsx = await download(cookie, 'preset=THIS_MONTH&format=xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(xlsx.rawPayload).buffer);
    const sheet = wb.getWorksheet('Por compañía')!;
    const rows = [2, 3, 4].map((n) => (sheet.getRow(n).values as unknown[]).slice(1));
    expect(rows).toEqual([
      ['Pareja', 1_200_000, 0.8333],
      ['Amigos', 150_000, 0.1042],
      ['Sin indicar', 90_000, 0.0625],
    ]);
  });
});
