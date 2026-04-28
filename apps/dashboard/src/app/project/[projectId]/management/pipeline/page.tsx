'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../../../context/AuthContext';
import { useParams } from 'next/navigation';
import {
  GitMerge,
  Play,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Settings2,
  Clock,
  History,
  RefreshCw,
  Search,
  Filter
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

export default function PipelineMonitorPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { token, apiFetch } = useAuth();

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const response = await apiFetch(`/api/v1/tenants/current/projects/${projectId}/pipeline/jobs`);
      setJobs(response?.data?.jobs || []);
    } catch (err) {
      console.error('Failed to load pipeline jobs', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getJobTypeIcon = (type: string) => {
    switch (type) {
      case 'INGESTION':
        return <GitMerge style={{ width: '16px', height: '16px', color: '#a78bfa' }} />;
      case 'TRANSFORMATION':
        return <Settings2 style={{ width: '16px', height: '16px', color: '#60a5fa' }} />;
      case 'AGGREGATION':
        return <History style={{ width: '16px', height: '16px', color: '#22c55e' }} />;
      default:
        return <GitMerge style={{ width: '16px', height: '16px', color: 'var(--text-muted)' }} />;
    }
  };

  const getStatusPill = (status: string) => {
    const map: Record<string, { color: string; border: string; bg: string; icon: React.ReactNode }> = {
      RUNNING: {
        color: '#60a5fa',
        border: '1px solid rgba(96,165,250,0.2)',
        bg: 'rgba(96,165,250,0.08)',
        icon: <Play style={{ width: '16px', height: '16px' }} />
      },
      COMPLETED: {
        color: '#22c55e',
        border: '1px solid rgba(34,197,94,0.2)',
        bg: 'rgba(34,197,94,0.08)',
        icon: <CheckCircle2 style={{ width: '16px', height: '16px' }} />
      },
      FAILED: {
        color: '#f87171',
        border: '1px solid rgba(248,113,113,0.2)',
        bg: 'rgba(248,113,113,0.08)',
        icon: <XCircle style={{ width: '16px', height: '16px' }} />
      },
      DEAD_LETTERED: {
        color: '#f87171',
        border: '1px solid rgba(248,113,113,0.2)',
        bg: 'rgba(248,113,113,0.08)',
        icon: <AlertOctagon style={{ width: '16px', height: '16px' }} />
      },
      QUEUED: {
        color: '#fbbf24',
        border: '1px solid rgba(251,191,36,0.2)',
        bg: 'rgba(251,191,36,0.08)',
        icon: <Clock style={{ width: '16px', height: '16px' }} />
      }
    };

    const style = map[status] || {
      color: 'var(--text-secondary)',
      border: '1px solid var(--border-input)',
      bg: 'var(--bg-input)',
      icon: null
    };

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 10px',
          borderRadius: '999px',
          fontSize: '10px',
          color: style.color,
          border: style.border,
          background: style.bg,
          whiteSpace: 'nowrap'
        }}
      >
        {style.icon}
        {status}
      </span>
    );
  };

  return (
    <>
      <div style={pageStyle}>
        <div style={{ marginBottom: '8px', overflow: 'visible' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <GitMerge style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
            </div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)' }}>
              Execution Backbone
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, maxWidth: '760px' }}>
              <div style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Pipeline &amp; Execution Backbone
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#22c55e',
                    display: 'inline-block',
                    marginLeft: '10px',
                    verticalAlign: 'middle'
                  }}
                />
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Monitor asynchronous streaming workloads, view checkpoints, and manage the dead letter queue.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={loadData}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw style={{ width: '16px', height: '16px', flexShrink: 0, animation: loading ? 'spin 1s linear infinite' : undefined }} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', overflow: 'visible' }}>
          {[
            { label: 'Active Jobs', value: `${jobs.filter((j) => j.status === 'RUNNING').length}`, badge: 'Worker pool occupancy', icon: Play },
            { label: 'Completed (24h)', value: `${jobs.filter((j) => j.status === 'COMPLETED').length}`, badge: 'Finished successfully', icon: CheckCircle2 },
            {
              label: 'Retrying Process',
              value: `${jobs.filter((j) => j.attempts > 0 && j.status !== 'DEAD_LETTERED' && j.status !== 'COMPLETED').length}`,
              badge: 'Active retry loop',
              icon: RefreshCw
            },
            { label: 'Dead Letter Queue', value: `${jobs.filter((j) => j.status === 'DEAD_LETTERED').length}`, badge: 'Needs operator review', icon: AlertOctagon }
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                style={{
                  borderRadius: '12px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '140px',
                  overflow: 'visible'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500 }}>
                    {card.label}
                  </span>
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

        <div style={cardStyle}>
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', marginBottom: '6px' }}>
              Pipeline Execution Queue
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Live view into the execution worker pool across the project footprint.
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              marginBottom: '20px'
            }}
          >
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
              Queue Filters
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-input)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  minWidth: '240px'
                }}
              >
                <Search style={{ width: '16px', height: '16px', color: 'var(--text-label)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search correlation ID or job..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-input)',
                  borderRadius: '10px',
                  padding: '8px 12px'
                }}
              >
                <Filter style={{ width: '16px', height: '16px', color: 'var(--text-label)', flexShrink: 0 }} />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                >
                  <option value="" style={{ background: 'var(--bg-card)' }}>All Statuses</option>
                  <option value="RUNNING" style={{ background: 'var(--bg-card)' }}>Running</option>
                  <option value="COMPLETED" style={{ background: 'var(--bg-card)' }}>Completed</option>
                  <option value="DEAD_LETTERED" style={{ background: 'var(--bg-card)' }}>Failed/DLQ</option>
                </select>
              </div>
            </div>
          </div>

          <div
            style={{
              borderRadius: '12px',
              border: '1px solid var(--border-card)',
              background: 'var(--bg-input)',
              padding: '0',
              overflow: 'visible'
            }}
          >
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-card)' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', color: 'var(--text-label)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <span style={{ flex: 1.4 }}>Job Type</span>
                <span style={{ width: '160px' }}>Started</span>
                <span style={{ width: '130px' }}>Status</span>
                <span style={{ width: '100px', textAlign: 'right' }}>Retries</span>
              </div>
            </div>

            {jobs.map((job, idx) => (
              <div
                key={job.id || idx}
                style={{
                  padding: '14px 20px',
                  borderBottom: idx === jobs.length - 1 ? 'none' : '1px solid var(--border-card)',
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'center'
                }}
              >
                <div style={{ flex: 1.4, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  {getJobTypeIcon(job.type)}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{job.type}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-label)', fontFamily: 'monospace' }}>{job.id?.substring(0, 8)}</div>
                  </div>
                </div>
                <div style={{ width: '160px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {job.startedAt ? new Date(job.startedAt).toLocaleTimeString() : 'Pending'}
                </div>
                <div style={{ width: '130px' }}>{getStatusPill(job.status)}</div>
                <div
                  style={{
                    width: '100px',
                    textAlign: 'right',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    color: job.attempts > 0 ? '#fbbf24' : 'rgba(255,255,255,0.35)'
                  }}
                >
                  {job.attempts} / {job.maxRetries}
                </div>
              </div>
            ))}

            {!loading && jobs.length === 0 && (
              <div style={{ padding: '20px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                No pipeline activity in this dimension.
              </div>
            )}

            {loading && (
              <div style={{ padding: '20px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Loading pipeline activity...
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '24px',
          zIndex: 50,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-input)',
          borderRadius: '999px',
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)'
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
        Live feed · System nominal
      </div>
    </>
  );
}
