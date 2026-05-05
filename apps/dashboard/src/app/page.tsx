<<<<<<< HEAD
'use client';
import React from 'react';
import MonitoringLandingPage from '../components/landing/LandingSections';

export default function LandingPage() {
  return (
    <>
      <MonitoringLandingPage />
      <style jsx global>{`
        .landing-page {
          background-color: var(--bg-base);
          min-height: 100vh;
        }

        /* Prevent layout shift when header becomes sticky */
        body {
          padding-top: 0;
        }
      `}</style>
    </>
  );
}
=======
'use client';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push('/login');
      } else if (user.role === 'CUSTOMER') {
        router.push(`/project/${user.assignedProjects[0]}/overview`);
      } else {
        router.push('/projects');
      }
    }
  }, [user, isLoading, router]);

  return (
    <div style={{ height: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
      Verifying session...
    </div>
  );
}
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
