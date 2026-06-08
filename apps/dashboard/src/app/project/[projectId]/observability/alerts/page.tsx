'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  Bell,
  Search,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Settings,
  History,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useConnectorFilter } from '@/hooks/useConnectorFilter';
import { PageRestricted } from '@/components/PageRestricted';

const pageStyle: React.CSSProperties = {
  padding: '24px 28px',
  maxWidth: '1280px',
  margin: '0 auto',
  display: 'block',
  overflow: 'visible',
};

const sectionSpacingStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  overflow: 'visible',
};

const metricGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '24px',
  marginBottom: '24px',
  overflow: 'visible',
};

const metricCardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  paddingTop: '24px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  minHeight: '140px',
  overflow: 'visible',
};

const metricTopRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '12px',
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--text-muted)',
  fontWeight: 500,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const metricValueStyle: React.CSSProperties = {
  fontSize: '38px',
  fontWeight: 500,
  color: 'var(--text-primary)',
  lineHeight: 1,
  padding: '8px 0',
  overflow: 'visible',
};

const metricBottomRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: '12px',
};

const panelGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '260px 1fr',
  gap: '24px',
  overflow: 'visible',
};

const leftColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const filterPanelStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  overflow: 'visible',
};

const filterTitleStyle: React.CSSProperties = {
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--text-label)',
  marginBottom: '16px',
  fontWeight: 500,
};

const alertPanelStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  overflow: 'visible',
};

const alertRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '14px 16px',
  borderRadius: '8px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-input)',
};

