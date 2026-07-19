import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './authContext';
import { FullPageSpinner } from '@/components/common/LoadingState';

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading, isDemo } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner label="Signing you in…" />;
  if (!user) {
    // In demo mode, walk the user through the flow as a local user.
    if (isDemo) return <>{children}</>;
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  // Email verification gate (real Firebase mode only). /verify-email is the
  // exception — once redirected there, the page handles its own state.
  if (
    !isDemo &&
    location.pathname !== '/verify-email' &&
    user.email &&
    !user.emailVerified &&
    !user.isAnonymous
  ) {
    return <Navigate to="/verify-email" replace />;
  }
  return <>{children}</>;
};
