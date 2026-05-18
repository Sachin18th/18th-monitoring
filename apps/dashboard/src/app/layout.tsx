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
        <Script src="/agent.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
