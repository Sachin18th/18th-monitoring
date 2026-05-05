'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageLayout, Typography, Card, Badge, OperationalTable } from '@kpi-platform/ui';
import { ShieldCheck, Calendar, Info, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../../../context/AuthContext';

const categoryVariant: Record<string, string> = {
  security:      'error',
  configuration: 'warning',
  action:        'info',
  system:        'default',
};

export default function AuditPage() {
  const { projectId } = useParams();
  const { token, apiFetch } = useAuth();

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/dashboard/audit?siteId=${projectId}`);
      setAuditLogs(Array.isArray(res) ? res : []);
    } catch (err: any) {
      console.error('[Audit] Load failed', err);
      setError('Failed to load audit log. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiFetch]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60_000); // 60s refresh
    return () => clearInterval(interval);
  }, [loadData]);

  const columns = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      width: '200px',
      render: (val: string) => <span className="text-xs font-mono text-text-muted">{val}</span>,
    },
    {
      key: 'event',
      header: 'Event',
      render: (val: string, row: any) => (
        <div className="flex items-center gap-2">
          <Info size={14} className="text-text-muted shrink-0" />
          <div>
            <span className="font-medium text-sm">{row.action || val}</span>
            {row.entity && row.entity !== '-' && (
              <span className="block text-[10px] font-mono text-text-muted">{row.entity}</span>
            )}
          </div>
        </div>
      ),
    },
    { key: 'actor', header: 'Actor', render: (val: string) => <span className="text-xs">{val}</span> },
    {
      key: 'value',
      header: 'Change',
      render: (val: string) =>
        val && val !== '-' ? (
          <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-text-secondary">{val}</span>
        ) : (
          <span className="text-text-muted text-xs">—</span>
        ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (val: string) => (
        <Badge variant={(categoryVariant[val] || 'default') as any} size="sm" dot>
          {(val || 'system').toUpperCase()}
        </Badge>
      ),
    },
  ];

  return (
    <PageLayout
      title="Audit & Activity"
      subtitle="Immutable record of all operational and system changes."
      icon={<ShieldCheck size={24} />}
    >
      <Card className="p-0 overflow-hidden border-subtle">
        {/* Header bar */}
        <div className="p-4 border-b border-subtle bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Typography variant="h4" className="text-sm m-0">Recent Activity</Typography>
            <Badge variant="info" size="sm">Live</Badge>
            {!loading && !error && (
              <span className="text-[10px] text-text-muted font-mono">{auditLogs.length} entries</span>
            )}
          </div>
          <div className="flex gap-3 items-center">
            <button
              onClick={loadData}
              className="text-xs text-text-muted hover:text-primary flex items-center gap-1 transition-colors"
              disabled={loading}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button className="text-xs text-primary font-bold hover:underline flex items-center gap-1">
              <Calendar size={12} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && !loading && (
          <div className="flex items-center gap-3 p-6 text-error">
            <AlertCircle size={18} />
            <span className="text-sm">{error}</span>
            <button onClick={loadData} className="ml-auto text-xs underline hover:text-primary">
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        {!error && (
          <OperationalTable
            columns={columns as any}
            data={auditLogs}
            isLoading={loading}
            isDense
          />
        )}
      </Card>
    </PageLayout>
  );
}
