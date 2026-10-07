import type { UserDTO } from '@finanzas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle } from '../../components/ui/Card';
import { Field, TextInput } from '../../components/ui/Field';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { qk } from '../../lib/queries';
import { useLogout, useMe } from '../auth/useAuth';
import { DeleteAccountCard } from './DeleteAccountCard';
import { EmailCard } from './EmailCard';
import { ThemeCard } from './ThemeCard';

export function ProfilePage() {
  const me = useMe();
  if (!me.data) return <PageSpinner />;
  return <ProfileContent user={me.data} />;
}

function ProfileContent({ user }: { user: UserDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const logout = useLogout();
  const [name, setName] = useState(user.name);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const updateName = useMutation({
    mutationFn: () => api.patch<{ user: UserDTO }>('/me', { name }),
    onSuccess: ({ user: updated }) => {
      queryClient.setQueryData(qk.me, updated);
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      setNameError(null);
      toast.show({ message: 'Nombre actualizado' });
    },
    onError: (err) =>
      setNameError(err instanceof ApiError ? err.message : 'No se pudo guardar el nombre'),
  });
  const changePassword = useMutation({
    mutationFn: () =>
      api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setConfirm('');
      setPasswordError(null);
      toast.show({ message: 'Contraseña actualizada. Cerramos tus otras sesiones.' });
    },
    onError: (err) =>
      setPasswordError(
        err instanceof ApiError
          ? (err.fields?.currentPassword ?? err.fields?.newPassword ?? err.message)
          : 'No se pudo cambiar',
      ),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Perfil y seguridad</h1>
      <ThemeCard user={user} />
      <Card>
        <CardTitle>Tus datos</CardTitle>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            updateName.mutate();
          }}
        >
          <Field label="Nombre" htmlFor="profile-name">
            <TextInput
              id="profile-name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {nameError && (
            <p role="alert" className="text-sm text-negative">
              {nameError}
            </p>
          )}
          <Button
            type="submit"
            loading={updateName.isPending}
            disabled={!name.trim() || name === user.name}
          >
            Guardar nombre
          </Button>
        </form>
      </Card>
      <EmailCard user={user} />
      <Card>
        <CardTitle>Cambiar contraseña</CardTitle>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (next !== confirm) return setPasswordError('Las contraseñas nuevas no coinciden');
            changePassword.mutate();
          }}
        >
          <Field label="Contraseña actual" htmlFor="pw-current">
            <TextInput
              id="pw-current"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="Nueva contraseña" htmlFor="pw-new" hint="Mínimo 8 caracteres.">
            <TextInput
              id="pw-new"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Repite la nueva contraseña" htmlFor="pw-confirm">
            <TextInput
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {passwordError && (
            <p role="alert" className="text-sm text-negative">
              {passwordError}
            </p>
          )}
          <Button type="submit" loading={changePassword.isPending}>
            Cambiar contraseña
          </Button>
        </form>
      </Card>
      <Button
        variant="secondary"
        size="lg"
        loading={logout.isPending}
        onClick={() => logout.mutate()}
      >
        Cerrar sesión
      </Button>
      <DeleteAccountCard />
    </div>
  );
}
