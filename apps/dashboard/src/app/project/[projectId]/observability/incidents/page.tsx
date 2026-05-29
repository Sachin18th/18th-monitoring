 'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Flame,
  ExternalLink,
  MessageSquare,
  History,
  User,
  Clock,
  ChevronRight,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PageRestricted } from '@/components/PageRestricted';
import { useConnectorFilter } from '@/hooks/useConnectorFilter';

const pageStyle: React.CSSProperties = {
  padding: '24px 28px',
  maxWidth: '1280px',
  margin: '0 auto',
  display: 'block',
  overflow: 'visible',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  overflow: 'visible',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const headingRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '4px',
};

const headerTitleStyle: React.CSSProperties = {
  fontSize: '20px',
  lineHeight: 1.25,
  fontWeight: 500,
  color: 'var(--text-primary)',
};

const headerSubtitleStyle: React.CSSProperties = {
  marginBottom: '16px',
  fontSize: '14px',
  lineHeight: 1.6,
  color: 'var(--text-muted)',
  overflowWrap: 'anywhere',
};

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '12px',
};

const actionButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 16px',
  borderRadius: '8px',
  border: '1px solid var(--border-input)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  flexShrink: 0,
};

const dangerButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  border: '1px solid #fb7185',
  background: '#dd1641f5',
  color: '#fff',
};

const bannerStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '12px 16px',
  borderRadius: '8px',
  border: '1px solid rgba(244,63,94,0.2)',
  background: 'rgba(244,63,94,0.1)',
  color: '#fb7185',
  overflow: 'visible',
};

const statsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '24px',
  overflow: 'visible',
};

const statCardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  minHeight: '140px',
  overflow: 'visible',
};

const statHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '12px',
};

const statLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--text-muted)',
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const statValueStyle: React.CSSProperties = {
  fontSize: '38px',
  fontWeight: 500,
  color: 'var(--text-primary)',
  lineHeight: 1,
  padding: '8px 0',
  overflow: 'visible',
};

const statBottomStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: '12px',
};

const shellGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.7fr) minmax(320px, 1fr)',
  gap: '24px',
  overflow: 'visible',
};

const incidentColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  minWidth: 0,
};

const incidentCardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  overflow: 'visible',
};

const incidentCardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '16px',
  padding: '20px',
  borderBottom: '1px solid var(--border-card)',
};

const incidentCardFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '16px',
  padding: '12px 20px',
  background: '#f8f8f8',
};

const badgeBaseStyle: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: '999px',
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const sideColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const sideCardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  overflow: 'visible',
};

