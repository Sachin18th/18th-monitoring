'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Activity,
  Server,
  Zap,
  ShieldAlert,
  Clock,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  KeyRound,
  CreditCard,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PageRestricted } from '@/components/PageRestricted';
import { useConnectorFilter } from '@/hooks/useConnectorFilter';
import { PaymentGatewayPanel } from '@/components/observability/PaymentGatewayPanel';
import { SmsGatewayPanel } from '@/components/observability/SmsGatewayPanel';
import {
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const pageStyle: React.CSSProperties = {
  padding: '24px 28px',
  maxWidth: '1280px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  overflow: 'visible',
  boxSizing: 'border-box',
};

type HealthState = 'healthy' | 'auth_failed' | 'degraded' | 'unreachable' | 'unknown';

// Visual treatment per interpreted store-API state.
const STATE_META: Record<HealthState, { label: string; color: string; bg: string; Icon: any }> = {
  healthy: { label: 'Healthy', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', Icon: CheckCircle2 },
  auth_failed: { label: 'Auth Failed', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', Icon: KeyRound },
  degraded: { label: 'Degraded', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', Icon: ShieldAlert },
  unreachable: { label: 'Unreachable', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', Icon: XCircle },
  unknown: { label: 'No Data', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', Icon: AlertCircle },
};

const STATUS_CODE_COLORS: Record<string, string> = {
  '2xx': '#22c55e',
  '3xx': '#818cf8',
  '4xx': '#f59e0b',
  '5xx': '#ef4444',
  err: '#94a3b8',
};

const PROVIDER_LABEL: Record<string, string> = {
  shopify: 'Shopify',
  bigcommerce: 'BigCommerce',
  adobe_commerce: 'Adobe Commerce',
  adobe: 'Adobe Commerce',
  magento: 'Adobe Commerce',
};

interface ConnectorHealth {
  connectorInstanceId: string;
  label: string;
  provider: string;
  state: HealthState;
  ok: boolean | null;
  statusCode: number | null;
  latencyMs: number | null;
  p95: number | null;
  uptime: number | null;
  checks: number;
  lastError: string | null;
  lastCheckedAt: string | null;
}

interface OverviewPayload {
  summary?: {
    totalChecks: number;
    storesMonitored: number;
    storesHealthy: number;
    storesDown: number;
    errorRate: number;
    uptime: number;
    p50: number;
    p95: number;
    p99: number;
  };
  connectors?: ConnectorHealth[];
  statusCodes?: { name: string; value: number }[];
  latencyTrend?: { timestamp: string; p50: number; p95: number; p99: number }[];
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function BackendObservabilityPage() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();
  const { connectorInstanceId } = useConnectorFilter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);
  // Which check group is on screen — Store APIs and Payment Gateways are
  // distinct health checks, shown one at a time via the segmented control.
  const [view, setView] = useState<'stores' | 'gateways' | 'sms'>('stores');

  // Call the scoped path directly with the URL projectId (like the Integrations
  // page) rather than /api/v1/dashboard, so we never depend on a possibly-stale
  // currentProject in AuthContext. The query siteId is a belt-and-braces backup.
  const basePath = () => `/api/v1/tenants/current/projects/${projectId}/api-health`;
  const query = () => {
    const params = new URLSearchParams({ siteId: String(projectId) });
    if (connectorInstanceId && connectorInstanceId !== 'all') {
      params.set('connector_instance_id', String(connectorInstanceId));
    }
    return params.toString();
  };

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;

    setLoading(true);
    setError(null);

    try {
      const permissions = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
      const nextAllowedPageKeys = Array.isArray(permissions?.allowedPageKeys) ? permissions.allowedPageKeys.map((value: any) => String(value)) : [];
      setAllowedPageKeys(nextAllowedPageKeys);

      if (!nextAllowedPageKeys.includes('observability/backend')) return;

      const overview = await apiFetch(`${basePath()}/overview?${query()}`);
      setData(overview || {});
    } catch (err: any) {
      console.error('[BackendObs] Load failed', err);
      setError('Failed to load store API health. Please check integration configuration.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, projectId, token, connectorInstanceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // On-demand: probe every store right now, then show fresh numbers.
  const runProbeNow = useCallback(async () => {
    if (!token || !projectId) return;
    setRefreshing(true);
    setError(null);
    try {
      // Live probe hits every store API (up to ~8s each); allow ample time so
      // the request isn't aborted by the default 10s client timeout.
      const overview = await apiFetch(`${basePath()}/run?${query()}`, { method: 'POST', timeout: 60000 });
      if (overview) setData(overview);
    } catch (err: any) {
      console.error('[BackendObs] Probe run failed', err);
      setError('Failed to run the live probe. The store APIs may be slow to respond — try again.');
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, projectId, token, connectorInstanceId]);

  const isPageRestricted = allowedPageKeys !== null && !allowedPageKeys.includes('observability/backend');
  if (isPageRestricted) {
    return <PageRestricted pageKey="observability/backend" />;
  }

  if (loading && !data) {
    return (
      <div style={{ ...pageStyle, minHeight: '100vh', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '999px',
              border: '4px solid var(--border-card)',
              borderTopColor: '#6366f1',
              marginBottom: '16px',
              animation: 'spin 1s linear infinite',
              boxSizing: 'border-box',
            }}
          />
          <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
            Probing Store APIs...
          </span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ ...pageStyle, minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: '100%',
            maxWidth: '560px',
            borderRadius: '12px',
            border: '1px solid var(--border-card)',
            background: 'var(--bg-card)',
            padding: '24px',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'rgba(244,63,94,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              border: '1px solid rgba(244,63,94,0.2)',
              boxSizing: 'border-box',
            }}
          >
            <AlertCircle style={{ width: '32px', height: '32px', color: '#f43f5e' }} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Telemetry Desync</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '448px', margin: '0 auto 32px' }}>{error}</p>
          <button
            onClick={loadData}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-card)',
              background: 'transparent',
              fontSize: '13px',
              color: 'var(--text-primary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
          >
            <RefreshCw style={{ width: '14px', height: '14px', flexShrink: 0 }} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const summary = data?.summary;
  const connectors = data?.connectors || [];
  const statusCodes = data?.statusCodes || [];
  const latencyTrend = data?.latencyTrend || [];

  const metricItems = [
    {
      label: 'Stores Healthy',
      value: `${summary?.storesHealthy ?? 0}/${summary?.storesMonitored ?? 0}`,
      unit: '',
      icon: Server,
      status: (summary?.storesDown ?? 0) > 0 ? ('CRITICAL' as const) : ('HEALTHY' as const),
      context: 'Reachable + token valid',
    },
    {
      label: 'Error Rate',
      value: `${summary?.errorRate ?? 0}`,
      unit: '%',
      icon: ShieldAlert,
      status: (summary?.errorRate ?? 0) > 2 ? ('CRITICAL' as const) : ('HEALTHY' as const),
      context: 'Failed probes (24h)',
    },
    {
      label: 'P95 Latency',
      value: `${summary?.p95 ?? 0}`,
      unit: 'ms',
      icon: Clock,
      status: (summary?.p95 ?? 0) > 2500 ? ('WARNING' as const) : ('SUCCESS' as const),
      context: '95th percentile (24h)',
    },
    {
      label: 'Uptime',
      value: `${summary?.uptime ?? 0}`,
      unit: '%',
      icon: Activity,
      status: (summary?.uptime ?? 100) < 99 ? ('WARNING' as const) : ('SUCCESS' as const),
      context: 'Availability (24h)',
    },
  ];

  const statusBadge = (status: 'HEALTHY' | 'SUCCESS' | 'WARNING' | 'CRITICAL') => {
    if (status === 'WARNING') return { background: 'var(--warning-bg)', color: 'var(--warning-text)' };
    if (status === 'CRITICAL') return { background: 'var(--error-bg)', color: 'var(--error-text)' };
    return { background: 'var(--success-bg)', color: 'var(--success-text)' };
  };

  const cardStyle: React.CSSProperties = {
    borderRadius: '12px',
    border: '1px solid var(--border-card)',
    background: 'var(--bg-card)',
    padding: '20px 22px',
    boxSizing: 'border-box',
  };

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(59,130,246,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
            }}
          >
            <Server style={{ width: '18px', height: '18px', color: '#3b82f6' }} />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>Backend API Observability</h1>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Live health of each connected store&apos;s API — reachability, token validity, and latency for {projectId as string}
        </p>
      </div>

      {/* Inline error (shown when a refresh/probe fails but stale data is still on screen) */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            borderRadius: '8px',
            border: '1px solid rgba(244,63,94,0.2)',
            background: 'rgba(244,63,94,0.1)',
            padding: '12px 16px',
            color: '#fb7185',
            fontSize: '13px',
          }}
        >
          <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* Check selector — Store APIs vs Payment Gateways are separate checks. */}
      <div
        style={{
          display: 'inline-flex',
          gap: '4px',
          padding: '4px',
          borderRadius: '10px',
          border: '1px solid var(--border-card)',
          background: 'var(--bg-card)',
          width: 'fit-content',
          boxSizing: 'border-box',
        }}
      >
        {([
          { key: 'stores' as const, label: 'Store API Health', Icon: Server },
          { key: 'gateways' as const, label: 'Payment Gateways', Icon: CreditCard },
          { key: 'sms' as const, label: 'SMS Gateways', Icon: MessageSquare },
        ]).map((tab) => {
          const active = view === tab.key;
          const TabIcon = tab.Icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                color: active ? '#3b82f6' : 'var(--text-muted)',
                boxSizing: 'border-box',
              }}
            >
              <TabIcon style={{ width: '15px', height: '15px', flexShrink: 0 }} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {view === 'stores' && (
      <>
      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', overflow: 'visible' }}>
        {metricItems.map((item) => {
          const Icon = item.icon;
          const badge = statusBadge(item.status);
          return (
            <div
              key={item.label}
              style={{
                ...cardStyle,
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '130px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500 }}>
                  {item.label}
                </span>
                <Icon style={{ width: '16px', height: '16px', color: 'var(--text-muted)', flexShrink: 0 }} />
              </div>
              <div style={{ fontSize: '32px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1, padding: '6px 0' }}>
                {item.value}
                {item.unit && <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>{item.unit}</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    background: badge.background,
                    color: badge.color,
                  }}
                >
                  {item.status}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.context}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Latency trend + status codes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', alignItems: 'start' }}>
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', margin: 0 }}>
              Latency Distribution (ms)
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { label: 'P50', color: '#6366f1' },
                { label: 'P95', color: '#a855f7' },
                { label: 'P99', color: '#f43f5e' },
              ].map((item) => (
                <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minHeight: '240px', overflow: 'visible' }}>
            {latencyTrend.length === 0 ? (
              <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No probe data yet — run “Probe Now” to populate the trend.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={latencyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card)" vertical={false} />
                  <XAxis dataKey="timestamp" stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} width={52} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                  <Line type="monotone" dataKey="p50" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="p95" stroke="#a855f7" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="p99" stroke="#f43f5e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', margin: '0 0 16px' }}>
            Status Codes
          </p>
          {statusCodes.length === 0 ? (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No data
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                <div style={{ width: '140px', height: '140px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusCodes} innerRadius={45} outerRadius={65} dataKey="value" nameKey="name" paddingAngle={3}>
                        {statusCodes.map((entry) => (
                          <Cell key={entry.name} fill={STATUS_CODE_COLORS[entry.name] || '#94a3b8'} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
                {statusCodes.map((entry) => (
                  <span key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_CODE_COLORS[entry.name] || '#94a3b8', flexShrink: 0 }} />
                    {entry.name === 'err' ? 'no resp' : entry.name} · {entry.value}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Per-store health table — the core "which API is working / which isn't" */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <p style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', margin: '0 0 2px' }}>
              Store API Health
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Each connected store&apos;s API, probed with its stored token</p>
          </div>
          <button
            type="button"
            onClick={runProbeNow}
            disabled={refreshing}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-card)',
              background: 'transparent',
              fontSize: '13px',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: refreshing ? 'default' : 'pointer',
              opacity: refreshing ? 0.6 : 1,
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
          >
            <Zap style={{ width: '14px', height: '14px', flexShrink: 0 }} />
            {refreshing ? 'Probing…' : 'Probe Now'}
          </button>
        </div>

        {connectors.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No connected stores to monitor. Connect a store on the Integrations page.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 1fr 110px 90px 90px 90px 1fr',
                gap: '8px',
                paddingBottom: '10px',
                borderBottom: '1px solid var(--border-card)',
                marginBottom: '4px',
                minWidth: '760px',
              }}
            >
              {['Store', 'Status', 'HTTP', 'Latency', 'P95', 'Uptime', 'Last Check'].map((h) => (
                <span key={h} style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-label)', letterSpacing: '0.06em' }}>
                  {h}
                </span>
              ))}
            </div>

            {connectors.map((c, index) => {
              const meta = STATE_META[c.state] || STATE_META.unknown;
              const StateIcon = meta.Icon;
              return (
                <div
                  key={c.connectorInstanceId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.4fr 1fr 110px 90px 90px 90px 1fr',
                    gap: '8px',
                    padding: '12px 0',
                    alignItems: 'center',
                    borderBottom: index === connectors.length - 1 ? 'none' : '1px solid var(--border-card)',
                    minWidth: '760px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.label}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{PROVIDER_LABEL[c.provider] || c.provider}</span>
                  </div>

                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 500,
                      background: meta.bg,
                      color: meta.color,
                      width: 'fit-content',
                    }}
                  >
                    <StateIcon style={{ width: '13px', height: '13px', flexShrink: 0 }} />
                    {meta.label}
                  </span>

                  <span style={{ fontSize: '12px', fontFamily: 'monospace', color: c.statusCode && c.statusCode >= 200 && c.statusCode < 300 ? 'var(--text-primary)' : '#ef4444' }}>
                    {c.statusCode === 0 ? '—' : c.statusCode ?? '—'}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{c.latencyMs != null ? `${c.latencyMs}ms` : '—'}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{c.p95 != null && c.p95 > 0 ? `${c.p95}ms` : '—'}</span>
                  <span style={{ fontSize: '12px', color: c.uptime != null && c.uptime < 99 ? '#f59e0b' : 'var(--text-primary)' }}>
                    {c.uptime != null ? `${c.uptime}%` : '—'}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.lastError || ''}>
                    {relativeTime(c.lastCheckedAt)}
                    {c.lastError ? ` · ${c.lastError}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}

      {view === 'gateways' && (
        /* Payment gateway health + configuration — probes each configured gateway's
           API (Razorpay / Stripe / PayU) for live status and scheduled maintenance. */
        <PaymentGatewayPanel projectId={String(projectId)} />
      )}

      {view === 'sms' && (
        /* SMS gateway health — pure live probe of each provider's public status
           page (Twilio / GupShup / ClickSend / Infobip). No persistence. */
        <SmsGatewayPanel projectId={String(projectId)} />
      )}
    </div>
  );
}
