import {
  adjustBalanceSchema,
  cardPaymentBodySchema,
  cardPurchaseBodySchema,
  debtDisbursementSchema,
  debtPaymentSchema,
  transactionListQuerySchema,
  transactionSchema,
  transferBodySchema,
  type TransactionInput,
} from '@finanzas/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parse, parseId } from '../../lib/validation';
import { findCreditCard } from '../credit-cards/service';
import { findDebt } from '../debts/service';
import { adjustBalance } from './adjust';
import { listTransactions } from './list';
import { createTransaction, deleteTransaction, getTransaction, updateTransaction } from './service';

export async function transactionRoutes(app: FastifyInstance) {
  const create = async (req: FastifyRequest, reply: FastifyReply, input: TransactionInput) =>
    reply.status(201).send(await createTransaction(app.prisma, req.auth, input));

  app.post('/transactions', async (req, reply) =>
    create(req, reply, parse(transactionSchema, req.body)),
  );

  app.post('/accounts/:id/adjust', async (req, reply) =>
    reply
      .status(201)
      .send(
        await adjustBalance(
          app.prisma,
          req.auth,
          parseId(req.params),
          parse(adjustBalanceSchema, req.body),
        ),
      ),
  );

  app.get('/transactions', async (req) =>
    listTransactions(app.prisma, req.auth.userId, parse(transactionListQuerySchema, req.query)),
  );

  app.put('/transactions/:id', async (req) =>
    updateTransaction(
      app.prisma,
      req.auth,
      parseId(req.params),
      parse(transactionSchema, req.body),
    ),
  );

  app.get('/transactions/:id', async (req) => ({
    transaction: await getTransaction(app.prisma, req.auth.userId, parseId(req.params)),
  }));

  app.delete('/transactions/:id', async (req, reply) => {
    await deleteTransaction(app.prisma, req.auth.userId, parseId(req.params));
    return reply.status(204).send();
  });

  app.post('/transfers', async (req, reply) =>
    create(req, reply, { type: 'TRANSFER', ...parse(transferBodySchema, req.body) }),
  );

  app.post('/credit-cards/:id/purchase', async (req, reply) => {
    const card = await findCreditCard(app.prisma, req.auth.userId, parseId(req.params));
    return create(req, reply, {
      type: 'CARD_PURCHASE',
      creditCardId: card.id,
      ...parse(cardPurchaseBodySchema, req.body),
    });
  });

  app.post('/credit-cards/:id/payment', async (req, reply) => {
    const card = await findCreditCard(app.prisma, req.auth.userId, parseId(req.params));
    return create(req, reply, {
      type: 'CARD_PAYMENT',
      creditCardId: card.id,
      ...parse(cardPaymentBodySchema, req.body),
    });
  });

  app.post('/debts/:id/payments', async (req, reply) => {
    const debt = await findDebt(app.prisma, req.auth.userId, parseId(req.params));
    const body = parse(debtPaymentSchema, req.body);
    return create(req, reply, {
      type: 'DEBT_PAYMENT',
      debtId: debt.id,
      accountId: body.accountId,
      amount: body.principal,
      interest: body.interest,
      date: body.date,
      description: body.description,
      payee: null,
      notes: null,
      tags: [],
    });
  });

  app.post('/debts/:id/disbursements', async (req, reply) => {
    const debt = await findDebt(app.prisma, req.auth.userId, parseId(req.params));
    const body = parse(debtDisbursementSchema, req.body);
    return create(req, reply, {
      type: 'DEBT_DISBURSEMENT',
      debtId: debt.id,
      accountId: body.accountId,
      amount: body.amount,
      date: body.date,
      description: body.description,
      payee: null,
      notes: null,
      tags: [],
    });
  });
}
