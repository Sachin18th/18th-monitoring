'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import { PROJECT_PAGE_ACCESS_OPTIONS } from '@kpi-platform/shared-types';

export default function ProjectRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const { apiFetch } = useAuth();
  const projectId = params.projectId;

  const normalizeAllowedPageKeys = (permissions: any): string[] => {
    const pageKeys = Array.isArray(permissions?.allowedPageKeys)
      ? permissions.allowedPageKeys
      : Array.isArray(permissions?.data?.allowedPageKeys)
        ? permissions.data.allowedPageKeys
        : Array.isArray(permissions?.pageKeys)
          ? permissions.pageKeys
          : Array.isArray(permissions?.data?.pageKeys)
            ? permissions.data.pageKeys
            : [];

    return pageKeys.map((value: any) => String(value));
  };

  useEffect(() => {
    let cancelled = false;

    const resolveLandingPage = async () => {
      if (!projectId) {
        router.replace('/projects');
        return;
      }

      try {
        const permissions = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, {
          suppressUnauthorizedRedirect: true,
        });

        const allowedPageKeys = normalizeAllowedPageKeys(permissions);

        const firstAllowedPage = PROJECT_PAGE_ACCESS_OPTIONS.find(
          (option) => allowedPageKeys.includes(option.key) && !option.superAdminOnly,
        );

        const targetPath = firstAllowedPage?.path || (allowedPageKeys.includes('overview') ? '/overview' : null);

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
  }, [apiFetch, projectId, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-bg-base">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-medium text-text-muted">Loading project context...</p>
      </div>
    </div>
  );
}
