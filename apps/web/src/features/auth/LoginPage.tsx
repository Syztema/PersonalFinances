import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { ApiError } from '../../lib/api';
import { AuthShell, Notice } from './AuthShell';
import { useLogin } from './useAuth';

interface LoginState {
  from?: string;
  expired?: boolean;
  message?: string;
}

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const state = (useLocation().state ?? null) as LoginState | null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const error = login.error instanceof ApiError ? login.error : null;

  return (
    <AuthShell title="Inicia sesión" subtitle="Tu dinero claro, en segundos.">
      {state?.expired && <Notice tone="warning">Tu sesión expiró. Inicia sesión de nuevo.</Notice>}
      {state?.message && <Notice>{state.message}</Notice>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate(
            { email, password },
            {
              onSuccess: () =>
                navigate(state?.from && state.from !== '/login' ? state.from : '/dashboard', {
                  replace: true,
                }),
            },
          );
        }}
      >
        <Field label="Email" htmlFor="email" error={error?.fields?.email}>
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Contraseña" htmlFor="password" error={error?.fields?.password}>
          <TextInput
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && !error.fields && (
          <p role="alert" className="text-sm text-negative">
            {error.message}
          </p>
        )}
        <Button type="submit" size="lg" loading={login.isPending}>
          Entrar
        </Button>
      </form>
      <div className="mt-4 flex justify-between gap-2 text-sm">
        <Link className="text-primary" to="/forgot-password">
          ¿Olvidaste tu contraseña?
        </Link>
        <Link className="text-primary" to="/register">
          Crear cuenta
        </Link>
      </div>
    </AuthShell>
  );
}
