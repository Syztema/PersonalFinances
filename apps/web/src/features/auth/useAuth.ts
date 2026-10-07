import { DEFAULT_TIMEZONE, todayIn, type IsoDate, type UserDTO } from '@finanzas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { qk } from '../../lib/queries';
import { clearUserLocalData } from '../../lib/storage';

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => api.get<{ user: UserDTO }>('/auth/me').then((r) => r.user),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

function useSessionStart(path: '/auth/login' | '/auth/register') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, string>) =>
      api.post<{ user: UserDTO }>(path, body).then((r) => r.user),
    onSuccess: (user) => {
      queryClient.clear();
      queryClient.setQueryData(qk.me, user);
    },
  });
}

export const useLogin = () => useSessionStart('/auth/login');
export const useRegister = () => useSessionStart('/auth/register');

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      queryClient.clear();
      clearUserLocalData();
      navigate('/login', { replace: true });
    },
  });
}

export function useToday(): IsoDate {
  const me = useMe();
  return todayIn(me.data?.timezone ?? DEFAULT_TIMEZONE);
}
