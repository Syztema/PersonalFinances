import type { CompanionDTO, DeleteResultDTO } from '@finanzas/shared';
import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, TextInput } from '../../components/ui/Field';
import { ColorPicker, IconPicker } from '../../components/ui/Pickers';
import { Sheet } from '../../components/ui/Sheet';
import { api, type ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { useCrudMutation } from '../../lib/useCrud';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companion?: CompanionDTO;
}

export function CompanionFormSheet({ open, onOpenChange, companion }: Props) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={companion ? 'Editar opción' : 'Nueva opción'}
    >
      {open && <CompanionForm companion={companion} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function CompanionForm({ companion, onDone }: { companion?: CompanionDTO; onDone: () => void }) {
  const [name, setName] = useState(companion?.name ?? '');
  const [icon, setIcon] = useState(companion?.icon ?? 'user');
  const [color, setColor] = useState(companion?.color ?? '#64748b');
  const [fields, setFields] = useState<Record<string, string>>({});
  // Un doble toque nunca envía dos veces (la mutación tarda un render en quedar "pendiente").
  const sending = useRef(false);
  const save = useCrudMutation(
    (body: { name: string; icon: string; color: string }) =>
      companion ? api.put(`/companions/${companion.id}`, body) : api.post('/companions', body),
    companion ? 'Opción actualizada' : 'Opción creada',
  );
  const remove = useCrudMutation(
    () => api.del<DeleteResultDTO>(`/companions/${companion!.id}`),
    (r) =>
      r.deleted === 'soft' ? 'Opción eliminada: se conserva en tus gastos' : 'Opción eliminada',
  );
  const onError = (err: ApiError) =>
    setFields(
      err.code === 'COMPANION_NAME_TAKEN'
        ? { name: err.message }
        : toFormErrors(err, ['name', 'icon', 'color']),
    );

  const submit = () => {
    if (sending.current) return;
    if (!name.trim()) return setFields({ name: 'Escribe un nombre' });
    sending.current = true;
    setFields({});
    save.mutate(
      { name, icon, color },
      {
        onSuccess: onDone,
        onError,
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Nombre" htmlFor="companion-name" error={fields.name}>
        <TextInput
          id="companion-name"
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Ícono</p>
        <IconPicker value={icon} onChange={setIcon} />
        {fields.icon && <p className="text-sm text-negative">{fields.icon}</p>}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Color</p>
        <ColorPicker value={color} onChange={setColor} />
        {fields.color && <p className="text-sm text-negative">{fields.color}</p>}
      </div>
      {fields._ && (
        <p role="alert" className="text-sm text-negative">
          {fields._}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar opción
      </Button>
      {companion && (
        <div className="space-y-2">
          <ConfirmButton
            size="lg"
            loading={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}
          >
            Eliminar opción
          </ConfirmButton>
          <p className="text-xs text-muted">
            Si ya la usaste en algún gasto, se conserva en tu historial marcada como eliminada y
            puedes restaurarla.
          </p>
        </div>
      )}
    </form>
  );
}
