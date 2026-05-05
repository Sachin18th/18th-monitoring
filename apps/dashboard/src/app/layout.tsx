<<<<<<< HEAD
import React from 'react';
import { ClientProviders } from '../components/layout/ClientProviders';
import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: 'KPI Monitoring Dashboard',
  description: 'Enterprise observability and operational surface for monitoring performance, integrations, and commerce KPIs.',
  keywords: ['monitoring', 'KPI', 'dashboard', 'observability', 'enterprise'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0f172a" />
      </head>
      {/* 
          We use suppressHydrationWarning on <body> because many browser extensions 
          (and potentially our third-party monitoring agents) may inject classes 
          or attributes to the body before React has a chance to hydrate.
      */}
      <body suppressHydrationWarning>
        <ClientProviders>
          {children}
        </ClientProviders>
=======
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
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        <Script src="/agent.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
