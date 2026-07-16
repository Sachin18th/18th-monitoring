'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Bell,
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
import { useConnectorPlatform } from '@/context/ConnectorPlatformContext';
import { PageRestricted } from '@/components/PageRestricted';
import { PageHero } from '@/components/PageHero';
import { AlertRuleConfigDrawer, matchTemplate, CATEGORIES } from '@/components/observability/AlertRuleConfigDrawer';

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
  gridTemplateColumns: '280px 1fr',
  gap: '24px',
  overflow: 'visible',
  // Grow to fill the remaining viewport height so the page doesn't look empty
  // when there are only a few alerts (the alert panel stretches to fit).
  flex: 1,
  minHeight: 0,
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

// Where "Investigate" sends the operator for each metric family — the page
// where they can actually dig into that signal.
const FAMILY_ROUTE: Record<string, string> = {
  pagespeed: 'performance',
  rum_errors: 'rum',
  orders: 'orders',
  customer_session: 'customers',
  journey: 'observability/journeys',
};

export default function AlertCenterPage() {
  const { projectId } = useParams();
  const router = useRouter();
  const { apiFetch, token } = useAuth();
  // Active store selection — drives which connector's alerts are shown and
  // triggers a live DB re-sync whenever the operator switches stores.
  const { connectorInstanceId, connectorLabel, connectorSelectionTick } = useConnectorFilter();
  // Alert rules only make sense once at least one store is connected — every
  // metric family (orders, pagespeed, errors, sessions, journeys) is sourced
  // from a connected store. With no store, there's nothing to watch, so we
  // block alert configuration until one is connected.
  const { connectedStores } = useConnectorPlatform();
  const hasStores = connectedStores.length > 0;

  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [alerts, setAlerts]   = useState<any[]>([]);
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [ruleConfigOpen, setRuleConfigOpen] = useState(false);
  const [rules, setRules] = useState<any[]>([]);
  const [ruleFilter, setRuleFilter] = useState<string[]>([]);

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
      // Alert Center is the rule-driven view: show only alerts raised by a
      // configured alert rule (alertType "rule:<id>"). The "All Alerts" page
      // (/alerts) shows every alert including order + system signals.
      const ruleBased = list.filter((a: any) => String(a?.alertType ?? '').startsWith('rule:'));
      // Rule-based alerts are project-wide (connectorInstanceId is null on the row).
      // Do NOT filter by store here — the rule evaluates project metrics and must
      // surface regardless of which store is selected in the UI.
      setAlerts(ruleBased);

      // Load configured rules so the page reflects what's being monitored
      // (this is the rule-management view). Non-fatal if it fails.
      try {
        const rulesRes = await apiFetch(`/api/v1/dashboard/alert-rules`, { suppressUnauthorizedRedirect: true });
        setRules(Array.isArray(rulesRes?.rules) ? rulesRes.rules : []);
      } catch {
        /* rules are secondary to alerts; ignore load errors */
      }
    } catch (err: any) {
      console.error('[AlertCenter] Load failed', err);
      setError('Failed to synchronize operational signals.');
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [apiFetch, projectId, token, connectorInstanceId]);

  // Stable ref always points to the latest loadData closure —
  // prevents the interval from going stale without re-creating it.
  const loadDataRef = useRef(loadData);
  useEffect(() => { loadDataRef.current = loadData; }, [loadData]);

  // Interval fires every 30 s. Empty deps: created once, never torn down by
  // apiFetch / AuthContext re-renders. Initial call returns early if token
  // isn't ready yet — the [token] effect below handles that case.
  useEffect(() => {
    loadDataRef.current();
    const interval = setInterval(() => loadDataRef.current(), 30_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger an immediate load the moment the auth token becomes available
  // (the interval's first tick can be up to 30 s away).
  useEffect(() => {
    if (token) loadDataRef.current();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-synchronize when the operator switches the active store.
  // Clear stale data immediately, then pull a scoped snapshot.
  useEffect(() => {
    if (!token || !projectId) return;
    setAlerts([]);
    setSeverityFilter([]);
    setRuleFilter([]);
    loadDataRef.current();
  }, [connectorSelectionTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive stats from live alerts
  const stats = useMemo(() => {
    const active   = alerts.filter(a => a.status === 'active');
    const critical = active.filter(a => a.severity === 'critical');
    const resolved = alerts.filter(a => a.status === 'resolved');
    return { active: active.length, critical: critical.length, resolved: resolved.length };
  }, [alerts]);

  // Rule-management stats — this page owns alert rules, so surface their state.
  const ruleStats = useMemo(() => {
    const enabled = rules.filter((r) => r.enabled).length;
    return { total: rules.length, enabled };
  }, [rules]);

  // Resolve the ruleId an alert came from (context.ruleId or "rule:<id>").
  const alertRuleId = (a: any): string => {
    if (a?.context?.ruleId) return String(a.context.ruleId);
    const t = String(a?.alertType ?? '');
    return t.startsWith('rule:') ? t.slice(5) : '';
  };
  const rulesById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const r of rules) m[r.id] = r;
    return m;
  }, [rules]);

  // Map backend alert shape → AlertList component shape
  const mappedAlerts = useMemo(() => alerts.map(a => {
    const ruleId = alertRuleId(a);
    const rule = rulesById[ruleId];
    const tpl = matchTemplate(rule?.criteria?.metricFamily, rule?.criteria?.metric);
    const categoryLabel = CATEGORIES.find(c => c.id === tpl?.categoryId)?.label;
    return {
      id: a.alertId || a.id,
      ruleId,
      title: tpl?.title || a.message || a.kpiName || 'Alert',
      severity: (a.severity?.toUpperCase() as any) || 'HIGH',
      status: a.status === 'active' ? ('ACTIVE' as const) : ('RESOLVED' as const),
      timestamp: a.triggeredAt ? new Date(a.triggeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
      source: categoryLabel || a.module || a.affectedEntity || 'System',
      // Metric family drives where "Investigate" navigates. Prefer the alert's
      // own context, fall back to the rule's criteria, then the module column.
      metricFamily: a.context?.metricFamily || rule?.criteria?.metricFamily || a.module || '',
    };
  }), [alerts, rulesById]);

  // "Investigate" → jump to the page for this alert's metric family.
  const investigate = useCallback((metricFamily: string) => {
    const sub = FAMILY_ROUTE[metricFamily] || 'overview';
    router.push(`/project/${projectId}/${sub}`);
  }, [router, projectId]);

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
          (ruleFilter.length === 0 || ruleFilter.includes(a.ruleId)),
      ),
    [mappedAlerts, severityFilter, ruleFilter],
  );

  if (allowedPageKeys !== null && !allowedPageKeys.includes('observability/alerts')) {
    return <PageRestricted pageKey="observability/alerts" />;
  }

  if (!initialLoaded) {
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
        <PageHero
          icon={Bell}
          eyebrow="Command Center"
          title="Alert Center"
          subtitle={
            <>
              Rule-based alerts and threshold monitoring for {projectId as string} · configure rules via Rule Config. See every alert on the All Alerts page.
              {connectorInstanceId ? <> · <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{connectorLabel}</span></> : ' · All stores'}
            </>
          }
          live
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          <button onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', flexShrink: 0, cursor: 'pointer' }}>
            <RefreshCw style={{ width: '16px', height: '16px', flexShrink: 0 }} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {/* <button style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', flexShrink: 0, cursor: 'pointer' }}>
            <History style={{ width: '16px', height: '16px', flexShrink: 0 }} /> Audit Log
          </button> */}
          <button
            onClick={() => hasStores && setRuleConfigOpen(true)}
            disabled={!hasStores}
            title={hasStores ? 'Configure alert rules' : 'Connect a store before configuring alerts'}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: '1px solid rgba(96,165,250,0.2)', background: '#2563EB', padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: '#fff', flexShrink: 0, cursor: hasStores ? 'pointer' : 'not-allowed', opacity: hasStores ? 1 : 0.5 }}
          >
            <Settings style={{ width: '16px', height: '16px', flexShrink: 0 }} />  Configure Rule
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

      {/* Quick Stats — rule-focused: live rule alerts + configured rule state */}
      <div style={metricGridStyle}>
        {[
          { label: 'Active Alerts',    value: String(stats.active),       icon: ShieldAlert,   tone: stats.active > 0 ? 'error' : 'success',   tag: 'LIVE' },
          { label: 'Critical',         value: String(stats.critical),     icon: AlertTriangle, tone: stats.critical > 0 ? 'error' : 'success', tag: 'CRITICAL' },
          { label: 'Configured Rules', value: String(ruleStats.total),    icon: Settings,      tone: 'success',                                tag: 'RULES' },
          { label: 'Enabled Rules',    value: String(ruleStats.enabled),  icon: CheckCircle2,  tone: 'success',                                tag: 'ENABLED' },
        ].map((stat) => (
          <div key={stat.label} style={metricCardStyle}>
            <div style={metricTopRowStyle}>
              <span style={metricLabelStyle}>{stat.label}</span>
              <stat.icon style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
            </div>
            <div style={metricValueStyle}>{stat.value}</div>
            <div style={metricBottomRowStyle}>
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0, background: stat.tone === 'error' ? 'var(--error-bg)' : 'var(--success-bg)', color: stat.tone === 'error' ? 'var(--error-text)' : 'var(--success-text)' }}>{stat.tag}</span>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <p style={{ ...filterTitleStyle, marginBottom: 0 }}>Filter by Rule</p>
              <button
                onClick={() => hasStores && setRuleConfigOpen(true)}
                disabled={!hasStores}
                title={hasStores ? 'Manage alert rules' : 'Connect a store before configuring alerts'}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', color: '#60a5fa', fontSize: '11px', fontWeight: 600, cursor: hasStores ? 'pointer' : 'not-allowed', opacity: hasStores ? 1 : 0.5, padding: 0 }}
              >
                <Settings style={{ width: '12px', height: '12px' }} /> Manage
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {rules.length === 0 ? (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {hasStores
                    ? <>No rules yet. Click <strong>Manage</strong> to create one.</>
                    : <>Connect a store first, then create alert rules.</>}
                </span>
              ) : (
                rules.map((r) => (
                    <label
                      key={r.id}
                      title={`${r.criteria?.metric} ${r.criteria?.operator} ${r.criteria?.threshold}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={ruleFilter.includes(r.id)}
                        onChange={() => setRuleFilter((list) => toggle(list, r.id))}
                        style={{ width: '14px', height: '14px', flexShrink: 0, accentColor: '#3b82f6' }}
                      />
                      <span title={r.enabled ? 'Enabled' : 'Disabled'} style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: r.enabled ? '#10b981' : 'var(--text-muted)' }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {matchTemplate(r.criteria?.metricFamily, r.criteria?.metric)?.title || r.name}
                      </span>
                    </label>
                ))
              )}
            </div>
          </div>
        </div>


        <div style={alertPanelStyle}>
          {visibleAlerts.length === 0 && !loading ? (
            rules.length === 0 ? (
              !hasStores ? (
                <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '48px', paddingBottom: '48px', textAlign: 'center' }}>
                  <ShieldAlert style={{ width: '56px', height: '56px', marginBottom: '16px', color: '#94a3b8', flexShrink: 0 }} />
                  <h3 style={{ marginBottom: '8px', fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)' }}>Connect a store first</h3>
                  <p style={{ maxWidth: '22rem', fontSize: '14px', lineHeight: 1.625, color: 'var(--text-muted)' }}>Alerts watch your store's orders, performance, errors and traffic. Connect a store to start configuring alert rules.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '48px', paddingBottom: '48px', textAlign: 'center' }}>
                  <Bell style={{ width: '56px', height: '56px', marginBottom: '16px', color: '#818cf8', flexShrink: 0 }} />
                  <h3 style={{ marginBottom: '8px', fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)' }}>No alert rules yet</h3>
                  <p style={{ maxWidth: '22rem', fontSize: '14px', lineHeight: 1.625, color: 'var(--text-muted)', marginBottom: '20px' }}>Create a rule to start monitoring your KPIs — when a threshold is breached, an alert appears here and recipients get emailed.</p>
                  <button onClick={() => setRuleConfigOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: 'none', background: '#2563EB', padding: '9px 16px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
                    <Settings style={{ width: '16px', height: '16px' }} /> Configure Rule
                  </button>
                </div>
              )
            ) : (
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '48px', paddingBottom: '48px', textAlign: 'center' }}>
                <CheckCircle2 style={{ width: '56px', height: '56px', marginBottom: '16px', color: '#10b981', flexShrink: 0 }} />
                <h3 style={{ marginBottom: '8px', fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)' }}>All Clear</h3>
                <p style={{ maxWidth: '22rem', fontSize: '14px', lineHeight: 1.625, color: 'var(--text-muted)' }}>{ruleStats.enabled} of {ruleStats.total} rule{ruleStats.total === 1 ? '' : 's'} active — no thresholds breached.</p>
              </div>
            )
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
                      <button onClick={() => investigate(alert.metricFamily)} title="Open the page for this signal" style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 500, letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer' }}>INVESTIGATE</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AlertRuleConfigDrawer
        isOpen={ruleConfigOpen && hasStores}
        onClose={() => setRuleConfigOpen(false)}
        projectId={projectId as string}
        apiFetch={apiFetch}
        onChanged={loadData}
        connectorInstanceId={connectorInstanceId ?? null}
        connectorLabel={connectorLabel}
      />
    </div>
  );
}