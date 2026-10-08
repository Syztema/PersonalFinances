import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import { useMe } from '../features/auth/useAuth';
import { useSessionExpiry } from '../features/auth/useSessionExpiry';
import { QuickAddProvider } from '../features/quick-add/QuickAddContext';
import { QuickAddSheets } from '../features/quick-add/QuickAddSheets';
import { useThemeSync } from '../lib/theme';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';

// Diferido: el registro del service worker (workbox-window) no entra en el chunk de entrada. Si su
// chunk no llega, el aviso (opcional) no aparece y la app sigue (final review 3B, Important 3).
const UpdatePrompt = lazy(() =>
  import('./UpdatePrompt')
    .then((m) => ({ default: m.UpdatePrompt }))
    .catch(() => ({ default: () => null })),
);

export function AppLayout() {
  useSessionExpiry();
  const me = useMe();
  useThemeSync(me.data?.theme);
  return (
    <QuickAddProvider>
      <OfflineBanner />
      <div className="min-h-dvh lg:flex">
        <Sidebar />
        <main className="mx-auto w-full max-w-3xl px-4 pt-4 pb-28 lg:px-8 lg:pt-8 lg:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <QuickAddSheets />
      <Suspense fallback={null}>
        <UpdatePrompt />
      </Suspense>
    </QuickAddProvider>
  );
}
