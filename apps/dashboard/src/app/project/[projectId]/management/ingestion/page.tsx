'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../../../../context/AuthContext';
import { useParams } from 'next/navigation';
import {
  Database,
  Webhook,
  Files,
  RefreshCw,
  CheckCircle2,
  XCircle,
  FileCode,
  Search,
  Activity,
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

export default function IngestionMonitorPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { token, apiFetch } = useAuth();

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const response = await apiFetch(`/api/v1/tenants/current/projects/${projectId}/ingestion/events`);
      setEvents(response?.data || []);
    } catch (err) {
      console.error('Failed to load ingestion events', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'WEBHOOK':
        return <Webhook style={{ width: '16px', height: '16px', color: '#60a5fa' }} />;
      case 'POLLING':
        return <RefreshCw style={{ width: '16px', height: '16px', color: '#a78bfa' }} />;
      case 'FILE_IMPORT':
        return <Files style={{ width: '16px', height: '16px', color: '#22c55e' }} />;
      default:
        return <Database style={{ width: '16px', height: '16px', color: 'var(--text-muted)' }} />;
    }
  };

  const getStatusPill = (status: string) => {
    const map: Record<string, { color: string; border: string; bg: string }> = {
      QUEUED: { color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', bg: 'rgba(34,197,94,0.08)' },
      COMPLETED: { color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', bg: 'rgba(34,197,94,0.08)' },
      REJECTED: { color: '#f87171', border: '1px solid rgba(248,113,113,0.2)', bg: 'rgba(248,113,113,0.08)' },
      FAILED: { color: '#f87171', border: '1px solid rgba(248,113,113,0.2)', bg: 'rgba(248,113,113,0.08)' },
      ARCHIVED: { color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', bg: 'rgba(96,165,250,0.08)' }
    };
    const style = map[status] || { color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)', bg: 'rgba(251,191,36,0.08)' };
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: '999px',
          fontSize: '10px',
          color: style.color,
          border: style.border,
          background: style.bg,
          whiteSpace: 'nowrap'
        }}
      >
        {status}
      </span>
    );
  };

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        String(event.sourceReferenceId || '').toLowerCase().includes(q) ||
        String(event.id || '').toLowerCase().includes(q);
      const matchesStatus = !statusFilter || event.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [events, searchQuery, statusFilter]);

  const validRate = events.length > 0 ? Math.round((events.filter((e) => e.validation?.isValid).length / events.length) * 100) : 100;

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
              <Activity style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
            </div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)' }}>
              Data Operations
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, maxWidth: '760px' }}>
              <div style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Ingestion Monitor
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
                Real-time visibility into every data point entering the platform.
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
            { label: 'Intake Volume (24h)', value: `${events.length}`, badge: '+12%', icon: Database },
            { label: 'Validation Rate', value: `${validRate}%`, badge: 'Payload acceptance', icon: CheckCircle2 },
            { label: 'Rejection Queue', value: `${events.filter((e) => e.status === 'REJECTED').length}`, badge: 'Requires intervention', icon: XCircle },
            { label: 'Artifact Archival', value: '100%', badge: 'Retention integrity', icon: Files }
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

        <div
          style={{
            borderRadius: '12px',
            border: '1px solid var(--border-card)',
            background: 'var(--bg-card)',
            padding: '24px',
            overflow: 'visible'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
              Intake Filters
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
                  placeholder="Search Source Ref or ID..."
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
                  <option value="QUEUED" style={{ background: 'var(--bg-card)' }}>Queued</option>
                  <option value="REJECTED" style={{ background: 'var(--bg-card)' }}>Rejected</option>
                  <option value="ARCHIVED" style={{ background: 'var(--bg-card)' }}>Archived</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div style={{ overflow: 'visible' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
              Ingestion Events
            </div>
            <span
              style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: '999px',
                fontSize: '10px',
                border: '1px solid var(--border-input)',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap'
              }}
            >
              {filteredEvents.length} events
            </span>
          </div>

          <div
            style={{
              borderRadius: '12px',
              border: '1px solid var(--border-card)',
              background: 'var(--bg-card)',
              padding: '0',
              overflow: 'visible'
            }}
          >
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-card)' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', color: 'var(--text-label)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <span style={{ width: '150px' }}>Mode</span>
                <span style={{ width: '190px' }}>Time</span>
                <span style={{ flex: 1 }}>Source Ref</span>
                <span style={{ width: '110px' }}>Validation</span>
                <span style={{ width: '110px' }}>Status</span>
                <span style={{ width: '50px', textAlign: 'right' }}>Raw</span>
              </div>
            </div>

            {filteredEvents.map((event, idx) => (
              <button
                key={event.id || idx}
                type="button"
                onClick={() => console.log('Details for:', event.id)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '14px 20px',
                  borderBottom: idx === filteredEvents.length - 1 ? 'none' : '1px solid var(--border-card)',
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'center',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: 'var(--text-primary)'
                }}
              >
                <div style={{ width: '150px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {getModeIcon(event.mode)}
                  <span style={{ fontSize: '12px', fontWeight: 500 }}>{event.mode}</span>
                </div>
                <div style={{ width: '190px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {new Date(event.receivedAt).toLocaleString()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {event.sourceReferenceId ? (
                    <code
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        background: 'var(--bg-input)',
                        borderRadius: '6px',
                        padding: '2px 6px'
                      }}
                    >
                      {event.sourceReferenceId}
                    </code>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--text-label)' }}>-</span>
                  )}
                </div>
                <div style={{ width: '110px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {event.validation?.isValid ? (
                    <CheckCircle2 style={{ width: '16px', height: '16px', color: '#22c55e' }} />
                  ) : (
                    <XCircle style={{ width: '16px', height: '16px', color: '#f87171' }} />
                  )}
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                    {event.validation?.isValid ? 'Valid' : 'Blocked'}
                  </span>
                </div>
                <div style={{ width: '110px' }}>{getStatusPill(event.status)}</div>
                <div style={{ width: '50px', textAlign: 'right' }}>
                  {event.artifactId ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.alert(`Fetching artifact: ${event.artifactId}`);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#60a5fa',
                        padding: 0
                      }}
                    >
                      <FileCode style={{ width: '16px', height: '16px' }} />
                    </button>
                  ) : null}
                </div>
              </button>
            ))}

            {!loading && filteredEvents.length === 0 && (
              <div style={{ padding: '20px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                No ingestion events match the current filters.
              </div>
            )}

            {loading && (
              <div style={{ padding: '20px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Loading ingestion events...
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
