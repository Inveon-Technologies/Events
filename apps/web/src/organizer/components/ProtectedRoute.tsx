import { Navigate } from 'react-router-dom';
import { useOrganizerAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useOrganizerAuth();

  if (!isAuthenticated) {
    return <Navigate replace to="/organizer/login" />;
  }

  return <>{children}</>;
}
