// apps/dashboard/src/components/layout/ClientProviders.tsx
'use client';

import React, { useEffect } from 'react';
import { useAuth, AuthProvider } from '../../context/AuthContext';
import { ConnectorPlatformProvider } from '../../context/ConnectorPlatformContext';
import { usePathname, useRouter } from 'next/navigation';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { OutageNotificationShell } from '../layout/OutageNotificationShell';
import { ThemeProvider, ToastProvider } from '@kpi-platform/ui';
import { DashboardShell } from '../layout/DashboardShell';
import { ConnectorSetupModal } from '../integrations/ConnectorSetupModal';
import { CsvUploadModal } from '../integrations/CsvUploadModal';

function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = pathname === '/' || pathname === '/login' || pathname === '/unauthorized';

  if (isPublic) return <>{children}</>;
  return <DashboardShell>{children}</DashboardShell>;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPath = pathname === '/' || pathname === '/login' || pathname === '/unauthorized';

  useEffect(() => {
    if (isLoading) return;

    // Defer navigation to the next tick. When there is no stored session the
    // AuthProvider flips `isLoading` synchronously during the initial mount
    // commit; dispatching a router action in that same commit throws Next.js's
    // "Router action dispatched before initialization" error. Deferring lets
    // the App Router finish wiring up before we navigate, with a hard
    // window.location fallback if the router still isn't ready.
    let target: string | null = null;

    if (!user) {
      if (!isPublicPath) target = '/login';
    } else {
      const assignedProjects = user.assignedProjects || [];
      const shouldAutoOpenProject = user.role === 'CUSTOMER' && assignedProjects.length === 1;

      if (pathname === '/') {
        target = shouldAutoOpenProject ? `/project/${assignedProjects[0]}/overview` : '/projects';
      } else if (pathname === '/projects' && shouldAutoOpenProject) {
        target = `/project/${assignedProjects[0]}/overview`;
      }
    }

    if (!target) return;

    const destination = target;
    const timer = setTimeout(() => {
      try {
        router.push(destination);
      } catch {
        if (typeof window !== 'undefined') {
          window.location.assign(destination);
        }
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [user, isLoading, pathname, isPublicPath, router]);

  if (isLoading || (!user && !isPublicPath)) {
    return (
      <div className="app-loading-shell" role="status" aria-label="Loading application">
        <div className="app-loading-spinner" />
        <span className="app-loading-text">Initializing workspace…</span>
      </div>
    );
  }

  return <>{children}</>;
}

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ErrorBoundary>
          <AuthProvider>
            <ConnectorPlatformProvider>
              <OutageNotificationShell />
              <AuthGuard>
                <LayoutWrapper>
                  {children}
                </LayoutWrapper>
              </AuthGuard>
              <ConnectorSetupModal />
              <CsvUploadModal />
            </ConnectorPlatformProvider>
          </AuthProvider>
        </ErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
}