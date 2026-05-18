// 'use client';

// import React, { useEffect } from 'react';
// import { useAuth, AuthProvider } from '../../context/AuthContext';
// import { ConnectorPlatformProvider } from '../../context/ConnectorPlatformContext';
// import { usePathname, useRouter } from 'next/navigation';
// import { ErrorBoundary } from '../ui/ErrorBoundary';
// import { OutageNotificationShell } from '../layout/OutageNotificationShell';
// import { ThemeProvider, ToastProvider } from '@kpi-platform/ui';
// import { DashboardShell } from '../layout/DashboardShell';
// import { ConnectorSetupModal } from '../integrations/ConnectorSetupModal';

// function LayoutWrapper({ children }: { children: React.ReactNode }) {
//   const pathname = usePathname();
//   const isPublic = pathname === '/' || pathname === '/login' || pathname === '/unauthorized';

//   if (isPublic) return <>{children}</>;
//   return <DashboardShell>{children}</DashboardShell>;
// }

// function AuthGuard({ children }: { children: React.ReactNode }) {
//   const { user, isLoading } = useAuth();
//   const pathname = usePathname();
//   const router = useRouter();

//   useEffect(() => {
//     if (!isLoading) {
//       if (!user) {
//         if (pathname !== '/' && pathname !== '/login') {
//           router.push('/login');
//         }
//       } else {
//         const assignedProjects = user.assignedProjects || [];
//         if (pathname === '/') {
//           if (user.role === 'CUSTOMER' && assignedProjects.length === 1) {
//             router.push(`/project/${assignedProjects[0]}/overview`);
//           } else {
//             router.push('/projects');
//           }
//         }
//         if (pathname === '/projects' && user.role === 'CUSTOMER' && assignedProjects.length === 1) {
//           router.push(`/project/${assignedProjects[0]}/overview`);
//         }
//       }
//     }
//   }, [user, isLoading, pathname, router]);

//   if (isLoading) {
//     return (
//       <div className="app-loading-shell" role="status" aria-label="Loading application">
//         <div className="app-loading-spinner" />
//         <span className="app-loading-text">Initializing workspace…</span>
//       </div>
//     );
//   }

//   return <>{children}</>;
// }

// export function ClientProviders({ children }: { children: React.ReactNode }) {
//   return (
//     <ThemeProvider>
//       <ToastProvider>
//         <ErrorBoundary>
//           <AuthProvider>
//             <ConnectorPlatformProvider>
//               <OutageNotificationShell />
//               <AuthGuard>
//                 <LayoutWrapper>
//                   {children}
//                 </LayoutWrapper>
//               </AuthGuard>
//               <ConnectorSetupModal />
//             </ConnectorPlatformProvider>
//           </AuthProvider>
//         </ErrorBoundary>
//       </ToastProvider>
//     </ThemeProvider>
//   );
// }


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
    if (!isLoading) {
      if (!user) {
        if (!isPublicPath) {
          router.push('/login');
        }
      } else {
        const assignedProjects = user.assignedProjects || [];
        if (pathname === '/') {
          if (user.role === 'CUSTOMER' && assignedProjects.length === 1) {
            router.push(`/project/${assignedProjects[0]}/overview`);
          } else {
            router.push('/projects');
          }
        }
        if (pathname === '/projects' && user.role === 'CUSTOMER' && assignedProjects.length === 1) {
          router.push(`/project/${assignedProjects[0]}/overview`);
        }
      }
    }
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
            </ConnectorPlatformProvider>
          </AuthProvider>
        </ErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
}