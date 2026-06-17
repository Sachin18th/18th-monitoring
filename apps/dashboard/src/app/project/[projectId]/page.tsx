'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { getDefaultProjectPathForRole, normalizeRole } from '@kpi-platform/shared-types';

export default function ProjectRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const { apiFetch, user } = useAuth();
  const projectId = params.projectId;

  useEffect(() => {
    let cancelled = false;

    const resolveLandingPage = async () => {
      if (!projectId) {
        router.replace('/projects');
        return;
      }

      try {
        const targetPath = getDefaultProjectPathForRole(normalizeRole(user?.role));

        if (cancelled) return;

        if (targetPath) {
          router.replace(`/project/${projectId}${targetPath}`);
        } else {
          router.replace('/unauthorized');
        }
      } catch {
        if (!cancelled) {
          router.replace('/unauthorized');
        }
      }
    };

    void resolveLandingPage();

    return () => {
      cancelled = true;
    };
  }, [apiFetch, projectId, router, user?.role]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-bg-base">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-medium text-text-muted">Loading project context...</p>
      </div>
    </div>
  );
}
