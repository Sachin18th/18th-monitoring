'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { Button, Typography } from '@kpi-platform/ui';
import { canAccessProjectPath } from '@kpi-platform/shared-types';
import { useAuth } from '../../context/AuthContext';

interface PageRestrictedProps {
  /** Optional override message describing why access was denied. */
  message?: string;
}

/**
 * Rendered in place of a page when the current user's role is not permitted to
 * view the requested route. Unlike a redirect, this keeps the user on the URL
 * they navigated to while making it clear the page is restricted, and offers a
 * way back to a route their role can access.
 */
export const PageRestricted: React.FC<PageRestrictedProps> = ({ message }) => {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();

  const projectId = (params?.projectId as string) || '';

  const handleGoBack = () => {
    // Overview is in every role's sidebar set, so it is the safe landing spot
    // for anyone who hit a restricted page. Still gate on canAccessProjectPath
    // so a future ROLE_ACCESS change can't bounce the user restricted → restricted.
    if (projectId && canAccessProjectPath(user?.role, `/project/${projectId}/overview`)) {
      router.replace(`/project/${projectId}/overview`);
      return;
    }

    router.replace('/projects');
  };

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
      }}
    >
      <div
        style={{
          maxWidth: '520px',
          width: '100%',
          textAlign: 'center',
          borderRadius: '16px',
          border: '1px solid var(--border-card)',
          background: 'var(--bg-card)',
          padding: '40px 32px',
        }}
      >
        <div className="dashboard-stack" style={{ alignItems: 'center', gap: '1rem' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'rgba(244,63,94,0.12)',
              color: '#fb7185',
            }}
          >
            <LockKeyhole size={28} />
          </span>
          <Typography variant="h2" noMargin>
            Access restricted
          </Typography>
          <Typography variant="body" color="secondary">
            {message ||
              'Your role does not have permission to view this page. If you believe this is a mistake, contact a project administrator.'}
          </Typography>
          <Button size="lg" onClick={handleGoBack}>
            Go to an area you can access
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PageRestricted;
