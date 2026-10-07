import {
  BUCKET_LABELS,
  BUCKETS,
  type Bucket,
  type CategoryDTO,
  type CategoryKind,
} from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { ColorPicker, IconPicker } from '../../components/ui/Pickers';
import { Sheet } from '../../components/ui/Sheet';
import { api, type ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { useCategories } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: CategoryKind;
  category?: CategoryDTO;
}

export function CategoryFormSheet({ open, onOpenChange, kind, category }: Props) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={category ? 'Editar categoría' : 'Nueva categoría'}
    >
      {open && (
        <CategoryForm
          kind={category?.kind ?? kind}
          category={category}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Sheet>
  );
}

function CategoryForm({
  kind,
  category,
  onDone,
}: {
  kind: CategoryKind;
  category?: CategoryDTO;
  onDone: () => void;
}) {
  const categories = useCategories();
  const [name, setName] = useState(category?.name ?? '');
  const [parentId, setParentId] = useState(category?.parentId ?? '');
  const [bucket, setBucket] = useState<Bucket>(category?.bucket ?? 'OTHER');
  const [bucketTouched, setBucketTouched] = useState(false);
  const [icon, setIcon] = useState(category?.icon ?? 'tag');
  const [color, setColor] = useState(category?.color ?? '#64748b');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const parents = (categories.data ?? []).filter(
    (c) => c.kind === kind && !c.parentId && !c.isSystem && c.id !== category?.id,
  );
  const parentBucket = parents.find((p) => p.id === parentId)?.bucket;
  const shownBucket = !category && !bucketTouched && parentBucket ? parentBucket : bucket;
  const save = useCrudMutation(
    (body: Record<string, unknown>) =>
      category ? api.put(`/categories/${category.id}`, body) : api.post('/categories', body),
    category ? 'Categoría actualizada' : 'Categoría creada',
  );
  const archive = useCrudMutation(
    () => api.put(`/categories/${category!.id}`, { isActive: !category!.isActive }),
    category?.isActive ? 'Categoría archivada' : 'Categoría reactivada',
  );
  const remove = useCrudMutation(
    () => api.del(`/categories/${category!.id}`),
    'Categoría eliminada',
  );
  const onError = (err: ApiError) => {
    const mapped = toFormErrors(err, ['name', 'parentId']);
    setFields(mapped);
    setError(mapped._ ?? null);
  };

  const submit = () => {
    if (!name.trim()) return setFields({ name: 'Escribe un nombre' });
    const common = {
      name,
      parentId: parentId || null,
      icon,
      color,
      // Subcategoría nueva sin tocar la bolsa: el servidor la hereda de la principal.
      ...(kind === 'EXPENSE' && (category || !parentId || bucketTouched) && { bucket }),
    };
    save.mutate(category ? common : { ...common, kind }, { onSuccess: onDone, onError });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Nombre" htmlFor="cat-name" error={fields.name}>
        <TextInput
          id="cat-name"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        label="Categoría principal (opcional)"
        htmlFor="cat-parent"
        error={fields.parentId}
        hint="Déjala vacía para crear una categoría principal."
      >
        <Select id="cat-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Ninguna</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      {kind === 'EXPENSE' && (
        <Field
          label="Bolsa"
          htmlFor="cat-bucket"
          hint="Se usa para comparar con tus porcentajes objetivo."
        >
          <Select
            id="cat-bucket"
            value={shownBucket}
            onChange={(e) => {
              setBucket(e.target.value as Bucket);
              setBucketTouched(true);
            }}
          >
            {BUCKETS.map((b) => (
              <option key={b} value={b}>
                {BUCKET_LABELS[b]}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="space-y-2">
        <p className="text-sm font-medium">Ícono</p>
        <IconPicker value={icon} onChange={setIcon} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Color</p>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar categoría
      </Button>
      {category && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            loading={archive.isPending}
            onClick={() => archive.mutate(undefined, { onSuccess: onDone, onError })}
          >
            {category.isActive ? 'Archivar' : 'Reactivar'}
          </Button>
          <ConfirmButton
            disabled={!!category.systemKey}
            loading={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}
          >
            Eliminar
          </ConfirmButton>
        </div>
      )}
    </form>
  );
}
