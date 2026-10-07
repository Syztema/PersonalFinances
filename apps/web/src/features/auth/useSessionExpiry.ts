import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { onUnauthorized } from '../../lib/api';

export function useSessionExpiry() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  useEffect(
    () =>
      onUnauthorized(() => {
        queryClient.clear();
        navigate('/login', { replace: true, state: { expired: true } });
      }),
    [queryClient, navigate],
  );
}
