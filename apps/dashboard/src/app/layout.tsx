'use client';
import React, { useEffect } from 'react';
import { useAuth, AuthProvider } from '../context/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import Script from 'next/script';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { OutageNotificationShell } from '../components/layout/OutageNotificationShell';
import './globals.css';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, currentProject, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user && pathname !== '/login') {
        router.push('/login');
      } else if (user && pathname === '/') {
        // Landing logic
        const projects = user.assignedProjects || [];
        if (user.role === 'CUSTOMER' && projects.length > 0) {
          router.push(`/project/${projects[0]}/overview`);
        } else {
          router.push('/projects');
        }
      }
    }
  }, [user, isLoading, pathname, currentProject, router]);

  if (isLoading) return <div style={{ background: '#0f172a', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>Initializing...</div>;

  return <>{children}</>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ background: 'var(--bg-base)' }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <ErrorBoundary>
          <AuthProvider>
            <OutageNotificationShell />
            <AuthGuard>
              {children}
            </AuthGuard>
          </AuthProvider>
        </ErrorBoundary>
        <Script src="/agent.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
