import { THEME_LABELS, type Theme, type UserDTO } from '@finanzas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardTitle } from '../../components/ui/Card';
import { Chips } from '../../components/ui/Chips';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { useOnline } from '../../lib/useOnline';
import { qk } from '../../lib/queries';
import { applyTheme } from '../../lib/theme';

const ORDER: Theme[] = ['DARK', 'LIGHT', 'SYSTEM'];

export function ThemeCard({ user }: { user: UserDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const save = useMutation({
    mutationFn: (theme: Theme) => api.patch<{ user: UserDTO }>('/me', { theme }),
    onMutate: (theme) => {
      applyTheme(theme);
      queryClient.setQueryData(qk.me, { ...user, theme });
    },
    onSuccess: ({ user: updated }) => queryClient.setQueryData(qk.me, updated),
    onError: () => {
      applyTheme(user.theme);
      queryClient.setQueryData(qk.me, user);
      toast.show({ message: 'No se pudo guardar el tema', tone: 'error' });
    },
  });
  return (
    <Card>
      <CardTitle>Apariencia</CardTitle>
      <div className="mt-3">
        <Chips
          ariaLabel="Tema"
          disabled={!online}
          value={user.theme}
          onChange={(theme) => save.mutate(theme)}
          options={ORDER.map((t) => ({ value: t, label: THEME_LABELS[t] }))}
        />
      </div>
    </Card>
  );
}
