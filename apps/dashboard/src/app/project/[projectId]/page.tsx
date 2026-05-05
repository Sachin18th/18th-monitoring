'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ProjectRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId;

  useEffect(() => {
    if (projectId) {
      router.replace(`/project/${projectId}/overview`);
    } else {
      router.replace('/projects');
    }
  }, [projectId, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-bg-base">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-medium text-text-muted">Loading project context...</p>
      </div>
    </div>
  );
}
