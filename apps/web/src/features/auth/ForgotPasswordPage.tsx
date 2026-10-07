import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { api, ApiError } from '../../lib/api';
import { AuthShell, Notice } from './AuthShell';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const forgot = useMutation({
    mutationFn: () => api.post<{ message: string }>('/auth/forgot-password', { email }),
  });
  const error = forgot.error instanceof ApiError ? forgot.error : null;

  return (
    <AuthShell title="Recupera tu contraseña" subtitle="Te enviaremos un enlace a tu email.">
      {forgot.isSuccess ? (
        <Notice>{forgot.data.message}</Notice>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            forgot.mutate();
          }}
        >
          <Field
            label="Email"
            htmlFor="email"
            error={error?.fields?.email ?? (error && !error.fields ? error.message : undefined)}
          >
            <TextInput
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button type="submit" size="lg" loading={forgot.isPending}>
            Enviar enlace
          </Button>
        </form>
      )}
      <p className="mt-4 text-sm">
        <Link className="text-primary" to="/login">
          Volver a iniciar sesión
        </Link>
      </p>
    </AuthShell>
  );
}
