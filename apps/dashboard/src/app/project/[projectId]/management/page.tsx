// apps/dashboard/src/app/project/[projectId]/management/page.tsx
'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageLayout, Card, Typography } from '@kpi-platform/ui';
import {
  Settings, ShieldCheck, History, Users,
  ArrowRight, BarChart3, ShieldAlert
} from 'lucide-react';
import { RoleGuard } from '../../../../components/auth/RoleGuard';

export default function ManagementIndexPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const dataPlatformTools = [
    { title: 'KPI Engine', href: `/project/${projectId}/management/kpi`, icon: BarChart3, detail: 'Metric computations and formulas', status: 'live' },
    { title: 'System Monitoring', href: `/project/${projectId}/management/monitoring`, icon: ShieldAlert, detail: 'Health score and alert triggers', status: 'live' },
  ];

  const governanceTools = [
    { title: 'Audit & Activity', href: `/project/${projectId}/management/audit`, icon: History, detail: 'Timeline and immutable system logs' },
    { title: 'Configuration', href: `/project/${projectId}/settings`, icon: Settings, detail: 'Project and webhook settings' },
    { title: 'Administration', href: `/project/${projectId}/management/users`, icon: Users, detail: 'Roster and role assignments' },
  ];

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'TENANT_ADMIN', 'PROJECT_ADMIN']}>
      <PageLayout
        title="Data Platform Hub"
        subtitle={`Control plane for ${projectId}. Manage ingestion, pipelines, analytics engines, and governance.`}
        icon={<Settings size={28} className="text-primary" />}
      >
        <div className="space-y-8">
          {/* Data Platform Section */}
          <section>
            <div className="mb-4">
              <Typography variant="h3" weight="bold" noMargin>Data Platform & Observability</Typography>
              <Typography variant="body2" className="text-text-muted">Low-level monitoring for data intake, processing, and alerting.</Typography>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dataPlatformTools.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => router.push(item.href)}
                    className="flex flex-col text-left p-5 rounded-2xl border border-border bg-bg-surface hover:border-primary/40 hover:shadow-lg transition-all group"
                  >
                    <div className="flex items-start justify-between w-full mb-3">
                      <div className="p-3 bg-primary/10 rounded-xl text-primary group-hover:scale-110 transition-transform">
                        <Icon size={20} />
                      </div>
                      <ArrowRight size={18} className="text-text-muted group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <Typography variant="body" weight="bold" className="text-text-primary mb-1">{item.title}</Typography>
                      <Typography variant="caption" className="text-text-muted">{item.detail}</Typography>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Governance Section */}
          <section>
            <div className="mb-4 mt-8 pt-8 border-t border-border/50">
              <Typography variant="h3" weight="bold" noMargin>Governance & Access</Typography>
              <Typography variant="body2" className="text-text-muted">Manage roles, review audit logs, and configure project settings.</Typography>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {governanceTools.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => router.push(item.href)}
                    className="flex items-center gap-4 text-left p-4 rounded-xl border border-border bg-bg-surface hover:border-border-hover transition-colors group"
                  >
                    <div className="p-2.5 bg-muted/50 rounded-lg text-text-secondary group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      <Icon size={18} />
                    </div>
                    <div>
                      <Typography variant="body" weight="bold" className="text-sm">{item.title}</Typography>
                      <Typography variant="caption" className="text-[11px] text-text-muted">{item.detail}</Typography>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </PageLayout>
    </RoleGuard>
  );
}