export default function IncidentCenterPage() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();
  const { connectorInstanceId } = useConnectorFilter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [performance, setPerformance] = useState<any>(null);
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;

    setLoading(true);
    setError(null);

    try {
      const permissions = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
      const nextAllowedPageKeys = Array.isArray(permissions?.allowedPageKeys) ? permissions.allowedPageKeys.map((value: any) => String(value)) : [];
      setAllowedPageKeys(nextAllowedPageKeys);

      if (!nextAllowedPageKeys.includes('observability/incidents')) return;

      const [incResponse, perfResponse] = await Promise.all([
        apiFetch(`/api/v1/dashboard/incidents?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/performance/summary?siteId=${projectId}`),
      ]);
      setIncidents(Array.isArray(incResponse) ? incResponse : []);
      setPerformance(perfResponse);
    } catch (err: any) {
      console.error('[Incidents] Load failed', err);
      setError('Failed to synchronize incident timeline. Please check platform health.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId, token, connectorInstanceId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (allowedPageKeys !== null && !allowedPageKeys.includes('observability/incidents')) {
    return <PageRestricted pageKey="observability/incidents" />;
  }

  if (loading && incidents.length === 0) {
    return (
      <div style={{ ...pageStyle, ...sectionStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '9999px', border: '4px solid #1f2937', borderTopColor: '#f43f5e', marginBottom: '16px', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Loading Incident Timeline…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...pageStyle, ...sectionStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ maxWidth: '36rem', width: '100%' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <AlertCircle style={{ width: '32px', height: '32px', color: '#f43f5e' }} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Desync Detected</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '28rem', margin: '0 auto 32px' }}>{error}</p>
          <button onClick={loadData} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 24px', borderRadius: '9999px', background: '#1f2937', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', border: 'none' }}>
            <RefreshCw style={{ width: '12px', height: '12px', flexShrink: 0, animation: 'spin 1s linear infinite' }} /> Retry Sync
          </button>
        </div>
      </div>
    );
  }

  const availabilityStatus = incidents.some(i => i.severity === 'CRITICAL' && i.status !== 'RESOLVED') ? 'Critical' : 'Nominal';
  const latencyStatus = (performance?.p95 > 3000) ? 'Degraded' : 'Nominal';
  const errorStatus = (performance?.errorRate > 2) ? 'Warning' : 'Nominal';

  return (
    <div style={{ ...pageStyle, ...sectionStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <div style={headerStyle}>
        <div style={{ maxWidth: '42rem', minWidth: 0 }}>
          <h1 style={headingRowStyle}>
            <Flame style={{ width: '20px', height: '20px', color: '#f43f5e', flexShrink: 0 }} />
            <span style={headerTitleStyle}>Incident Center</span>
          </h1>
          <p style={headerSubtitleStyle}>Lifecycle management and evidence tracking for project {projectId}</p>
        </div>

        <div style={actionRowStyle}>
          <button onClick={loadData} style={actionButtonStyle}>
            <RefreshCw style={{ width: '16px', height: '16px', flexShrink: 0, animation: loading ? 'spin 1s linear infinite' : undefined }} /> Refresh
          </button>
          <button style={dangerButtonStyle}>Create Manual Incident</button>
        </div>
      </div>

      <div style={statsGridStyle}>
        {[
          { label: 'Availability', value: availabilityStatus, color: availabilityStatus !== 'Nominal' ? '#f87171' : '#000000', icon: ShieldAlert },
          { label: 'Latency', value: latencyStatus, color: latencyStatus !== 'Nominal' ? '#fbbf24' : '#000000', icon: AlertTriangle },
          { label: 'Errors', value: errorStatus, color: errorStatus !== 'Nominal' ? '#f87171' : '#000000', icon: CheckCircle2 },
        ].map((stat) => (
          <div key={stat.label} style={statCardStyle}>
            <div style={statHeaderStyle}>
              <span style={statLabelStyle}>{stat.label}</span>
              <stat.icon style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
            </div>
            <div style={statValueStyle}>{stat.value}</div>
            <div style={statBottomStyle}>
              <span style={{ ...badgeBaseStyle, background: stat.value === 'Nominal' ? '#40d27692' : stat.color === '#fbbf24' ? '#78350f' : '#450a0a', color: stat.color }}>{stat.value.toUpperCase()}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-label)', marginLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{stat.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={shellGridStyle}>
        <div style={incidentColumnStyle}>
          {incidents.length === 0 ? (
            <div style={{ ...incidentCardStyle, minHeight: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', textAlign: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '9999px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                <CheckCircle2 style={{ width: '32px', height: '32px', color: '#10b981', flexShrink: 0 }} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Zero Active Incidents</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '20rem', lineHeight: 1.625 }}>All systems are currently performing within their defined SLA thresholds.</p>
            </div>
          ) : (
            incidents.map((inc) => {
              const isInvestigating = inc.status === 'INVESTIGATING' || inc.status === 'OPEN';
              const isMonitoring = inc.status === 'MONITORING';
              const statusBg = isInvestigating ? '#450a0a' : isMonitoring ? '#78350f' : '#40d27692';
              const statusColor = isInvestigating ? '#f87171' : isMonitoring ? '#fbbf24' : '#000000';
              const severityBg = inc.severity === 'CRITICAL' ? '#7f1d1d' : '#1f2937';
              const severityColor = inc.severity === 'CRITICAL' ? '#fff' : '#9ca3af';

              return (
                <div key={inc.id} style={incidentCardStyle}>
                  <div style={incidentCardHeaderStyle}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', minWidth: 0, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#64748b', fontWeight: 700, whiteSpace: 'nowrap' }}>{inc.id}</span>
                        <span style={{ ...badgeBaseStyle, background: statusBg, color: statusColor }}>{inc.status}</span>
                        <span style={{ ...badgeBaseStyle, background: severityBg, color: severityColor }}>{inc.severity}</span>
                      </div>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.title}</h3>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.impact}</p>
                    </div>
                    <button style={{ padding: '8px', borderRadius: '8px', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                      <ChevronRight style={{ width: '20px', height: '20px', color: '#475569' }} />
                    </button>
                  </div>

                  <div style={incidentCardFooterStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', minWidth: 0, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <User style={{ width: '14px', height: '14px', color: '#64748b', flexShrink: 0 }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{inc.owner}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock style={{ width: '14px', height: '14px', color: '#64748b', flexShrink: 0 }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(inc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexShrink: 0 }}>
                      <button style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <MessageSquare style={{ width: '14px', height: '14px', flexShrink: 0 }} /> Updates
                      </button>
                      <button style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#818cf8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <ExternalLink style={{ width: '14px', height: '14px', flexShrink: 0 }} /> Evidence
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={sideColumnStyle}>
          <div style={sideCardStyle}>
            <h3 style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', marginBottom: '24px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Current Health Overview</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { label: 'Availability', value: availabilityStatus, color: availabilityStatus !== 'Nominal' ? '#f87171' : '#34d399', icon: ShieldAlert },
                { label: 'Latency', value: latencyStatus, color: latencyStatus !== 'Nominal' ? '#fbbf24' : '#34d399', icon: AlertTriangle },
                { label: 'Errors', value: errorStatus, color: errorStatus !== 'Nominal' ? '#f87171' : '#34d399', icon: CheckCircle2 },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <item.icon style={{ width: '14px', height: '14px', color: '#475569', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{item.label}</span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: item.color, whiteSpace: 'nowrap' }}>{item.value}</span>
                </div>
              ))}
            </div>
            <button style={{ width: '100%', marginTop: '32px', padding: '8px 12px', borderRadius: '8px', background: '#d4dce9', border: 'none', color: 'var(--text-primary)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}>
              View Status Page
            </button>
          </div>

          <div style={{ ...sideCardStyle, background: 'rgba(79,70,229,0.05)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <History style={{ width: '20px', height: '20px', color: '#818cf8', marginBottom: '12px', flexShrink: 0 }} />
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Knowledge Base</h4>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Based on historical patterns, incidents involving <span style={{ color: '#818cf8' }}>Gateway Latency</span> are often resolved by scaling the <span style={{ color: '#e2e8f0' }}>Payment-Sync</span> worker group.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
