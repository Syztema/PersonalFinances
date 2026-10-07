import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardTitle } from '../../components/ui/Card';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, TextInput } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { clearUserLocalData } from '../../lib/storage';

/** Irreversible: exige la contraseña y escribir ELIMINAR. */
export function DeleteAccountCard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: () => api.del('/me', { password, confirmation }),
    onSuccess: () => {
      queryClient.clear();
      clearUserLocalData();
      toast.show({ message: 'Eliminamos tu cuenta y todos tus datos.' });
      navigate('/login', { replace: true });
    },
    onError: (err) =>
      setError(
        err instanceof ApiError
          ? (err.fields?.password ?? err.message)
          : 'No se pudo eliminar la cuenta',
      ),
  });
  return (
    <Card className="ring-negative/40">
      <CardTitle className="text-negative">Eliminar mi cuenta</CardTitle>
      <p className="mt-1 text-sm text-muted">
        Borra tu usuario y todos tus datos: cuentas, movimientos, presupuestos, metas y recurrentes.
        No se puede deshacer.
      </p>
      <div className="mt-3 space-y-3">
        <Field label="Tu contraseña" htmlFor="delete-password">
          <TextInput
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Escribe ELIMINAR para confirmar" htmlFor="delete-confirmation">
          <TextInput
            id="delete-confirmation"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
        <ConfirmButton
          size="lg"
          disabled={!password || confirmation !== 'ELIMINAR'}
          loading={remove.isPending}
          onConfirm={() => {
            if (!remove.isPending) remove.mutate();
          }}
        >
          Eliminar mi cuenta y mis datos
        </ConfirmButton>
      </div>
    </Card>
  );
}
