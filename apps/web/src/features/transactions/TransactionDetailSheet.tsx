import { DERIVED_METHOD_LABELS, type TransactionDTO } from '@finanzas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Sheet } from '../../components/ui/Sheet';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { invalidateFinance } from '../../lib/queries';
import { refName } from '../../lib/refs';
import { useQuickAdd } from '../quick-add/QuickAddContext';
import { kindForTransaction } from '../quick-add/QuickAddSheets';
import { describeTransaction } from './describe';

export function TransactionDetailSheet({
  transaction,
  onClose,
}: {
  transaction: TransactionDTO | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { open } = useQuickAdd();
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/transactions/${id}`),
    onSuccess: async () => {
      await invalidateFinance(queryClient);
      toast.show({ message: 'Movimiento eliminado' });
      onClose();
    },
    onError: (err) =>
      toast.show({
        message: err instanceof ApiError ? err.message : 'No se pudo eliminar',
        tone: 'error',
      }),
  });
  if (!transaction) return null;
  const d = describeTransaction(transaction);
  const editKind = kindForTransaction(transaction);
  const rows: Array<[string, string | null | undefined]> = [
    ['Tipo', d.typeLabel],
    ['Fecha', formatDate(transaction.date)],
    ['Categoría', refName(transaction.category)],
    ['Con quién', refName(transaction.companion)],
    ['Cuenta', refName(transaction.account)],
    ['Cuenta destino', refName(transaction.toAccount)],
    ['Tarjeta', refName(transaction.creditCard)],
    ['Préstamo', refName(transaction.debt, '(eliminado)')],
    [
      'Cuotas',
      transaction.installments && transaction.installments > 1
        ? String(transaction.installments)
        : null,
    ],
    ['Método', transaction.method ? DERIVED_METHOD_LABELS[transaction.method] : null],
    ['Fuente / comercio', transaction.payee],
    ['Etiquetas', transaction.tags.join(', ') || null],
    ['Notas', transaction.notes],
  ];

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={d.title} description={d.subtitle}>
      <p className="text-center text-3xl font-semibold">
        <Amount value={transaction.amount} tone={d.tone} />
      </p>
      {transaction.interest > 0 && (
        <p className="mt-1 text-center text-sm text-muted">
          Intereses registrados como gasto aparte.
        </p>
      )}
      <dl className="mt-4 divide-y divide-border text-sm">
        {rows
          .filter(([, v]) => v)
          .map(([label, v]) => (
            <div key={label} className="flex justify-between gap-4 py-2">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
      </dl>
      {transaction.parentId ? (
        <p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm text-muted">
          Este gasto de intereses es parte de un pago de préstamo. Para cambiarlo, edita o elimina
          el pago principal.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              onClose();
              open({ kind: editKind, edit: transaction });
            }}
          >
            Editar
          </Button>
          <ConfirmButton loading={remove.isPending} onConfirm={() => remove.mutate(transaction.id)}>
            Eliminar
          </ConfirmButton>
        </div>
      )}
    </Sheet>
  );
}
