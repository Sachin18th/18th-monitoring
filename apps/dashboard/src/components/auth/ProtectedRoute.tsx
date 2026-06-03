'use client';

import React, { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { canAccessProjectPath } from '@kpi-platform/shared-types';
import { useAuth } from '../../context/AuthContext';
import { PageRestricted } from './pagerestricted';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Client-side route guard for project pages. It prevents users from bypassing
 * the sidebar by typing a restricted URL directly.
 *
 * The authorization decision is sourced entirely from
 * `@kpi-platform/shared-types` (`canAccessProjectPath` → `ROLE_ACCESS`), so this
 * component holds no role→route mapping of its own. `super_admin` and `admin`
 * pass through every project route; `ops_lead` and `analyst` are blocked on any
 * route outside their permission set and shown the restricted page.
 *
 * This complements the Next.js middleware: middleware fails open on transient
 * API errors, whereas this guard always re-evaluates from the loaded user.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const pathname = usePathname() || '';

  // Only project routes carry per-page permissions. Anything else (the guard
  // should not normally wrap it) passes through untouched.
  const isProjectRoute = pathname.startsWith('/project/');

  const isAuthorized = useMemo(() => {
    if (!isProjectRoute) {
      return true;
    }

    return canAccessProjectPath(user?.role, pathname);
  }, [isProjectRoute, user?.role, pathname]);

  if (isLoading) {
    return (
      <div style={{ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' }}>
        Verifying permissions...
      </div>
    );
  }

  if (!isAuthorized) {
    return <PageRestricted />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
