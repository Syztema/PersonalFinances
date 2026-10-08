import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  PAYMENT_METHOD_LABELS,
  formatCOP,
  type CategoryDTO,
  type Frequency,
  type PaymentMethod,
  type ScheduledItemDTO,
  type TransactionDTO,
} from '@finanzas/shared';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chips } from '../../components/ui/Chips';
import { Field, Select, TextArea, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { EmptyState } from '../../components/ui/EmptyState';
import { FrozenNote } from '../../components/ui/FrozenNote';
import { PageSpinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { formatDate, formatShortDate } from '../../lib/format';
import { Icon } from '../../lib/icons';
import { useAccounts, useCards, useCategories } from '../../lib/queries';
import { frozenHolder, refName } from '../../lib/refs';
import { CATEGORY_USE_KEY, LAST_SOURCE_KEY, readJSON, writeJSON } from '../../lib/storage';
import { useToday } from '../auth/useAuth';
import { DateChips } from './DateChips';
import { NeedsAccount } from './NeedsAccount';
import { toFormErrors } from '../../lib/formErrors';
import { recurrencePayload, semimonthlyDays } from './recurrence';
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

const LAST_SOURCE = LAST_SOURCE_KEY;
const CATEGORY_USE = CATEGORY_USE_KEY;
const sourceKey = (s: Source) => `${s.kind}:${s.id}`;
// El servidor anida los errores de recurrencia bajo `recurring.*`.
const RECURRING_ERRORS = ['recurring', 'recurring.day1', 'recurring.day2', 'recurring.endDate'];
const RECURRING_FIELDS = ['interval', 'recurring.intervalDays', ...RECURRING_ERRORS];

/** Spec 8.11: ocurrencias pendientes de la misma categoría, ±20 % del valor y ±7 días. */
async function findSuggestions(
  kind: 'INCOME' | 'EXPENSE',
  categoryId: string,
  amount: number,
  date: string,
): Promise<ScheduledItemDTO[]> {
  const params = new URLSearchParams({ kind, categoryId, amount: String(amount), date });
  try {
    const result = await api.get<{ items: ScheduledItemDTO[] }>(`/scheduled/suggestions?${params}`);
    return result.items;
  } catch {
    return []; // sin sugerencias: se guarda normal (o se crea la regla)
  }
}

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
  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>('MONTHLY');
  const [intervalDays, setIntervalDays] = useState('30');
  const [suggestion, setSuggestion] = useState<{
    item: ScheduledItemDTO;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const yesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (suggestion) yesRef.current?.querySelector('button')?.focus();
  }, [suggestion]);
  // Cualquier cambio de datos invalida la sugerencia: el cuerpo ya no coincide con lo que se ve.
  const edited =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      setSuggestion(null);
      set(value);
    };

  const kind = mode === 'income' ? 'INCOME' : 'EXPENSE';
  // Movimiento de una cuenta o tarjeta eliminada: su dinero queda congelado (addendum §3.1).
  const frozen = frozenHolder(edit);
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
  // Al editar, elegir una tarjeta convierte el gasto en compra con tarjeta y viceversa (addendum §4).
  const sources = allSources;

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
    .filter((c) => c.kind === kind && (c.id === edit?.category?.id || (!c.isSystem && c.isActive)))
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
  const halves = semimonthlyDays(date);
  const categoryOption = (c: CategoryDTO) => ({
    value: c.id,
    label: refName(c) ?? c.name,
    icon: <Icon name={c.icon} size={16} />,
  });

  const send = (body: Record<string, unknown>, scheduledItemId: string | null) => {
    setSuggestion(null);
    save.submit(
      edit
        ? { path: `/transactions/${edit.id}`, method: 'PUT', body }
        : {
            path: '/transactions',
            method: 'POST',
            body: scheduledItemId ? { ...body, scheduledItemId } : body,
          },
      {
        onSuccess: () => {
          writeJSON(LAST_SOURCE, source);
          if (categoryId) {
            writeJSON(CATEGORY_USE, { ...usage, [categoryId]: (usage[categoryId] ?? 0) + 1 });
          }
          onDone();
        },
        onError: (err) => {
          if (Object.keys(err.fields ?? {}).some((k) => k.startsWith('recurring')))
            setShowMore(true);
          setErrors(
            toFormErrors(err, [
              'amount',
              'categoryId',
              'source',
              'accountId',
              'creditCardId',
              'installments',
              'date',
              ...RECURRING_FIELDS,
            ]),
          );
        },
      },
    );
  };

  /** Valida y arma el cuerpo con el estado ACTUAL del formulario (también al responder la sugerencia). */
  const build = (): Record<string, unknown> | null => {
    const next: Record<string, string> = {};
    if (!amount) next.amount = 'Escribe un valor mayor que $0';
    if (!categoryId) next.categoryId = 'Elige una categoría';
    if (!source)
      next.source =
        mode === 'income' ? 'Elige la cuenta donde lo recibiste' : 'Elige con qué pagaste';
    const n = Number(installments);
    if (isCard && (!Number.isInteger(n) || n < 1 || n > 48))
      next.installments = 'Entre 1 y 48 cuotas';
    const interval = Number(intervalDays);
    if (
      !edit &&
      repeat &&
      frequency === 'CUSTOM_DAYS' &&
      !(Number.isInteger(interval) && interval >= 1 && interval <= 366)
    )
      next.interval = 'Entre 1 y 366 días';
    setErrors(next);
    if (Object.keys(next).length > 0 || !source || !amount || !categoryId) return null;

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
    return mode === 'income'
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
  };

  /** Con "Recurrente" marcado, el cuerpo lleva la regla nueva (con la frecuencia que se ve ahora). */
  const withRecurrence = (body: Record<string, unknown>) =>
    repeat ? { ...body, recurring: recurrencePayload(frequency, date, intervalDays) } : body;

  /** Sí → se enlaza la ocurrencia, nunca con `recurring`; No → se guarda normal o se crea la regla. */
  const answer = (scheduledItemId: string | null) => {
    const body = build();
    if (!body) setSuggestion(null);
    else if (scheduledItemId) send(body, scheduledItemId);
    else send(withRecurrence(body), null);
  };

  const submit = async () => {
    if (checkingRef.current) return;
    const body = build();
    if (!body || !amount || !categoryId) return;
    if (edit) return send(body, null);

    checkingRef.current = true;
    setChecking(true);
    const items = await findSuggestions(kind, categoryId, amount, date);
    checkingRef.current = false;
    setChecking(false);
    // Fase 3, pendiente 4: con "Recurrente" solo cuenta una ocurrencia de una regla que ya existe.
    const found = repeat ? items.find((i) => i.recurringRuleId !== null) : items[0];
    if (found) setSuggestion({ item: found });
    else send(withRecurrence(body), null);
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset disabled={checking} className="min-w-0 space-y-5 border-0 p-0">
        {frozen && (
          <FrozenNote
            holder={frozen}
            editable={[
              'la categoría',
              'la descripción',
              'las etiquetas',
              ...(mode === 'income' ? ['la fuente'] : []),
              'las notas',
            ]}
          />
        )}
        <div>
          <MoneyInput
            aria-label="Valor"
            size="lg"
            autoFocus={!edit}
            disabled={!!frozen}
            value={amount}
            onChange={edited(setAmount)}
          />
          {errors.amount && (
            <p className="mt-1 text-center text-sm text-negative">{errors.amount}</p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Categoría</p>
          <Chips
            ariaLabel="Categoría"
            value={rootId}
            onChange={edited(setCategoryId)}
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
              onChange={edited(setCategoryId)}
              options={children.map(categoryOption)}
            />
          )}
          {errors.categoryId && <p className="text-sm text-negative">{errors.categoryId}</p>}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{mode === 'income' ? 'Recibido en' : 'Pagado con'}</p>
          {frozen ? (
            <p className="text-sm">{frozen.name} (eliminada)</p>
          ) : (
            <Chips
              ariaLabel={mode === 'income' ? 'Cuenta' : 'Medio de pago'}
              value={source ? sourceKey(source) : null}
              onChange={edited((key: string) =>
                setChosenSource(sources.find((s) => sourceKey(s.source) === key)?.source ?? null),
              )}
              options={sources.map((s) => ({
                value: sourceKey(s.source),
                label: s.label,
                icon: <Icon name={s.icon} size={16} />,
              }))}
            />
          )}
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
              disabled={!!frozen}
              onChange={(e) => setInstallments(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Fecha</p>
          {frozen ? (
            <p className="text-sm">{formatDate(date)}</p>
          ) : (
            <DateChips value={date} onChange={edited(setDate)} today={today} />
          )}
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
            {!edit && (
              <div className="space-y-3 rounded-2xl border border-border p-3">
                <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    checked={repeat}
                    onChange={(e) => edited(setRepeat)(e.target.checked)}
                  />
                  Recurrente (se repite)
                </label>
                {repeat && (
                  <>
                    <Field label="Frecuencia" htmlFor="frequency">
                      <Select
                        id="frequency"
                        value={frequency}
                        onChange={(e) => setFrequency(e.target.value as Frequency)}
                      >
                        {FREQUENCIES.map((f) => (
                          <option key={f} value={f}>
                            {FREQUENCY_LABELS[f]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {frequency === 'SEMIMONTHLY' && (
                      <p className="text-xs text-muted">
                        Los días {halves.day1} y {halves.day2 === 31 ? 'último' : halves.day2} de
                        cada mes.
                      </p>
                    )}
                    {frequency === 'CUSTOM_DAYS' && (
                      <Field
                        label="Cada cuántos días"
                        htmlFor="interval"
                        error={errors['recurring.intervalDays'] ?? errors.interval}
                      >
                        <TextInput
                          id="interval"
                          inputMode="numeric"
                          value={intervalDays}
                          onChange={(e) =>
                            setIntervalDays(e.target.value.replace(/\D/g, '').slice(0, 3))
                          }
                        />
                      </Field>
                    )}
                    {RECURRING_ERRORS.filter((k) => errors[k]).map((k) => (
                      <p key={k} className="text-sm text-negative">
                        {errors[k]}
                      </p>
                    ))}
                    <p className="text-xs text-muted">
                      Aparecerá en Recurrentes y obligaciones; las próximas veces solo tendrás que
                      confirmarlo.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {errors._ && (
          <p role="alert" className="text-sm text-negative">
            {errors._}
          </p>
        )}
        <div className="sticky bottom-0 -mx-4 bg-surface px-4 pt-2 pb-1">
          {suggestion ? (
            <div
              role="status"
              aria-label="Sugerencia de enlace"
              className="space-y-2 rounded-2xl bg-surface-2 p-3"
            >
              {repeat ? (
                <p className="text-sm">
                  Ya tienes «<strong>{suggestion.item.name}</strong>» como recurrente. ¿Es este{' '}
                  {kind === 'INCOME' ? 'ingreso' : 'pago'}?
                </p>
              ) : (
                <p className="text-sm">
                  {kind === 'INCOME' ? '¿Es el ingreso esperado ' : '¿Es el pago de '}
                  <strong>{suggestion.item.name}</strong> ({formatCOP(suggestion.item.amount)},{' '}
                  {formatShortDate(suggestion.item.dueDate)})?
                </p>
              )}
              <div ref={yesRef} className="grid grid-cols-2 gap-2">
                <Button requiresNetwork onClick={() => answer(suggestion.item.id)}>
                  Sí, enlazar
                </Button>
                <Button variant="secondary" requiresNetwork onClick={() => answer(null)}>
                  No, es otro
                </Button>
              </div>
            </div>
          ) : (
            <Button type="submit" size="lg" loading={save.isPending || checking}>
              Guardar
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
