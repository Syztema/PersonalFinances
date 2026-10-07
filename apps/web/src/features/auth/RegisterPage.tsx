import { useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { ApiError } from '../../lib/api';
import { AuthShell } from './AuthShell';
import { useRegister } from './useAuth';

export function RegisterPage() {
  const register = useRegister();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const error = register.error instanceof ApiError ? register.error : null;
  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <AuthShell title="Crea tu cuenta" subtitle="Empieza a controlar tus finanzas en COP.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          register.mutate(form, { onSuccess: () => navigate('/dashboard', { replace: true }) });
        }}
      >
        <Field label="Nombre" htmlFor="name" error={error?.fields?.name}>
          <TextInput
            id="name"
            autoComplete="given-name"
            required
            value={form.name}
            onChange={set('name')}
          />
        </Field>
        <Field label="Email" htmlFor="email" error={error?.fields?.email}>
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={set('email')}
          />
        </Field>
        <Field
          label="Contraseña"
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
            value={form.password}
            onChange={set('password')}
          />
        </Field>
        {error && !error.fields && (
          <p role="alert" className="text-sm text-negative">
            {error.message}
          </p>
        )}
        <Button type="submit" size="lg" loading={register.isPending}>
          Crear cuenta
        </Button>
      </form>
      <p className="mt-4 text-sm">
        ¿Ya tienes cuenta?{' '}
        <Link className="text-primary" to="/login">
          Inicia sesión
        </Link>
      </p>
    </AuthShell>
  );
}
