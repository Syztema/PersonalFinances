import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { api, ApiError } from '../../lib/api';
import { AuthShell, Notice } from './AuthShell';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  // El token llega después de "#": nunca viaja al servidor ni queda en sus logs.
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token'));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const reset = useMutation({
    mutationFn: () => api.post('/auth/reset-password', { token, password }),
    onSuccess: () =>
      navigate('/login', {
        replace: true,
        state: { message: 'Tu contraseña se actualizó. Inicia sesión.' },
      }),
  });
  const error = reset.error instanceof ApiError ? reset.error : null;

  if (!token) {
    return (
      <AuthShell title="Enlace inválido">
        <Notice tone="warning">El enlace no es válido o está incompleto.</Notice>
        <Link className="text-primary" to="/forgot-password">
          Solicitar un nuevo enlace
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Nueva contraseña">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (password !== confirm) return setMismatch(true);
          setMismatch(false);
          reset.mutate();
        }}
      >
        <Field
          label="Nueva contraseña"
          htmlFor="password"
          error={error?.fields?.password}
          hint="Mínimo 8 caracteres."
        >
          <TextInput
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field
          label="Repite la contraseña"
          htmlFor="confirm"
          error={mismatch ? 'Las contraseñas no coinciden' : undefined}
        >
          <TextInput
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {error && !error.fields && (
          <p role="alert" className="text-sm text-negative">
            {error.message}
          </p>
        )}
        <Button type="submit" size="lg" loading={reset.isPending}>
          Guardar contraseña
        </Button>
      </form>
    </AuthShell>
  );
}
