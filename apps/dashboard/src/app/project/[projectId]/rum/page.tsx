// apps/dashboard/src/app/project/[projectId]/rum/page.tsx


'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { EventStream } from '@/components/rum/EventStream';
import { DeviceDistribution } from '@/components/rum/DeviceDistribution';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Globe, Users, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

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

const metricGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: '24px',
  marginBottom: '24px',
  width: '100%',
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

const chartSectionGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 320px',
  gap: '24px',
  marginBottom: '24px',
  overflow: 'visible',
};

const sectionCardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  overflow: 'visible',
};

const bottomSectionGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '24px',
  overflow: 'visible',
};

const errorBannerStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  borderRadius: '8px',
  border: '1px solid rgba(244,63,94,0.2)',
  background: 'rgba(244,63,94,0.1)',
  padding: '12px 16px',
  color: '#fb7185',
  overflow: 'visible',
};

type RoutePerformanceRow = {
  key: string;
  url: string;
  avgLoadTime: number;
  status: 'healthy' | 'warning' | 'critical';
};

type PagespeedMetricKey = 'lcp' | 'fid' | 'cls' | 'ttfb';
type DeviceType = 'mobile' | 'desktop';
type MetricStatus = 'good' | 'needs-improvement' | 'poor';

type PagespeedMetricEntry = {
  value?: number;
  unit?: string;
  status?: MetricStatus;
  timestamp?: string | null;
};

type PagespeedLatestPayload = Partial<Record<DeviceType, Partial<Record<PagespeedMetricKey, PagespeedMetricEntry>>>>;

const getRouteStatus = (avgLoadTime: number, status?: string): RoutePerformanceRow['status'] => {
  const normalized = status?.toLowerCase();
  if (normalized === 'healthy' || normalized === 'warning' || normalized === 'critical') {
    return normalized;
  }

  if (avgLoadTime > 4000) return 'critical';
  if (avgLoadTime > 3000) return 'warning';
  return 'healthy';
};

const normalizeRoutePerformanceRows = (rows: any[]): RoutePerformanceRow[] => {
  return rows.map((row, index) => {
    const url = String(row?.url || row?.route || row?.page || row?.path || row?.dimension || '/unknown').trim() || '/unknown';
    const rawLoadTime = Number(row?.avgLoadTime ?? row?.loadTime ?? row?.pageLoadTime ?? row?.p95 ?? 0);
    const avgLoadTime = Number.isFinite(rawLoadTime) ? rawLoadTime : 0;

    return {
      key: `${url}-${index}`,
      url,
      avgLoadTime,
      status: getRouteStatus(avgLoadTime, row?.status),
    };
  });
};

