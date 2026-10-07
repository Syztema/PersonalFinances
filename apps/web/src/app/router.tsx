import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { PageSpinner } from '../components/ui/Spinner';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { AppLayout } from './AppLayout';
import { NotFoundPage } from './NotFoundPage';
import { RouteError } from './RouteError';
import { PublicOnly } from './PublicOnly';
import { RequireAuth } from './RequireAuth';

/** Carga diferida: cada pantalla es un archivo JS aparte. */
const page =
  <M,>(load: () => Promise<M>, pick: (m: M) => ComponentType) =>
  async () => ({ Component: pick(await load()) });

export const appRoutes: RouteObject[] = [
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  {
    path: '/dashboard',
    lazy: page(
      () => import('../features/dashboard/DashboardPage'),
      (m) => m.DashboardPage,
    ),
  },
  {
    path: '/transactions',
    lazy: page(
      () => import('../features/transactions/TransactionsPage'),
      (m) => m.TransactionsPage,
    ),
  },
  {
    path: '/budgets',
    lazy: page(
      () => import('../features/more/BudgetsPage'),
      (m) => m.BudgetsPage,
    ),
  },
  {
    path: '/accounts',
    lazy: page(
      () => import('../features/accounts/AccountsPage'),
      (m) => m.AccountsPage,
    ),
  },
  {
    path: '/cards',
    lazy: page(
      () => import('../features/cards/CardsPage'),
      (m) => m.CardsPage,
    ),
  },
  {
    path: '/cards/:id',
    lazy: page(
      () => import('../features/cards/CardDetailPage'),
      (m) => m.CardDetailPage,
    ),
  },
  {
    path: '/debts',
    lazy: page(
      () => import('../features/debts/DebtsPage'),
      (m) => m.DebtsPage,
    ),
  },
  {
    path: '/categories',
    lazy: page(
      () => import('../features/categories/CategoriesPage'),
      (m) => m.CategoriesPage,
    ),
  },
  {
    path: '/profile',
    lazy: page(
      () => import('../features/profile/ProfilePage'),
      (m) => m.ProfilePage,
    ),
  },
  {
    path: '/more',
    lazy: page(
      () => import('../features/more/MorePage'),
      (m) => m.MorePage,
    ),
  },
];

export const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    HydrateFallback: PageSpinner,
    errorElement: <RouteError />,
    children: [{ element: <AppLayout />, children: appRoutes }],
  },
  { path: '*', element: <NotFoundPage /> },
]);
