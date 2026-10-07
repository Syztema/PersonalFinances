import { Outlet } from 'react-router';
import { useSessionExpiry } from '../features/auth/useSessionExpiry';
import { QuickAddProvider } from '../features/quick-add/QuickAddContext';
import { QuickAddSheets } from '../features/quick-add/QuickAddSheets';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  useSessionExpiry();
  return (
    <QuickAddProvider>
      <div className="min-h-dvh lg:flex">
        <Sidebar />
        <main className="mx-auto w-full max-w-3xl px-4 pt-4 pb-28 lg:px-8 lg:pt-8 lg:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <QuickAddSheets />
    </QuickAddProvider>
  );
}
