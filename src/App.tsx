import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { ToastContainer } from './components/ui/Toast';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExpeditionsPage } from './pages/ExpeditionsPage';
import { ExpeditionDetailPage } from './pages/ExpeditionDetailPage';
import { GameplayPage } from './pages/GameplayPage';
import { SummaryPage } from './pages/SummaryPage';
import { HistoryPage } from './pages/HistoryPage';
import { ExpeditionHistoryPage } from './pages/ExpeditionHistoryPage';
import { ConfigPage } from './pages/ConfigPage';
import { NotFoundPage } from './pages/NotFoundPage';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'expeditions', element: <ExpeditionsPage /> },
          { path: 'expeditions/:id', element: <ExpeditionDetailPage /> },
          { path: 'expeditions/:id/play', element: <GameplayPage /> },
          { path: 'expeditions/:id/summary', element: <SummaryPage /> },
          { path: 'history', element: <HistoryPage /> },
          { path: 'history/:expeditionId', element: <ExpeditionHistoryPage /> },
          { path: 'config', element: <ConfigPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ToastContainer />
    </>
  );
}
