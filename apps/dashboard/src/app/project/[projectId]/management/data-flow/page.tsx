'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../../../../context/AuthContext';
import { useParams } from 'next/navigation';
import { PageRestricted } from '../../../../../components/PageRestricted';
import {
  Workflow,
  CheckCircle2,
  XCircle,
  Play,
  AlertOctagon,
  Clock,
  RefreshCw,
  GitMerge,
  Settings2,
  History,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Link
} from 'lucide-react';

const pageStyle: React.CSSProperties = {
  padding: '24px 28px',
  maxWidth: '1280px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  overflow: 'visible',
  minHeight: '100vh',
  background: 'var(--bg-page)',
  color: 'var(--text-primary)'
};

const cardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  overflow: 'visible'
};

function formatAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (isNaN(diffMs)) return '—';
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHr > 0) return `${diffHr}h ago`;
  return `${diffMin}m ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function getJobTypeIcon(type: string) {
  const t = String(type || '').toUpperCase();
  if (t.includes('RESYNC')) return <RefreshCw style={{ width: '15px', height: '15px', color: '#a78bfa' }} />;
  if (t.includes('BACKFILL')) return <History style={{ width: '15px', height: '15px', color: '#22c55e' }} />;
  if (t.includes('POLL')) return <Settings2 style={{ width: '15px', height: '15px', color: '#60a5fa' }} />;
  return <GitMerge style={{ width: '15px', height: '15px', color: 'var(--text-muted)' }} />;
}

function getJobStatusPill(status: string) {
  const iconStyle = { width: '12px', height: '12px' };
  const map: Record<string, { color: string; border: string; bg: string; icon: React.ReactNode }> = {
    RUNNING:      { color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)',  bg: 'rgba(96,165,250,0.08)',  icon: <Play style={iconStyle} /> },
    COMPLETED:    { color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)',   bg: 'rgba(34,197,94,0.08)',   icon: <CheckCircle2 style={iconStyle} /> },
    FAILED:       { color: '#f87171', border: '1px solid rgba(248,113,113,0.2)', bg: 'rgba(248,113,113,0.08)', icon: <XCircle style={iconStyle} /> },
    DEGRADED:     { color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)',  bg: 'rgba(245,158,11,0.08)',  icon: <AlertOctagon style={iconStyle} /> },
    DEAD_LETTERED:{ color: '#f87171', border: '1px solid rgba(248,113,113,0.2)', bg: 'rgba(248,113,113,0.08)', icon: <AlertOctagon style={iconStyle} /> },
    QUEUED:       { color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)',  bg: 'rgba(251,191,36,0.08)',  icon: <Clock style={iconStyle} /> }
  };
  const s = map[status] || { color: 'var(--text-secondary)', border: '1px solid var(--border-input)', bg: 'var(--bg-input)', icon: null };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '999px', fontSize: '10px', color: s.color, border: s.border, background: s.bg, whiteSpace: 'nowrap' }}>
      {s.icon}
      {status}
    </span>
  );
}

export default function DataFlowPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { token, apiFetch } = useAuth();

  const [loading, setLoading] = useState(true);
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);

  const [jobs, setJobs] = useState<any[]>([]);
  const [dlqEntries, setDlqEntries] = useState<any[]>([]);

  const [jobSearch, setJobSearch] = useState('');
  const [jobStatusFilter, setJobStatusFilter] = useState('');

  const [traceId, setTraceId] = useState('');
  const [traceResult, setTraceResult] = useState<any[] | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);

  const canView = useMemo(() => {
    if (!allowedPageKeys) return false;
    return (
      allowedPageKeys.includes('management/data-flow') ||
      allowedPageKeys.includes('management/ingestion') ||
      allowedPageKeys.includes('management/pipeline')
    );
  }, [allowedPageKeys]);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const permissions = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
      const nextAllowedPageKeys = Array.isArray(permissions?.allowedPageKeys) ? permissions.allowedPageKeys.map((v: any) => String(v)) : [];
      setAllowedPageKeys(nextAllowedPageKeys);

      const hasAccess =
        nextAllowedPageKeys.includes('management/data-flow') ||
        nextAllowedPageKeys.includes('management/ingestion') ||
        nextAllowedPageKeys.includes('management/pipeline');
      if (!hasAccess) return;

      const base = `/api/v1/tenants/current/projects/${projectId}`;
      const [jobsRes, dlqRes] = await Promise.allSettled([
        apiFetch(`${base}/pipeline/jobs`, { suppressUnauthorizedRedirect: true }),
        apiFetch(`${base}/pipeline/dlq`, { suppressUnauthorizedRedirect: true })
      ]);

      if (jobsRes.status === 'fulfilled') {
        const v = jobsRes.value;
        setJobs(v?.data?.jobs || v?.jobs || []);
      }
      if (dlqRes.status === 'fulfilled') {
        const v = dlqRes.value;
        setDlqEntries(v?.data?.DLQ || v?.DLQ || []);
      }
    } catch (err) {
      console.error('[DataFlow] Failed to load data', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const kpis = useMemo(() => {
    const active = jobs.filter((j) => j.status === 'RUNNING').length;
    const completed = jobs.filter((j) => j.status === 'COMPLETED').length;
    const failed = jobs.filter((j) => j.status === 'FAILED' || j.status === 'DEGRADED').length;
    const dlqDepth = dlqEntries.length;
    return { active, completed, failed, dlqDepth };
  }, [jobs, dlqEntries]);

  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    return jobs.filter((j) => {
      const matchSearch =
        !q ||
        String(j.correlationId || '').toLowerCase().includes(q) ||
        String(j.type || '').toLowerCase().includes(q) ||
        String(j.connector || '').toLowerCase().includes(q);
      const matchStatus = !jobStatusFilter || j.status === jobStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [jobs, jobSearch, jobStatusFilter]);

  const handleTrace = useCallback(async () => {
    if (!traceId.trim()) return;
    setTraceLoading(true);
    setTraceResult(null);
    try {
      const base = `/api/v1/tenants/current/projects/${projectId}`;
      const res = await apiFetch(`${base}/pipeline/jobs`, { suppressUnauthorizedRedirect: true });
      const allJobs = res?.data?.jobs || res?.jobs || [];
      const matches = allJobs.filter((j: any) => String(j.correlationId || j.id || '').toLowerCase().includes(traceId.trim().toLowerCase()));
      setTraceResult(matches);
    } catch {
      setTraceResult([]);
    } finally {
      setTraceLoading(false);
    }
  }, [traceId, projectId, apiFetch]);

  if (allowedPageKeys !== null && !canView) {
    return <PageRestricted pageKey="management/data-flow" />;
  }

  const filterInputStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    border: '1px solid var(--border-card)',
    background: 'var(--bg-input)',
    borderRadius: '10px',
    padding: '8px 12px'
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary)',
    fontSize: '12px'
  };

  const headerColStyle: React.CSSProperties = {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-label)'
  };

  return (
    <>
      <div style={pageStyle}>
        {/* Page Header */}
        <div style={{ marginBottom: '8px', overflow: 'visible' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '50%', border: '1px solid var(--border-card)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Workflow style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
            </div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)' }}>Data Operations</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, maxWidth: '760px' }}>
              <div style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Data Flow Monitor
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', marginLeft: '10px', verticalAlign: 'middle' }} />
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Live view of connector sync &amp; resync execution across the project.
              </div>
            </div>
            <button
              onClick={loadData}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '10px', border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <RefreshCw style={{ width: '16px', height: '16px', flexShrink: 0, animation: loading ? 'spin 1s linear infinite' : undefined }} />
              Refresh
            </button>
          </div>
        </div>

        {/* 4 KPI Cards — single row, grounded on real sync/execution data */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', overflow: 'visible' }}>
          {[
            { label: 'Active Jobs', value: `${kpis.active}`, badge: 'Currently running', icon: Play },
            { label: 'Completed', value: `${kpis.completed}`, badge: 'Finished successfully', icon: CheckCircle2 },
            { label: 'Failed Jobs', value: `${kpis.failed}`, badge: 'Runs with errors', icon: XCircle },
            { label: 'DLQ Depth', value: `${kpis.dlqDepth}`, badge: 'Needs operator review', icon: History }
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} style={{ borderRadius: '12px', border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px', overflow: 'visible' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500 }}>{card.label}</span>
                  <Icon style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
                </div>
                <div style={{ fontSize: '38px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1, padding: '8px 0' }}>{card.value}</div>
                <div style={{ marginTop: '12px' }}>
                  <span style={{ fontSize: '12px', color: '#22c55e' }}>{card.badge}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Execution Queue */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>Sync &amp; Execution Queue</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Background polls, backfills, and operator-triggered resyncs across all connectors.</div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ ...filterInputStyle, minWidth: '240px' }}>
                <Search style={{ width: '15px', height: '15px', color: 'var(--text-label)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={jobSearch}
                  onChange={(e) => setJobSearch(e.target.value)}
                  placeholder="Search job type, connector, or ID..."
                  style={inputStyle}
                />
              </div>
              <div style={filterInputStyle}>
                <Filter style={{ width: '15px', height: '15px', color: 'var(--text-label)', flexShrink: 0 }} />
                <select value={jobStatusFilter} onChange={(e) => setJobStatusFilter(e.target.value)} style={{ ...inputStyle, flex: 'none' }}>
                  <option value="" style={{ background: 'var(--bg-card)' }}>All Statuses</option>
                  <option value="RUNNING" style={{ background: 'var(--bg-card)' }}>Running</option>
                  <option value="COMPLETED" style={{ background: 'var(--bg-card)' }}>Completed</option>
                  <option value="FAILED" style={{ background: 'var(--bg-card)' }}>Failed</option>
                  <option value="DEGRADED" style={{ background: 'var(--bg-card)' }}>Degraded</option>
                  <option value="QUEUED" style={{ background: 'var(--bg-card)' }}>Queued</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ borderRadius: '12px', border: '1px solid var(--border-card)', background: 'var(--bg-input)', overflow: 'visible' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-card)', display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span style={{ ...headerColStyle, flex: 1.4 }}>Job Type / Connector</span>
              <span style={{ ...headerColStyle, width: '160px' }}>Started</span>
              <span style={{ ...headerColStyle, width: '110px' }}>Duration</span>
              <span style={{ ...headerColStyle, width: '150px' }}>Records</span>
              <span style={{ ...headerColStyle, width: '140px', textAlign: 'right' }}>Status</span>
            </div>

            {loading && (
              <div style={{ padding: '20px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>Loading execution activity...</div>
            )}
            {!loading && filteredJobs.length === 0 && (
              <div style={{ padding: '20px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>No sync or resync activity matches the current filters.</div>
            )}

            {filteredJobs.map((job, idx) => {
              const durationMs = job.completedAt && job.startedAt ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime() : null;
              const processed = Number(job.recordsProcessed) || 0;
              const failed = Number(job.recordsFailed) || 0;
              return (
                <div key={job.id || idx} style={{ padding: '14px 20px', borderBottom: idx === filteredJobs.length - 1 ? 'none' : '1px solid var(--border-card)', display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div style={{ flex: 1.4, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {getJobTypeIcon(job.type)}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{job.type}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-label)' }}>
                        {job.connector ? <span>{job.connector}</span> : <span style={{ fontFamily: 'monospace' }}>{String(job.id || '').substring(0, 8)}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ width: '160px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {job.startedAt ? new Date(job.startedAt).toLocaleString() : 'Pending'}
                  </div>
                  <div style={{ width: '110px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {durationMs !== null ? formatDuration(durationMs) : '—'}
                  </div>
                  <div style={{ width: '150px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {job.source === 'SYNC_RUN' ? (
                      <span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{processed.toLocaleString()}</span>
                        <span style={{ color: 'var(--text-label)' }}> ok</span>
                        {failed > 0 && <span style={{ color: '#f87171' }}> · {failed} fail</span>}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-label)' }}>—</span>
                    )}
                  </div>
                  <div style={{ width: '140px', textAlign: 'right' }}>{getJobStatusPill(job.status)}</div>
                </div>
              );
            })}
          </div>

          {/* DLQ sub-section */}
          <div style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <AlertOctagon style={{ width: '15px', height: '15px', color: '#f87171' }} />
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Dead Letter Queue</span>
              {kpis.dlqDepth > 0 && (
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '10px', color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
                  {kpis.dlqDepth} entries
                </span>
              )}
            </div>

            <div style={{ borderRadius: '12px', border: '2px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.04)', overflow: 'visible' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(248,113,113,0.15)', display: 'flex', gap: '16px', alignItems: 'center' }}>
                <span style={{ ...headerColStyle, width: '160px' }}>Failed Job ID</span>
                <span style={{ ...headerColStyle, width: '160px' }}>Category</span>
                <span style={{ ...headerColStyle, flex: 1 }}>Reason</span>
                <span style={{ ...headerColStyle, width: '130px' }}>Time in DLQ</span>
                <span style={{ ...headerColStyle, width: '220px', textAlign: 'right' }}>Actions</span>
              </div>

              {dlqEntries.length === 0 && (
                <div style={{ padding: '20px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  {loading ? 'Loading DLQ...' : 'No dead-letter entries. System is healthy.'}
                </div>
              )}

              {dlqEntries.map((entry, idx) => (
                <div key={entry.id || idx} style={{ padding: '14px 20px', borderBottom: idx === dlqEntries.length - 1 ? 'none' : '1px solid rgba(248,113,113,0.1)', display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div style={{ width: '160px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                    {String(entry.jobId || entry.id || '').substring(0, 8)}
                  </div>
                  <div style={{ width: '160px', fontSize: '11px', color: '#f87171' }}>{entry.failureCategory || '—'}</div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.reason}>
                    {entry.reason || '—'}
                  </div>
                  <div style={{ width: '130px', fontSize: '12px', color: 'var(--text-muted)' }}>{formatAgo(entry.createdAt)}</div>
                  <div style={{ width: '220px', textAlign: 'right', display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    {[
                      { label: 'Retry', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' },
                      { label: 'Skip', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' },
                      { label: 'Delete', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        disabled
                        title="Coming soon"
                        style={{ fontSize: '10px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px', border: btn.border, background: btn.bg, color: btn.color, cursor: 'not-allowed', opacity: 0.5 }}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Fixed bottom status bar */}
      <div style={{ position: 'fixed', bottom: '20px', left: '224px', zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border-input)', borderRadius: '999px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
        Live feed · System nominal
      </div>
    </>
  );
}
