'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Activity,
  Server,
  Zap,
  ShieldAlert,
  BarChart3,
  Clock,
  Filter,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { PageRestricted } from '@/components/PageRestricted';
import { useConnectorFilter } from '@/hooks/useConnectorFilter';
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

function statusBadgeStyle(status: 'HEALTHY' | 'SUCCESS' | 'WARNING' | 'CRITICAL') {
  if (status === 'WARNING') {
    return { background: 'var(--warning-bg)', color: 'var(--warning-text)' };
  }
  if (status === 'CRITICAL') {
    return { background: 'var(--error-bg)', color: 'var(--error-text)' };
  }
  return { background: 'var(--success-bg)', color: 'var(--success-text)' };
}

const donutColors = ['#22c55e', '#818cf8', '#f59e0b', '#ef4444'];

export default function BackendObservabilityPage() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();
  const { connectorInstanceId } = useConnectorFilter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latencyTrend, setLatencyTrend] = useState<any[]>([]);
  const [statusCodes, setStatusCodes] = useState<any[]>([]);
  const [slowEndpoints, setSlowEndpoints] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;

    setLoading(true);
    setError(null);

    try {
      const permissions = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
      const nextAllowedPageKeys = Array.isArray(permissions?.allowedPageKeys) ? permissions.allowedPageKeys.map((value: any) => String(value)) : [];
      setAllowedPageKeys(nextAllowedPageKeys);

      if (!nextAllowedPageKeys.includes('observability/backend')) return;

      const [trendData, summaryData, slowData] = await Promise.all([
        apiFetch(`/api/v1/dashboard/performance/trends?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/performance/summary?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/performance/slowest-pages?siteId=${projectId}`),
      ]);

      setLatencyTrend(Array.isArray(trendData) ? trendData : []);
      setSummary(summaryData);
      setSlowEndpoints(Array.isArray(slowData) ? slowData : []);
      setStatusCodes([
        { name: '2xx', value: 98 },
        { name: '3xx', value: 1 },
        { name: '4xx', value: 0.5 },
        { name: '5xx', value: 0.5 },
      ]);
    } catch (err: any) {
      console.error('[BackendObs] Load failed', err);
      setError('Failed to synchronize backend telemetry. Please check integration health.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId, token, connectorInstanceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isPageRestricted = allowedPageKeys !== null && !allowedPageKeys.includes('observability/backend');

  if (isPageRestricted) {
    return <PageRestricted pageKey="observability/backend" />;
  }

  const chartData = latencyTrend.length > 0 ? latencyTrend : [];
  const topEndpoints = slowEndpoints.slice(0, 4);
  const slowEndpointRows = slowEndpoints.slice(0, 6);

  if (loading && !summary) {
    return (
      <div
        style={{
          ...pageStyle,
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
        }}
      >
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
            Analyzing Backend API Patterns...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          ...pageStyle,
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
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
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            Telemetry Desync
          </h2>
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
            Retry Sync
          </button>
        </div>
      </div>
    );
  }

  const metricItems = [
    {
      label: 'Total Requests',
      value: Number(summary?.totalRequests ?? summary?.requestsPerMinute ?? 0),
      unit: 'rpm',
      icon: Zap,
      contextLabel: 'Total Requests',
      status: 'HEALTHY' as const,
    },
    {
      label: 'Error Rate',
      value: Number(summary?.errorRate || 0),
      unit: '%',
      icon: ShieldAlert,
      contextLabel: 'Error Rate',
      status: Number(summary?.errorRate || 0) > 2 ? 'CRITICAL' as const : 'HEALTHY' as const,
    },
    {
      label: 'P95 Latency',
      value: Number(summary?.p95 || 0),
      unit: 'ms',
      icon: Clock,
      contextLabel: 'P95 Latency',
      status: Number(summary?.p95 || 0) > 2500 ? 'WARNING' as const : 'SUCCESS' as const,
    },
    {
      label: 'Uptime / Availability',
      value: Number(summary?.uptime || 0),
      unit: '%',
      icon: Activity,
      contextLabel: 'Availability',
      status: 'SUCCESS' as const,
    },
  ];

  const journeys = [
    { name: 'SEARCH', value: '85ms' },
    { name: 'PDP', value: '120ms' },
    { name: 'CART', value: '150ms' },
    { name: 'CHECKOUT', value: '450ms' },
    { name: 'ORDERS', value: '240ms' },
    { name: 'AUTH', value: '95ms' },
  ];

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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
            <h1 style={{ fontSize: '22px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
              Backend API Observability
            </h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            Deep diagnostics and performance trends for {projectId as string}
          </p>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
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
                cursor: 'pointer',
                boxSizing: 'border-box',
              }}
            >
              <Filter style={{ width: '14px', height: '14px', flexShrink: 0 }} />
              Filters
            </button>
            <button
              type="button"
              onClick={loadData}
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
                cursor: 'pointer',
                boxSizing: 'border-box',
              }}
            >
              <RefreshCw
                style={{
                  width: '14px',
                  height: '14px',
                  flexShrink: 0,
                  animation: loading ? 'spin 1s linear infinite' : 'none',
                }}
              />
              Refresh
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
            overflow: 'visible',
          }}
        >
          {metricItems.map((item) => {
            const Icon = item.icon;
            const badgeStyle = statusBadgeStyle(item.status);

            return (
              <div
                key={item.label}
                style={{
                  borderRadius: '12px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  padding: '20px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '130px',
                  overflow: 'visible',
                  boxSizing: 'border-box',
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
                  <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>{item.unit}</span>
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
                      background: badgeStyle.background,
                      color: badgeStyle.color,
                    }}
                  >
                    {item.status}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.contextLabel}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '16px', alignItems: 'start' }}>
          <div
            style={{
              borderRadius: '12px',
              border: '1px solid var(--border-card)',
              background: 'var(--bg-card)',
              padding: '22px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              boxSizing: 'border-box',
              overflow: 'visible',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', margin: 0 }}>
                  Request Throughput
                </p>
              </div>
            </div>

            <div
              style={{
                borderRadius: '10px',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-page)',
                padding: '16px',
                minHeight: '260px',
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)' }}>
                  Latency Distribution (ms)
                </span>
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
              <div style={{ flex: 1, minHeight: '200px', overflow: 'visible' }}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card)" vertical={false} />
                    <XAxis dataKey="timestamp" stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}ms`} width={48} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-card)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <Line type="monotone" dataKey="ttfb" stroke="#6366f1" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="pageLoadTime" stroke="#a855f7" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="lcp" stroke="#f43f5e" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div
              style={{
                borderRadius: '10px',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-page)',
                padding: '16px',
                minHeight: '180px',
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)' }}>
                  Throughput Profile
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Live request pattern</span>
              </div>
              <div style={{ flex: 1, minHeight: '120px', overflow: 'visible' }}>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card)" vertical={false} />
                    <XAxis dataKey="timestamp" stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} width={48} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-card)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <Line type="monotone" dataKey="fcp" stroke="#22c55e" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="pageLoadTime" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                borderRadius: '12px',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-card)',
                padding: '20px 22px',
                boxSizing: 'border-box',
              }}
            >
              <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', margin: '0 0 16px' }}>
                Status Codes
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                <div style={{ width: '140px', height: '140px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusCodes} innerRadius={45} outerRadius={65} dataKey="value" paddingAngle={3}>
                        {statusCodes.map((entry, index) => (
                          <Cell key={entry.name} fill={donutColors[index] || '#94a3b8'} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-card)',
                          borderRadius: '8px',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
                {['2xx', '3xx', '4xx', '5xx'].map((code, i) => (
                  <span key={code} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: donutColors[i], flexShrink: 0 }} />
                    {code}
                  </span>
                ))}
              </div>
            </div>

            <div
              style={{
                borderRadius: '12px',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-card)',
                padding: '20px 22px',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)' }}>
                  Top Endpoints
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Last 60 Mins</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {topEndpoints.map((item: any, index: number) => {
                  const width = `${Math.max(20, Math.min(100, Number(item.calls || 0) / Math.max(Number(topEndpoints[0]?.calls || 1), 1) * 100))}%`;
                  return (
                    <div key={`${item.route}-${index}`} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'monospace' }}>{item.route}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.p95}ms</span>
                      </div>
                      <div style={{ height: '8px', borderRadius: '999px', background: 'var(--bg-input)', overflow: 'hidden' }}>
                        <div style={{ width, height: '100%', borderRadius: '999px', background: '#3b82f6' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                borderRadius: '12px',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-card)',
                padding: '20px 22px',
                boxSizing: 'border-box',
              }}
            >
              <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', margin: '0 0 14px' }}>
                Top Slow Endpoints
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 60px', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-card)', marginBottom: '8px' }}>
                {['Method Route', 'P95', 'P99ERR', '% Calls'].map((header) => (
                  <span key={header} style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-label)', letterSpacing: '0.06em' }}>
                    {header}
                  </span>
                ))}
              </div>

              {slowEndpointRows.map((item: any, index: number) => (
                <div
                  key={`${item.route}-${index}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 70px 80px 60px',
                    gap: '8px',
                    padding: '10px 0',
                    borderBottom: index === slowEndpointRows.length - 1 ? 'none' : '1px solid var(--border-card)',
                  }}
                >
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {item.method ? `${item.method} ${item.route}` : item.route}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{item.p95}ms</span>
                  <span style={{ fontSize: '12px', color: Number(item.p99 || 0) > 1000 || Number(item.errorRate || 0) > 1 ? '#ef4444' : 'var(--text-primary)' }}>
                    {Number(item.p99 || 0) > 1000 || Number(item.errorRate || 0) > 1 ? 'high' : 'ok'}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {item.calls ? `${Math.round((Number(item.calls) / Math.max(Number(slowEndpointRows[0]?.calls || 1), 1)) * 100)}%` : '0%'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            borderRadius: '12px',
            border: '1px solid var(--border-card)',
            background: 'var(--bg-card)',
            padding: '22px 24px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(99,102,241,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
              }}
            >
              <BarChart3 style={{ width: '16px', height: '16px', color: '#6366f1' }} />
            </div>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', margin: '0 0 2px' }}>
                Journey Performance Rollup
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Aggregated health across commerce flows
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '16px' }}>
            {journeys.map((journey) => (
              <div key={journey.name} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)' }}>{journey.name}</span>
                </div>
                <span style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)' }}>{journey.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
