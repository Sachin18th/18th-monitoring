'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Clock3, Gauge, RefreshCw, Timer, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type MetricKey = 'lcp' | 'fid' | 'cls' | 'ttfb';
type MetricStatus = 'good' | 'needs-improvement' | 'poor';

type MetricRow = {
  metricName: MetricKey;
  value?: number;
  metricValue?: number;
  timestamp?: string | null;
  unit?: string;
  status?: 'good' | 'needs-improvement' | 'poor';
};

const metricMeta: Record<MetricKey, { label: string; unit: string; icon: React.ComponentType<any>; thresholds: [number, number]; formatter: (value: number) => string }> = {
  lcp: { label: 'LCP', unit: 'ms', icon: Gauge, thresholds: [2500, 4000], formatter: (value) => `${Math.round(value)}` },
  fid: { label: 'FID', unit: 'ms', icon: Zap, thresholds: [200, 500], formatter: (value) => `${Math.round(value)}` },
  cls: { label: 'CLS', unit: '', icon: Timer, thresholds: [0.1, 0.25], formatter: (value) => value.toFixed(2) },
  ttfb: { label: 'TTFB', unit: 'ms', icon: Clock3, thresholds: [800, 1800], formatter: (value) => `${Math.round(value)}` },
};

const statusStyleMap: Record<MetricStatus, { background: string; color: string; border: string }> = {
  good: { background: 'var(--success-bg)', color: 'var(--success-text)', border: 'rgba(34,197,94,0.2)' },
  'needs-improvement': { background: 'var(--warning-bg)', color: 'var(--warning-text)', border: 'rgba(245,158,11,0.2)' },
  poor: { background: 'var(--error-bg)', color: 'var(--error-text)', border: 'rgba(239,68,68,0.2)' },
};

const getMetricStatus = (metricName: MetricKey, value: number): MetricStatus => {
  const [goodThreshold, warningThreshold] = metricMeta[metricName].thresholds;
  if (value <= goodThreshold) return 'good';
  if (value <= warningThreshold) return 'needs-improvement';
  return 'poor';
};

export default function RumMetricsPanel() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { apiFetch, token, user } = useAuth();
  const tenantId = user?.tenantId;
  const autoSyncAttempted = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<Record<string, Record<MetricKey, MetricRow>> | null>(null);
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [error, setError] = useState<string | null>(null);

  const metricsByKey = useMemo(() => {
    if (!metrics) return {} as Record<MetricKey, MetricRow>;
    return (metrics[device] || {}) as Record<MetricKey, MetricRow>;
  }, [metrics, device]);

  const loadMetrics = useCallback(async () => {
    if (!token || !projectId || !tenantId) return;

    console.log('[RumMetricsPanel] loadMetrics:start', { tenantId, projectId });
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetch(`/api/v1/tenants/${tenantId}/projects/${projectId}/pagespeed/latest`);
      // Response expected: { mobile: { lcp: {value,unit,status}, ... }, desktop: { ... } }
      console.log('[RumMetricsPanel] loadMetrics:response', { tenantId, projectId, response });
      const payload = response?.data ? response.data : response;
      setMetrics(payload || null);
    } catch (err) {
      console.error('[RumMetricsPanel] load failed', err);
        setMetrics(null);
      setError(err instanceof Error ? err.message : 'No cached metrics yet — click Refresh to compute');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId, tenantId, token]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const handleRefresh = useCallback(async () => {
    if (!token || !projectId || !tenantId) return;

    console.log('[RumMetricsPanel] handleRefresh:start', { tenantId, projectId });
    setRefreshing(true);
    setError(null);
    try {
      const syncResponse = await apiFetch(`/api/v1/tenants/${tenantId}/projects/${projectId}/pagespeed/sync`, {
        method: 'POST',
        timeout: 70000,
      });
      console.log('[RumMetricsPanel] handleRefresh:sync-response', {
        tenantId,
        projectId,
        syncResponse,
      });
      await loadMetrics();
    } catch (err) {
      console.error('[RumMetricsPanel] refresh failed', err);
      setMetrics(null);
      setError(err instanceof Error ? err.message : 'PageSpeed calculation failed. API may be rate-limited. Try again in a moment.');
    } finally {
      setRefreshing(false);
    }
  }, [apiFetch, loadMetrics, projectId, tenantId, token]);

  // REMOVED auto-sync on mount to prevent hitting PageSpeed API quota.
  // The data is now cached in DB; user must manually click Refresh to trigger sync.
  // This prevents 429 (quota exceeded) errors from repeated auto-refreshes.

  const noData = !loading && !metrics;

  return (
    <section style={{ borderRadius: '16px', border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-label)', fontWeight: 700 }}>PageSpeed Metrics</p>
          <h2 style={{ margin: '6px 0 0', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Core Web Vitals from the storefront</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-input)' }}>
            <button type="button" onClick={() => setDevice('mobile')} style={{ padding: '8px 12px', background: device === 'mobile' ? 'var(--bg-input)' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: device === 'mobile' ? 700 : 500 }}>Mobile</button>
            <button type="button" onClick={() => setDevice('desktop')} style={{ padding: '8px 12px', background: device === 'desktop' ? 'var(--bg-input)' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: device === 'desktop' ? 700 : 500 }}>Desktop</button>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '999px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
          >
            <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '14px' }}>
          <div style={{ width: '18px', height: '18px', borderRadius: '999px', border: '2px solid var(--border-card)', borderTopColor: 'var(--text-primary)', animation: 'spin 0.8s linear infinite' }} />
          Loading PageSpeed data...
        </div>
      ) : noData ? (
        <div style={{ borderRadius: '12px', border: '1px dashed var(--border-card)', padding: '20px', color: 'var(--text-muted)', fontSize: '14px' }}>
          No cached metrics yet — click <strong>Refresh</strong> to compute PageSpeed metrics from your store (first run may take 15–30 seconds).
        </div>
      ) : null}

      {error ? (
        <div style={{ borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)', padding: '14px 16px', color: 'var(--error-text)', fontSize: '14px' }}>{error}</div>
      ) : null}

      {!loading && metrics ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
          {(['lcp', 'fid', 'cls', 'ttfb'] as MetricKey[]).map((metricName) => {
            const meta = metricMeta[metricName];
            const row = metricsByKey[metricName];
            const value = row?.value ?? row?.metricValue ?? 0;
            const status = (row?.status as MetricStatus) || getMetricStatus(metricName, Number(value || 0));
            const statusStyle = statusStyleMap[status];
            const Icon = meta.icon;

            return (
              <article key={metricName} style={{ borderRadius: '14px', border: '1px solid var(--border-card)', background: 'var(--bg-page)', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '160px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-label)', fontWeight: 700 }}>{meta.label}</p>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>PageSpeed Insights — {device}</p>
                  </div>
                  <Icon size={18} style={{ color: 'var(--text-label)' }} />
                </div>

                <div style={{ fontSize: '34px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
                  {row ? meta.formatter(Number(value)) : '—'}
                  {meta.unit ? <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>{meta.unit}</span> : null}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ padding: '4px 10px', borderRadius: '999px', background: statusStyle.background, color: statusStyle.color, border: `1px solid ${statusStyle.border}`, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                    {status.replace('-', ' ')}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {row?.timestamp ? `Last fetched ${new Date(row.timestamp).toLocaleString()}` : 'Not fetched yet'}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
