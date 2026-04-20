/**
 * AdminGuard — route wrapper that fences off `/admin/*` behind the auth store.
 *
 * Unauthenticated visits redirect to `/login` with the originally-requested
 * path stashed in `location.state.from`, so LoginPage can land the admin back
 * on the deep-link they were reaching for.
 *
 * Kept deliberately dumb: it subscribes to `isAuthenticated()` only, so an
 * expiry elsewhere in the app (e.g. 401 interceptor calling `logout()`)
 * immediately flips this guard and the next render bounces to /login.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store.js';

export interface AdminGuardProps {
  children: React.ReactNode;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const authed = useAuthStore((s) => s.isAuthenticated());
  const location = useLocation();

  if (!authed) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <>{children}</>;
};