export default function RumDashboardPage() {
  const { projectId } = useParams();
  const { apiFetch, token, user } = useAuth();
  const tenantId = user?.tenantId;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceType>('mobile');
  const [refreshing, setRefreshing] = useState(false);

  const [pagespeedMetrics, setPagespeedMetrics] = useState<PagespeedLatestPayload | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [loadTimeTrend, setLoadTimeTrend] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [topPages, setTopPages] = useState<RoutePerformanceRow[]>([]);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [perfSummary, deviceData, trendData, userAnalytics, slowestPages] = await Promise.all([
        apiFetch(`/api/v1/dashboard/performance/summary?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/performance/device?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/performance/trends?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/customers/analytics?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/performance/slowest-pages?siteId=${projectId}`)
      ]);

      console.log('[RUM] Performance summary response', { projectId, perfSummary });

      if (tenantId) {
        try {
          const latest = await apiFetch(`/api/v1/tenants/${tenantId}/projects/${projectId}/pagespeed/latest`);
          const payload = latest?.data ? latest.data : latest;
          setPagespeedMetrics(payload || null);
        } catch (psErr) {
          console.warn('[RUM] Failed to load latest PageSpeed metrics', psErr);
          setPagespeedMetrics(null);
        }
      }

      setDevices(Array.isArray(deviceData) ? deviceData : []);
      setLoadTimeTrend(Array.isArray(trendData) ? trendData : []);
      setAnalytics(userAnalytics);
      setTopPages(Array.isArray(slowestPages) ? normalizeRoutePerformanceRows(slowestPages) : []);
      setEvents([]); // Real events stream would go here
      
    } catch (err: any) {
      console.error('[RUM] Load failed', err);
      setError('Failed to synchronize frontend telemetry. Please check integration health.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId, tenantId, token]);

  const webVitals = useMemo(() => {
    const byDevice = (pagespeedMetrics?.[device] || {}) as Partial<Record<PagespeedMetricKey, PagespeedMetricEntry>>;
    const row = (key: PagespeedMetricKey) => byDevice[key] || {};

    return [
      {
        name: 'LCP',
        value: row('lcp').value,
        unit: row('lcp').unit || 'ms',
        status: row('lcp').status,
        timestamp: row('lcp').timestamp,
        description: `Largest Contentful Paint (${device}).`,
      },
      {
        name: 'FID',
        value: row('fid').value,
        unit: row('fid').unit || 'ms',
        status: row('fid').status,
        timestamp: row('fid').timestamp,
        description: `First Input Delay (${device}).`,
      },
      {
        name: 'CLS',
        value: row('cls').value,
        unit: '',
        status: row('cls').status,
        timestamp: row('cls').timestamp,
        description: `Cumulative Layout Shift (${device}).`,
      },
      {
        name: 'TTFB',
        value: row('ttfb').value,
        unit: row('ttfb').unit || 'ms',
        status: row('ttfb').status,
        timestamp: row('ttfb').timestamp,
        description: `Time to First Byte (${device}).`,
      },
    ];
  }, [device, pagespeedMetrics]);

  const handleRefresh = useCallback(async () => {
    if (!token || !projectId || !tenantId) return;

    setRefreshing(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/tenants/${tenantId}/projects/${projectId}/pagespeed/sync`, {
        method: 'POST',
        timeout: 70000,
      });
      // After sync completes (may take 15-30s), reload dashboard data
      await loadData();
    } catch (err: any) {
      console.error('[RUM] pagespeed sync failed', err);
      setError('PageSpeed calculation failed. API may be rate-limited. Try again in a moment.');
    } finally {
      setRefreshing(false);
    }
  }, [apiFetch, loadData, projectId, tenantId, token]);

  useEffect(() => {
    loadData();
    // REMOVED: No auto-refresh every 30s to avoid PageSpeed API quota exhaustion (429 errors).
    // Users must manually click Refresh to sync new PageSpeed metrics.
  }, [loadData]);

  if (loading && !analytics) {
    return (
      <div style={{ ...pageStyle, ...sectionSpacingStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '999px', border: '4px solid #1e293b', borderTopColor: '#6366f1', marginBottom: '16px' }} />
          <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Synchronizing Frontend Telemetry...</span>
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
            <Globe style={{ width: '20px', height: '20px', color: '#818cf8', flexShrink: 0 }} />
            Frontend Observability (RUM)
          </h1>
          <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
            Real-time user experience monitoring for {projectId as string}
          </p>
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={actionButtonStyle}>
            <Users style={{ width: '16px', height: '16px', color: '#818cf8', flexShrink: 0 }} />
            <span>{analytics?.activeUsers || 0} Active Sessions</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-input)' }}>
              <button type="button" onClick={() => setDevice('mobile')} style={{ padding: '8px 12px', background: device === 'mobile' ? 'var(--bg-input)' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: device === 'mobile' ? 700 : 500 }}>Mobile</button>
              <button type="button" onClick={() => setDevice('desktop')} style={{ padding: '8px 12px', background: device === 'desktop' ? 'var(--bg-input)' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: device === 'desktop' ? 700 : 500 }}>Desktop</button>
            </div>
            <button
              onClick={handleRefresh}
              style={actionButtonStyle}
            >
              <RefreshCw style={{ width: '16px', height: '16px', flexShrink: 0 }} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={errorBannerStyle}>
          <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '12px' }}>
            <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            <span style={{ fontSize: '14px', textAlign: 'center', overflowWrap: 'anywhere' }}>{error}</span>
          </div>
          <button onClick={loadData} style={{ marginLeft: '8px', flexShrink: 0, fontSize: '14px', fontWeight: 500, textDecoration: 'underline', color: '#fb7185', cursor: 'pointer', background: 'transparent', border: 'none' }}>Retry</button>
        </div>
      )}

      {/* Core Web Vitals Grid */}
      <div style={metricGridStyle}>
        {webVitals.map((vital) => {
          const status = (vital.status || 'poor') as MetricStatus;
          const badgeBg = status === 'good' ? 'var(--success-bg)' : status === 'needs-improvement' ? 'var(--warning-bg)' : 'var(--error-bg)';
          const badgeColor = status === 'good' ? 'var(--success-text)' : status === 'needs-improvement' ? 'var(--warning-text)' : 'var(--error-text)';
          const hasValue = typeof vital.value === 'number' && Number.isFinite(vital.value);
          const displayValue = loading ? 'Loading...' : hasValue ? (vital.name === 'CLS' ? Number(vital.value).toFixed(2) : Math.round(Number(vital.value))) : '—';
          const statusLabel = status === 'needs-improvement' ? 'NEEDS IMPROVEMENT' : status.toUpperCase();
          return (
            <div key={vital.name} style={metricCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {vital.name}
                </span>
                <Globe style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
              </div>

              <div style={{ fontSize: '38px', fontWeight: 500, color: loading ? 'var(--text-muted)' : 'var(--text-primary)', lineHeight: 1, padding: '8px 0' }}>
                {displayValue}
                {vital.unit && !loading && hasValue ? <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>{vital.unit}</span> : null}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', gap: '8px', minWidth: 0 }}>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    background: loading ? 'var(--warning-bg)' : badgeBg,
                    color: loading ? 'var(--warning-text)' : badgeColor,
                  }}
                >
                  {loading ? 'CALCULATING' : hasValue ? statusLabel : 'NO DATA'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-label)', marginLeft: '8px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {loading
                    ? `Computing ${device} PageSpeed metrics from your store (may take 15-30s)...`
                    : hasValue
                      ? vital.description
                      : `No ${device} metric cached yet. Click Refresh to compute.`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={chartSectionGridStyle}>
        {/* Performance Trend */}
        <div style={sectionCardStyle}>
          <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500, marginBottom: '16px' }}>
            AVERAGE PAGE LOAD TIME (MS)
          </p>
          <div style={{ width: '100%', height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={loadTimeTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="timestamp" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '8px' }}
                  itemStyle={{ color: '#818cf8' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="pageLoadTime" 
                  stroke="#6366f1" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: 'var(--bg-card)' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Device Split */}
        <div style={sectionCardStyle}>
          <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500, marginBottom: '16px' }}>
            DEVICE DISTRIBUTION
          </p>
          <DeviceDistribution data={devices} title="Device Distribution" />
        </div>
      </div>

      <div style={bottomSectionGridStyle}>
        {/* Event Stream */}
        <div style={{ ...sectionCardStyle, minHeight: '400px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500 }}>
              REAL-TIME EVENT STREAM
            </p>
            <span style={{ fontSize: '10px', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em' }}>LIVE</span>
          </div>
          <EventStream events={events} />
        </div>

        {/* Route Performance */}
        <div style={{ ...sectionCardStyle, minHeight: '400px' }}>
          <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500, marginBottom: '16px' }}>
            ROUTE PERFORMANCE
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px', gap: '16px', padding: '8px 0', borderBottom: '1px solid var(--border-card)', marginBottom: '8px' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)' }}>PATH</span>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', textAlign: 'right' }}>AVG LOAD</span>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', textAlign: 'right' }}>STATUS</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {topPages.map((row) => {
              const normalized = String(row.status || '').toLowerCase();
              const badgeBg = normalized === 'healthy' ? 'var(--success-bg)' : normalized === 'warning' ? 'var(--warning-bg)' : 'var(--error-bg)';
              const badgeColor = normalized === 'healthy' ? 'var(--success-text)' : normalized === 'warning' ? 'var(--warning-text)' : 'var(--error-text)';
              return (
                <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--border-card)', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.url}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' }}>{row.avgLoadTime}ms</span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', background: badgeBg, color: badgeColor, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {row.status}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
