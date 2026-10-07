import type { TagDTO } from '@finanzas/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Field, TextInput } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { qk } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';

export function TagsList() {
  const tags = useQuery({
    queryKey: qk.tags,
    queryFn: () => api.get<{ items: TagDTO[] }>('/tags').then((r) => r.items),
  });
  const [editing, setEditing] = useState<TagDTO | null>(null);
  if (tags.isPending) return <PageSpinner />;
  if (tags.isError) return <ErrorState error={tags.error} onRetry={() => void tags.refetch()} />;
  if (tags.data.length === 0)
    return (
      <EmptyState
        title="Aún no usas etiquetas"
        description="Agrégalas al registrar un movimiento, en Más opciones."
      />
    );
  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        {tags.data.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setEditing(t)}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left"
            >
              <span className="font-medium">#{t.name}</span>
              <span className="text-xs text-muted">
                {t.usageCount === 1 ? '1 movimiento' : `${t.usageCount} movimientos`}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Sheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Editar etiqueta"
      >
        {editing && <TagForm tag={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function TagForm({ tag, onDone }: { tag: TagDTO; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(tag.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useCrudMutation(
    (body: { name: string }) => api.put(`/tags/${tag.id}`, body),
    'Etiqueta actualizada',
  );
  const remove = useCrudMutation(() => api.del(`/tags/${tag.id}`), 'Etiqueta eliminada');
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setNameError('Escribe un nombre');
        setError(null);
        save.mutate(
          { name },
          {
            onSuccess: onDone,
            onError: (err) => {
              if (err.code === 'TAG_NAME_TAKEN' || err.fields?.name) {
                setNameError(err.fields?.name ?? err.message);
              } else {
                setError(err.message);
              }
            },
          },
        );
      }}
    >
      <Field label="Nombre de la etiqueta" htmlFor="tag-name" error={nameError ?? undefined}>
        <TextInput
          id="tag-name"
          maxLength={30}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar etiqueta
      </Button>
      <ConfirmButton
        size="lg"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: onDone,
            onError: (err) => toast.show({ message: err.message, tone: 'error' }),
          })
        }
      >
        Eliminar etiqueta
      </ConfirmButton>
      <p className="text-xs text-muted">Al eliminarla se quita de los movimientos que la usan.</p>
    </form>
  );
}