export default function AlertCenterPage() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();
  // Active store selection — drives which connector's alerts are shown and
  // triggers a live DB re-sync whenever the operator switches stores.
  const { connectorInstanceId, connectorLabel, connectorSelectionTick } = useConnectorFilter();

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [alerts, setAlerts]   = useState<any[]>([]);
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const permissions = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
      const nextAllowedPageKeys = Array.isArray(permissions?.allowedPageKeys) ? permissions.allowedPageKeys.map((v: any) => String(v)) : [];
      setAllowedPageKeys(nextAllowedPageKeys);

      if (!nextAllowedPageKeys.includes('observability/alerts')) return;

      // apiFetch auto-appends connector_instance_id for the active store, so the
      // backend scopes alerts to the selected connector. Do NOT add it to the URL
      // here as well, or it gets sent twice and the backend receives an array.
      const res = await apiFetch(`/api/v1/dashboard/alerts?siteId=${projectId}`, { suppressUnauthorizedRedirect: true });
      // Handle both {alerts:[]} and plain []
      const list = Array.isArray(res) ? res : (res?.alerts ?? []);
      // Defensive client-side scoping: when a store is selected, drop any alert
      // not tied to that connector (system-wide alerts have a null connector).
      const scoped = connectorInstanceId
        ? list.filter((a: any) => String(a?.connectorInstanceId ?? '') === connectorInstanceId)
        : list;
      setAlerts(scoped);
    } catch (err: any) {
      console.error('[AlertCenter] Load failed', err);
      setError('Failed to synchronize operational signals.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId, token, connectorInstanceId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Real-time re-synchronization when the operator switches the selected store.
  // Clear stale alerts immediately so the panel never shows another store's data,
  // then pull a fresh DB snapshot scoped to the newly selected connector.
  useEffect(() => {
    if (!token || !projectId) return;
    setAlerts([]);
    setSeverityFilter([]);
    setSourceFilter([]);
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectorSelectionTick]);

  // Derive stats from live alerts
  const stats = useMemo(() => {
    const active   = alerts.filter(a => a.status === 'active');
    const critical = active.filter(a => a.severity === 'critical');
    const resolved = alerts.filter(a => a.status === 'resolved');
    return { active: active.length, critical: critical.length, resolved: resolved.length };
  }, [alerts]);

  // Map backend alert shape → AlertList component shape
  const mappedAlerts = useMemo(() => alerts.map(a => ({
    id: a.alertId || a.id,
    title: a.message || a.kpiName || 'Alert',
    severity: (a.severity?.toUpperCase() as any) || 'HIGH',
    status: a.status === 'active' ? ('ACTIVE' as const) : ('RESOLVED' as const),
    timestamp: a.triggeredAt ? new Date(a.triggeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
    source: a.module || a.affectedEntity || 'System',
  })), [alerts]);

  // Severity filter shows the full standard set of levels at all times so the
  // operator can filter by any severity — even ones with no live alerts yet.
  const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'WARNING', 'MEDIUM', 'LOW', 'INFO'];
  const availableSeverities = SEVERITY_ORDER;
  // Per-severity counts from live alerts, shown as a badge next to each option.
  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of mappedAlerts) counts[a.severity] = (counts[a.severity] || 0) + 1;
    return counts;
  }, [mappedAlerts]);
  // Signal sources are dynamic (derived from the alert module/entity).
  const availableSources = useMemo(
    () => Array.from(new Set(mappedAlerts.map((a) => a.source).filter(Boolean))),
    [mappedAlerts],
  );
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of mappedAlerts) counts[a.source] = (counts[a.source] || 0) + 1;
    return counts;
  }, [mappedAlerts]);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  // Severity colour scheme: CRITICAL → orange, HIGH → red, others → neutral.
  const severityStyle = (severity: string) => {
    switch (String(severity || '').toUpperCase()) {
      case 'CRITICAL':
        return { icon: '#fb923c', bg: 'rgba(249,115,22,0.14)', text: '#f97316' };
      case 'HIGH':
        return { icon: '#f87171', bg: 'rgba(239,68,68,0.14)', text: '#ef4444' };
      default:
        return { icon: '#94a3b8', bg: 'rgba(148,163,184,0.16)', text: '#94a3b8' };
    }
  };

  const visibleAlerts = useMemo(
    () =>
      mappedAlerts.filter(
        (a) =>
          (severityFilter.length === 0 || severityFilter.includes(a.severity)) &&
          (sourceFilter.length === 0 || sourceFilter.includes(a.source)),
      ),
    [mappedAlerts, severityFilter, sourceFilter],
  );

  if (allowedPageKeys !== null && !allowedPageKeys.includes('observability/alerts')) {
    return <PageRestricted pageKey="observability/alerts" />;
  }

  if (loading && alerts.length === 0) {
    return (
      <div style={{ ...pageStyle, ...sectionSpacingStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-full border-4 border-t-indigo-500 border-slate-800 animate-spin mb-4" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Synchronizing Operational Signals…</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...pageStyle, ...sectionSpacingStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ maxWidth: '42rem', minWidth: 0 }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px', fontSize: '20px', lineHeight: 1.25, fontWeight: 500, color: 'var(--text-primary)' }}>
            <Bell style={{ width: '20px', height: '20px', color: '#818cf8', flexShrink: 0 }} />
            <span>Alert Center</span>
          </h1>
          <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
            Real-time operational alerts and threshold monitoring for {projectId as string}
            {connectorInstanceId ? <> · <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{connectorLabel}</span></> : ' · All stores'}
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          <button onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', flexShrink: 0, cursor: 'pointer' }}>
            <RefreshCw style={{ width: '16px', height: '16px', flexShrink: 0 }} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', flexShrink: 0, cursor: 'pointer' }}>
            <History style={{ width: '16px', height: '16px', flexShrink: 0 }} /> Audit Log
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: '1px solid rgba(96,165,250,0.2)', background: '#2563EB', padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: '#fff', flexShrink: 0, cursor: 'pointer' }}>
            <Settings style={{ width: '16px', height: '16px', flexShrink: 0 }} /> Rule Config
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ marginBottom: '20px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderRadius: '8px', border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.1)', padding: '12px 16px', color: '#fb7185', overflow: 'visible' }}>
          <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '12px' }}>
            <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            <span style={{ fontSize: '14px', textAlign: 'center', overflowWrap: 'anywhere' }}>{error}</span>
          </div>
          <button onClick={loadData} style={{ marginLeft: '8px', flexShrink: 0, fontSize: '14px', fontWeight: 500, textDecoration: 'underline', color: '#fb7185', cursor: 'pointer', background: 'transparent', border: 'none' }}>Retry</button>
        </div>
      )}

      {/* Quick Stats */}
      <div style={metricGridStyle}>
        {[
          { label: 'Active Alerts',   value: String(stats.active),   color: 'text-rose-400',    icon: ShieldAlert },
          { label: 'Critical',        value: String(stats.critical),  color: 'text-rose-500',    icon: AlertTriangle },
          { label: 'Resolved (live)', value: String(stats.resolved),  color: 'text-emerald-400', icon: CheckCircle2 },
          { label: 'Total Signals',   value: String(alerts.length),   color: 'text-indigo-400',  icon: Search },
        ].map((stat) => (
          <div key={stat.label} style={metricCardStyle}>
            <div style={metricTopRowStyle}>
              <span style={metricLabelStyle}>{stat.label}</span>
              <stat.icon style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
            </div>
            <div style={metricValueStyle}>{stat.value}</div>
            <div style={metricBottomRowStyle}>
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0, background: ['Critical', 'Active Alerts', 'Total Signals'].includes(stat.label) ? 'var(--error-bg)' : 'var(--success-bg)', color: ['Critical', 'Active Alerts', 'Total Signals'].includes(stat.label) ? 'var(--error-text)' : 'var(--success-text)' }}>{stat.label === 'Resolved (live)' ? 'RESOLVED' : stat.label === 'Total Signals' ? 'TOTAL' : stat.label === 'Active Alerts' ? 'ACTIVE' : 'CRITICAL'}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-label)', marginLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{stat.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={panelGridStyle}>
        {/* Sidebar Filters */}
        <div style={leftColumnStyle}>
          <div style={filterPanelStyle}>
            <p style={filterTitleStyle}>Severity Filter</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {availableSeverities.map((s) => {
                const sev = severityStyle(s);
                const count = severityCounts[s] || 0;
                return (
                  <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={severityFilter.includes(s)}
                      onChange={() => setSeverityFilter((list) => toggle(list, s))}
                      style={{ width: '14px', height: '14px', flexShrink: 0, accentColor: '#3b82f6' }}
                    />
                    <span style={{ flex: 1 }}>{s.charAt(0) + s.slice(1).toLowerCase()}</span>
                    <span style={{ padding: '1px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 600, background: sev.bg, color: sev.text, flexShrink: 0 }}>{count}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={filterPanelStyle}>
            <p style={filterTitleStyle}>Signal Source</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {availableSources.length === 0 ? (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No sources</span>
              ) : (
                availableSources.map((s) => (
                  <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={sourceFilter.includes(s)}
                      onChange={() => setSourceFilter((list) => toggle(list, s))}
                      style={{ width: '14px', height: '14px', flexShrink: 0, accentColor: '#3b82f6' }}
                    />
                    <span style={{ flex: 1 }}>{s}</span>
                    <span style={{ padding: '1px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 600, background: 'var(--bg-input)', color: 'var(--text-muted)', flexShrink: 0 }}>{sourceCounts[s] || 0}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>


        <div style={alertPanelStyle}>
          {visibleAlerts.length === 0 && !loading ? (
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '48px', paddingBottom: '48px', textAlign: 'center' }}>
              <CheckCircle2 style={{ width: '56px', height: '56px', marginBottom: '16px', color: '#10b981', flexShrink: 0 }} />
              <h3 style={{ marginBottom: '8px', fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)' }}>All Clear</h3>
              <p style={{ maxWidth: '20rem', fontSize: '14px', lineHeight: 1.625, color: 'var(--text-muted)' }}>No active alerts. All thresholds are within acceptable bounds.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {visibleAlerts.map((alert) => {
                const isActive = alert.status === 'ACTIVE';
                const rowIcon = isActive ? ShieldAlert : CheckCircle2;
                const sev = severityStyle(alert.severity);
                return (
                  <div key={alert.id} style={alertRowStyle}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
                      {React.createElement(rowIcon, { style: { width: '16px', height: '16px', marginTop: '2px', flexShrink: 0, color: isActive ? sev.icon : '#4ade80' } })}
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{alert.title}</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.08em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{alert.source}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, minWidth: 0 }}>
                      <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', background: sev.bg, color: sev.text, whiteSpace: 'nowrap', flexShrink: 0 }}>{alert.severity}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-label)', whiteSpace: 'nowrap', flexShrink: 0 }}>{alert.timestamp}</span>
                      <button style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 500, letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer' }}>INVESTIGATE</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}