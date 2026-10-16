import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { LoadingScreen } from '../../shared/components/LoadingScreen';
export function ProtectedRoute({ role }) {
  const { user, status } = useAuth();
  if (status === 'loading') return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
