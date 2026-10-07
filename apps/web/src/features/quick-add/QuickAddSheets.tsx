import type { TransactionDTO } from '@finanzas/shared';
import { Sheet } from '../../components/ui/Sheet';
import { useDebts } from '../../lib/queries';
import { DisbursementForm } from '../debts/DisbursementSheet';
import { useQuickAdd, type QuickAddKind } from './QuickAddContext';
import { QuickAddMenu } from './QuickAddMenu';
import { PayCardForm } from './PayCardForm';
import { PayLoanForm } from './PayLoanForm';
import { TransactionForm } from './TransactionForm';
import { TransferForm } from './TransferForm';

const TITLES: Record<QuickAddKind, string> = {
  menu: '¿Qué quieres registrar?',
  expense: 'Nuevo gasto',
  income: 'Nuevo ingreso',
  transfer: 'Transferir dinero',
  'card-purchase': 'Compra con tarjeta',
  'card-payment': 'Pagar tarjeta',
  'loan-payment': 'Pagar préstamo',
  disbursement: 'Desembolso de préstamo',
};

export function kindForTransaction(t: TransactionDTO): QuickAddKind {
  switch (t.type) {
    case 'INCOME':
      return 'income';
    case 'TRANSFER':
      return 'transfer';
    case 'CARD_PAYMENT':
      return 'card-payment';
    case 'DEBT_PAYMENT':
      return 'loan-payment';
    case 'EXPENSE':
    case 'CARD_PURCHASE':
      return 'expense';
    case 'DEBT_DISBURSEMENT':
      return 'disbursement';
  }
}

export function QuickAddSheets() {
  const { request, open, close } = useQuickAdd();
  const debts = useDebts();
  const kind = request?.kind;
  const edit = request?.edit;
  const title = edit
    ? `Editar ${TITLES[kind ?? 'expense'].replace(/^Nuevo |^Nueva /, '').toLowerCase()}`
    : TITLES[kind ?? 'menu'];

  return (
    <Sheet open={request !== null} onOpenChange={(o) => !o && close()} title={title}>
      {kind === 'menu' && (
        <QuickAddMenu
          hasDebts={(debts.data ?? []).some((d) => d.isActive)}
          onPick={(k) => open({ kind: k })}
        />
      )}
      {kind === 'expense' && (
        <TransactionForm key="expense" mode="expense" edit={edit} onDone={close} />
      )}
      {kind === 'card-purchase' && (
        <TransactionForm
          key="card"
          mode="expense"
          preferCard
          presetCardId={request?.cardId}
          edit={edit}
          onDone={close}
        />
      )}
      {kind === 'income' && (
        <TransactionForm key="income" mode="income" edit={edit} onDone={close} />
      )}
      {kind === 'transfer' && <TransferForm edit={edit} onDone={close} />}
      {kind === 'card-payment' && (
        <PayCardForm cardId={request?.cardId} edit={edit} onDone={close} />
      )}
      {kind === 'loan-payment' && (
        <PayLoanForm debtId={request?.debtId} edit={edit} onDone={close} />
      )}
      {kind === 'disbursement' && edit && (
        <DisbursementForm debtId={edit.debt?.id ?? ''} edit={edit} onDone={close} />
      )}
    </Sheet>
  );
}
