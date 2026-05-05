<<<<<<< HEAD
import React from 'react';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}

=======
'use client';
import React from 'react';
import { useParams } from 'next/navigation';
import { Sidebar } from '../../../components/layout/Sidebar';
import { TopBar } from '../../../components/layout/TopBar';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const projectId = params.projectId as string;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', margin: 0 }}>
      <Sidebar projectId={projectId} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--bg-base)' }}>
        <TopBar projectId={projectId} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', backgroundColor: 'var(--bg-base)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
