import type { UserDTO } from '@finanzas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle } from '../../components/ui/Card';
import { Field, TextInput } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { qk } from '../../lib/queries';

/** Cambiar el email exige la contraseña actual; el servidor cierra las otras sesiones. */
export function EmailCard({ user }: { user: UserDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const unchanged = email.trim().toLowerCase() === user.email.toLowerCase();
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => api.patch<{ user: UserDTO }>('/me', { email, currentPassword: password }),
    onSuccess: ({ user: updated }) => {
      queryClient.setQueryData(qk.me, updated);
      setEmail('');
      setPassword('');
      setFields({});
      toast.show({ message: 'Email actualizado. Cerramos tus otras sesiones.' });
    },
    onError: (err) =>
      setFields(
        err instanceof ApiError
          ? toFormErrors(err, ['email', 'currentPassword'])
          : { _: 'No se pudo cambiar el email' },
      ),
  });
  return (
    <Card>
      <CardTitle>Email</CardTitle>
      <p className="mt-1 text-sm text-muted">Actual: {user.email}</p>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!save.isPending && !unchanged) save.mutate();
        }}
      >
        <Field
          label="Nuevo email"
          htmlFor="new-email"
          error={fields.email ?? (unchanged ? 'Ese ya es tu email.' : undefined)}
        >
          <TextInput
            id="new-email"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field
          label="Contraseña actual para confirmar"
          htmlFor="email-password"
          error={fields.currentPassword}
        >
          <TextInput
            id="email-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {fields._ && (
          <p role="alert" className="text-sm text-negative">
            {fields._}
          </p>
        )}
        <Button
          type="submit"
          loading={save.isPending}
          disabled={!email.trim() || !password || unchanged}
        >
          Cambiar email
        </Button>
      </form>
    </Card>
  );
}
