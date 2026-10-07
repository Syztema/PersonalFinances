import {
  PAYMENT_METHOD_LABELS,
  type CategoryDTO,
  type PaymentMethod,
  type TransactionDTO,
} from '@finanzas/shared';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chips } from '../../components/ui/Chips';
import { Field, Select, TextArea, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { Icon } from '../../lib/icons';
import { useAccounts, useCards, useCategories } from '../../lib/queries';
import { readJSON, writeJSON } from '../../lib/storage';
import { useToday } from '../auth/useAuth';
import { DateChips } from './DateChips';
import { NeedsAccount } from './NeedsAccount';
import { toFormErrors } from '../../lib/formErrors';
import { useSaveTransaction } from './useSaveTransaction';

type Source = { kind: 'account' | 'card'; id: string };

interface Props {
  mode: 'expense' | 'income';
  /** "Compra con tarjeta" desde el menú: preselecciona la primera tarjeta. */
  preferCard?: boolean;
  presetCardId?: string;
  edit?: TransactionDTO;
  onDone: () => void;
}

const LAST_SOURCE = 'fz:lastSource';
const CATEGORY_USE = 'fz:categoryUse';
const sourceKey = (s: Source) => `${s.kind}:${s.id}`;

function initialSource(
  edit: TransactionDTO | undefined,
  presetCardId: string | undefined,
): Source | null {
  if (edit?.creditCard) return { kind: 'card', id: edit.creditCard.id };
  if (edit?.account) return { kind: 'account', id: edit.account.id };
  if (presetCardId) return { kind: 'card', id: presetCardId };
  return null;
}

export function TransactionForm({ mode, preferCard, presetCardId, edit, onDone }: Props) {
  const today = useToday();
  const accounts = useAccounts();
  const cards = useCards();
  const categories = useCategories();
  const save = useSaveTransaction(
    edit ? 'Movimiento actualizado' : mode === 'income' ? 'Ingreso guardado' : 'Gasto guardado',
  );

  const [amount, setAmount] = useState<number | null>(edit?.amount ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(edit?.category?.id ?? null);
  const [chosenSource, setChosenSource] = useState<Source | null>(
    initialSource(edit, presetCardId),
  );
  const [date, setDate] = useState(edit?.date ?? today);
  const [description, setDescription] = useState(edit?.description ?? '');
  const [payee, setPayee] = useState(edit?.payee ?? '');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const [tags, setTags] = useState(edit?.tags.join(', ') ?? '');
  const [installments, setInstallments] = useState(String(edit?.installments ?? 1));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(edit?.paymentMethod ?? '');
  const [showMore, setShowMore] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const kind = mode === 'income' ? 'INCOME' : 'EXPENSE';
  const activeAccounts = (accounts.data ?? []).filter(
    (a) => a.isActive || a.id === edit?.account?.id,
  );
  const activeCards =
    mode === 'expense'
      ? (cards.data ?? []).filter((c) => c.isActive || c.id === edit?.creditCard?.id)
      : [];

  const allSources = [
    ...activeAccounts.map((a) => ({
      source: { kind: 'account', id: a.id } as Source,
      label: a.name,
      icon: a.icon,
    })),
    ...activeCards.map((c) => ({
      source: { kind: 'card', id: c.id } as Source,
      label: c.name,
      icon: 'credit-card',
    })),
  ];
  // En edición el tipo no cambia: un gasto con cuenta no puede volverse compra con tarjeta, ni al revés.
  const sources = edit
    ? allSources.filter(
        (s) => s.source.kind === (edit.type === 'CARD_PURCHASE' ? 'card' : 'account'),
      )
    : allSources;

  const remembered = readJSON<Source | null>(LAST_SOURCE, null);
  const isAvailable = (s: Source | null): s is Source =>
    !!s && sources.some((o) => sourceKey(o.source) === sourceKey(s));
  const firstCard = sources.find((s) => s.source.kind === 'card')?.source ?? null;
  const source =
    (isAvailable(chosenSource) ? chosenSource : null) ??
    (preferCard ? firstCard : null) ??
    (isAvailable(remembered) ? remembered : null) ??
    sources[0]?.source ??
    null;

  const usage = readJSON<Record<string, number>>(CATEGORY_USE, {});
  const kindCategories = (categories.data ?? [])
    .filter((c) => c.kind === kind && !c.isSystem && (c.isActive || c.id === edit?.category?.id))
    .sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0) || a.sortOrder - b.sortOrder);
  const roots = kindCategories.filter((c) => !c.parentId);
  const selected = kindCategories.find((c) => c.id === categoryId);
  const rootId = selected?.parentId ?? selected?.id ?? null;
  const children = kindCategories.filter((c) => c.parentId && c.parentId === rootId);
  const visibleRoots = showAllCategories ? roots : roots.slice(0, 8);
  if (rootId && !visibleRoots.some((c) => c.id === rootId)) {
    const root = roots.find((c) => c.id === rootId);
    if (root) visibleRoots.push(root);
  }

  if (accounts.isPending || categories.isPending || (mode === 'expense' && cards.isPending))
    return <PageSpinner />;
  if (edit && edit.type !== 'EXPENSE' && edit.type !== 'CARD_PURCHASE' && edit.type !== 'INCOME') {
    return <EmptyState title="Este movimiento no se puede editar desde aquí." />;
  }
  if (preferCard && !edit && activeCards.length === 0)
    return (
      <EmptyState
        title="No tienes tarjetas registradas"
        description="Agrégalas en Más → Tarjetas."
      />
    );
  if (activeAccounts.length === 0 && activeCards.length === 0)
    return <NeedsAccount onNavigate={onDone} />;

  const isCard = source?.kind === 'card';
  const categoryOption = (c: CategoryDTO) => ({
    value: c.id,
    label: c.name,
    icon: <Icon name={c.icon} size={16} />,
  });

  const submit = () => {
    const next: Record<string, string> = {};
    if (!amount) next.amount = 'Escribe un valor mayor que $0';
    if (!categoryId) next.categoryId = 'Elige una categoría';
    if (!source)
      next.source =
        mode === 'income' ? 'Elige la cuenta donde lo recibiste' : 'Elige con qué pagaste';
    const n = Number(installments);
    if (isCard && (!Number.isInteger(n) || n < 1 || n > 48))
      next.installments = 'Entre 1 y 48 cuotas';
    setErrors(next);
    if (Object.keys(next).length > 0 || !source || !amount || !categoryId) return;

    const common = {
      amount,
      date,
      categoryId,
      description: description || null,
      notes: notes || null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const body =
      mode === 'income'
        ? { type: 'INCOME', ...common, accountId: source.id, payee: payee || null }
        : isCard
          ? {
              type: 'CARD_PURCHASE',
              ...common,
              creditCardId: source.id,
              installments: n,
              ...(edit ? { payee: edit.payee } : {}),
            }
          : {
              type: 'EXPENSE',
              ...common,
              accountId: source.id,
              paymentMethod: paymentMethod || null,
              ...(edit ? { payee: edit.payee } : {}),
            };

    save.submit(
      edit
        ? { path: `/transactions/${edit.id}`, method: 'PUT', body }
        : { path: '/transactions', method: 'POST', body },
      {
        onSuccess: () => {
          writeJSON(LAST_SOURCE, source);
          writeJSON(CATEGORY_USE, { ...usage, [categoryId]: (usage[categoryId] ?? 0) + 1 });
          onDone();
        },
        onError: (err) =>
          setErrors(
            toFormErrors(err, [
              'amount',
              'categoryId',
              'source',
              'accountId',
              'creditCardId',
              'installments',
              'date',
            ]),
          ),
      },
    );
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <MoneyInput
          aria-label="Valor"
          size="lg"
          autoFocus={!edit}
          value={amount}
          onChange={setAmount}
        />
        {errors.amount && <p className="mt-1 text-center text-sm text-negative">{errors.amount}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Categoría</p>
        <Chips
          ariaLabel="Categoría"
          value={rootId}
          onChange={setCategoryId}
          options={visibleRoots.map(categoryOption)}
        />
        {roots.length > 8 && !showAllCategories && (
          <button
            type="button"
            className="text-sm text-primary"
            onClick={() => setShowAllCategories(true)}
          >
            Ver todas las categorías
          </button>
        )}
        {children.length > 0 && (
          <Chips
            ariaLabel="Subcategoría"
            value={selected?.parentId ? selected.id : null}
            onChange={setCategoryId}
            options={children.map(categoryOption)}
          />
        )}
        {errors.categoryId && <p className="text-sm text-negative">{errors.categoryId}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{mode === 'income' ? 'Recibido en' : 'Pagado con'}</p>
        <Chips
          ariaLabel={mode === 'income' ? 'Cuenta' : 'Medio de pago'}
          value={source ? sourceKey(source) : null}
          onChange={(key) =>
            setChosenSource(sources.find((s) => sourceKey(s.source) === key)?.source ?? null)
          }
          options={sources.map((s) => ({
            value: sourceKey(s.source),
            label: s.label,
            icon: <Icon name={s.icon} size={16} />,
          }))}
        />
        {errors.source && <p className="text-sm text-negative">{errors.source}</p>}
        {errors.accountId && <p className="text-sm text-negative">{errors.accountId}</p>}
        {errors.creditCardId && <p className="text-sm text-negative">{errors.creditCardId}</p>}
      </div>

      {isCard && (
        <Field
          label="Cuotas"
          htmlFor="installments"
          error={errors.installments}
          hint="El gasto se cuenta completo hoy; las cuotas solo estiman tu pago mensual."
        >
          <TextInput
            id="installments"
            inputMode="numeric"
            value={installments}
            onChange={(e) => setInstallments(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Fecha</p>
        <DateChips value={date} onChange={setDate} today={today} />
        {errors.date && <p className="text-sm text-negative">{errors.date}</p>}
      </div>

      <Field label="Descripción (opcional)" htmlFor="description">
        <TextInput
          id="description"
          maxLength={140}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="flex items-center gap-1 text-sm text-primary"
      >
        Más opciones <ChevronDown size={16} className={showMore ? 'rotate-180' : ''} />
      </button>
      {showMore && (
        <div className="space-y-4">
          {mode === 'income' && (
            <Field label="Fuente (empresa, cliente…)" htmlFor="payee">
              <TextInput
                id="payee"
                maxLength={80}
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
              />
            </Field>
          )}
          {mode === 'expense' && !isCard && (
            <Field
              label="Método de pago"
              htmlFor="method"
              hint="Opcional: por defecto se usa el tipo de cuenta."
            >
              <Select
                id="method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | '')}
              >
                <option value="">Según la cuenta</option>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field
            label="Etiquetas"
            htmlFor="tags"
            hint="Separadas por comas, por ejemplo: trabajo, viaje"
          >
            <TextInput id="tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <Field label="Notas" htmlFor="notes">
            <TextArea
              id="notes"
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>
      )}

      {errors._ && (
        <p role="alert" className="text-sm text-negative">
          {errors._}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 bg-surface px-4 pt-2 pb-1">
        <Button type="submit" size="lg" loading={save.isPending}>
          Guardar
        </Button>
      </div>
    </form>
  );
}
