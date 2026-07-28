import { createBrowserRouter, Navigate } from 'react-router-dom';
import WorkspacePage from './pages/WorkspacePage';
import { RouterErrorBoundary } from './components/ErrorBoundary';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <WorkspacePage />,
    errorElement: <RouterErrorBoundary />
  },
  {
    path: '*',
    element: <Navigate to="/" replace />
  }
]);