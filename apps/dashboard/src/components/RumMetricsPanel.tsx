'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Activity, Clock3, Gauge, RefreshCw, Timer, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConnectorFilter } from '../hooks/useConnectorFilter';

type MetricKey = 'lcp' | 'fid' | 'tbt' | 'cls' | 'ttfb';
type MetricStatus = 'good' | 'needs-improvement' | 'poor';

type MetricRow = {
  metricName?: MetricKey;
  value?: number;
  metricValue?: number;
  timestamp?: string | null;
  unit?: string;
  status?: MetricStatus;
};

const metricMeta: Record<MetricKey, { label: string; unit: string; icon: React.ComponentType<any>; thresholds: [number, number]; formatter: (value: number) => string }> = {
  lcp: { label: 'LCP', unit: 'ms', icon: Gauge, thresholds: [2500, 4000], formatter: (value) => `${Math.round(value)}` },
  fid: { label: 'FID', unit: 'ms', icon: Zap, thresholds: [200, 500], formatter: (value) => `${Math.round(value)}` },
  tbt: { label: 'TBT', unit: 'ms', icon: Zap, thresholds: [200, 600], formatter: (value) => `${Math.round(value)}` },
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

// Single source of truth for the metric card — reused by the site-wide section
// and the page-type breakdown so they are visually identical.
function VitalCard({
  metricKey,
  device,
  value,
  status,
  timestamp,
  loading,
}: {
  metricKey: MetricKey;
  device: string;
  value: number | null | undefined;
  status: MetricStatus;
  timestamp?: string | null;
  loading?: boolean;
}) {
  const meta = metricMeta[metricKey];
  const statusStyle = statusStyleMap[status];
  const Icon = meta.icon;
  const hasData = value !== null && value !== undefined && Number.isFinite(Number(value));

  return (
    <article style={{ borderRadius: '14px', border: '1px solid var(--border-card)', background: 'var(--bg-page)', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '160px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-label)', fontWeight: 700 }}>{meta.label}</p>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>PageSpeed Insights — {device}</p>
        </div>
        <Icon size={18} style={{ color: 'var(--text-label)' }} />
      </div>

      <div style={{ fontSize: '34px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
        {loading ? (
          <span style={{ display: 'inline-block', width: '80px', height: '28px', borderRadius: '6px', background: 'var(--border-card)', animation: 'pulse 1.2s ease-in-out infinite' }} />
        ) : (
          <>
            {hasData ? meta.formatter(Number(value)) : '—'}
            {meta.unit && hasData ? <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>{meta.unit}</span> : null}
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ padding: '4px 10px', borderRadius: '999px', background: statusStyle.background, color: statusStyle.color, border: `1px solid ${statusStyle.border}`, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
          {status.replace('-', ' ')}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {timestamp ? `Last fetched ${new Date(timestamp).toLocaleString()}` : 'Not fetched yet'}
        </span>
      </div>
    </article>
  );
}

// Circular 0–100 performance score badge (green ≥ 90, orange ≥ 50, red < 50).
function ScoreBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  const color = score >= 90 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const deg = Math.max(0, Math.min(100, score)) * 3.6;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ width: '64px', height: '64px', borderRadius: '999px', background: `conic-gradient(${color} ${deg}deg, var(--border-card) ${deg}deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '50px', height: '50px', borderRadius: '999px', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '18px', fontWeight: 700, color }}>{Math.round(score)}</span>
        </div>
      </div>
      <div>
        <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 700 }}>Performance</p>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Lighthouse score</p>
      </div>
    </div>
  );
}

type PageMetric = { value: number; unit: string; status: MetricStatus; timestamp?: string | null } | null;
type PageResult = {
  pageType: string;
  url: string | null;
  available: boolean;
  reason?: string;
  note?: string;
  measuredAgainstHomepage?: boolean;
  score: number | null;
  scoreStatus: MetricStatus | null;
  metrics: { lcp: PageMetric; tbt: PageMetric; cls: PageMetric; ttfb: PageMetric };
  timestamp: string | null;
};
type PageType = 'homepage' | 'pdp' | 'plp' | 'checkout';
type PagesResponse = Record<PageType, PageResult>;

const PAGE_TABS: Array<{ key: PageType; label: string }> = [
  { key: 'homepage', label: 'Homepage' },
  { key: 'pdp', label: 'PDP' },
  { key: 'plp', label: 'PLP' },
  { key: 'checkout', label: 'Checkout' },
];
const PAGE_VITALS: MetricKey[] = ['lcp', 'tbt', 'cls', 'ttfb'];

export default function RumMetricsPanel() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { apiFetch, token, user } = useAuth();
  const { connectorInstanceId, connectorSelectionTick } = useConnectorFilter();
  const tenantId = user?.tenantId;

  const [refreshing, setRefreshing] = useState(false);
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [error, setError] = useState<string | null>(null);

  // Page-type breakdown state (cached client-side per strategy). This is also the
  // single source of truth for the site-wide "Core Web Vitals" panel above, which
  // reads its numbers from the `homepage` entry — so the two panels can never show
  // conflicting values for the same page.
  const [pageData, setPageData] = useState<Record<'mobile' | 'desktop', PagesResponse | null>>({ mobile: null, desktop: null });
  const [activePage, setActivePage] = useState<PageType>('homepage');
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);

  const fetchPages = useCallback(async (strategy: 'mobile' | 'desktop', force = false) => {
    if (!token || !projectId || !tenantId) return;
    setPagesLoading(true);
    setPagesError(null);
    try {
      const response = await apiFetch(`/api/v1/tenants/${tenantId}/projects/${projectId}/pagespeed/pages`, {
        params: { strategy, ...(force ? { refresh: 'true' } : {}) },
        // Exceed the server's worst-case PageSpeed time (mobile = 2 retries × 120s).
        // If the client times out first, apiFetch serves STALE cached data, which is
        // exactly the "refresh shows old numbers" symptom we are fixing.
        timeout: 250000,
      });
      const payload = response?.data ? response.data : response;
      setPageData((prev) => ({ ...prev, [strategy]: payload || null }));
    } catch (err) {
      console.error('[RumMetricsPanel] fetchPages failed', err);
      setPagesError(err instanceof Error ? err.message : 'Failed to load page-type metrics');
    } finally {
      setPagesLoading(false);
    }
  }, [apiFetch, projectId, tenantId, token]);

  // Reset all cached state when the active connector changes.
  useEffect(() => {
    if (!token || !projectId) return;
    setError(null);
    setPageData({ mobile: null, desktop: null });
  }, [connectorSelectionTick, projectId, token]);

  // Lazily load the page-type breakdown for the currently-selected device.
  useEffect(() => {
    if (!token || !projectId || !tenantId) return;
    if (pageData[device] == null && !pagesLoading) {
      void fetchPages(device, false);
    }
  }, [device, pageData, pagesLoading, fetchPages, token, projectId, tenantId]);

  const handleRefresh = useCallback(async () => {
    if (!token || !projectId || !tenantId) return;

    setRefreshing(true);
    setError(null);

    // Kick off the site-wide sync in the BACKGROUND. It only feeds alerts/RUM and
    // can take 30-120s; it must never block or fail the visible refresh below.
    // (Previously it was awaited first, so a slow/failed sync left the panel showing
    // stale numbers — the "refresh does nothing" symptom.)
    apiFetch(`/api/v1/tenants/${tenantId}/projects/${projectId}/pagespeed/sync`, {
      method: 'POST',
      body: connectorInstanceId ? JSON.stringify({ connectorInstanceId }) : undefined,
      timeout: 120000,
    }).catch((err) => console.warn('[RumMetricsPanel] background sync failed', err));

    try {
      // Force a FRESH PageSpeed run (refresh=true bypasses the server cache). This is
      // the single measurement that drives BOTH the Core Web Vitals panel and the
      // page-type breakdown, so the displayed numbers always reflect this new run.
      setPageData((prev) => ({ ...prev, [device]: null }));
      await fetchPages(device, true);
    } catch (err) {
      console.error('[RumMetricsPanel] refresh failed', err);
      setError(err instanceof Error ? err.message : 'PageSpeed calculation failed. API may be rate-limited. Try again in a moment.');
    } finally {
      setRefreshing(false);
    }
  }, [apiFetch, connectorInstanceId, device, fetchPages, projectId, tenantId, token]);

  const pages = pageData[device];
  const activeResult: PageResult | null = pages ? pages[activePage] : null;
  const pagesLoadingActive = pagesLoading && !pages;

  // The site-wide "Core Web Vitals" panel and the page-type "Homepage" tab both
  // describe the same homepage URL. Drive them from a SINGLE measurement so they
  // can never contradict each other (previously they ran two independent PageSpeed
  // scans at different moments and showed different LCP/TBT for the same page).
  const homepageResult: PageResult | null = pages ? pages.homepage : null;
  const vitalsLoading = pagesLoading && !pages;
  const vitalsNoData = !pagesLoading && !homepageResult;
  // PageSpeed reports TBT (lab), not FID, for the mobile/desktop Lighthouse run.
  const SITE_VITALS: MetricKey[] = ['lcp', 'tbt', 'cls', 'ttfb'];

  return (
    <>
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

        {vitalsLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '14px' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '999px', border: '2px solid var(--border-card)', borderTopColor: 'var(--text-primary)', animation: 'spin 0.8s linear infinite' }} />
            Loading PageSpeed data...
          </div>
        ) : vitalsNoData ? (
          <div style={{ borderRadius: '12px', border: '1px dashed var(--border-card)', padding: '20px', color: 'var(--text-muted)', fontSize: '14px' }}>
            No metrics yet — click <strong>Refresh</strong> to compute PageSpeed metrics from your store (first run may take 15–30 seconds).
          </div>
        ) : null}

        {error ? (
          <div style={{ borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)', padding: '14px 16px', color: 'var(--error-text)', fontSize: '14px' }}>{error}</div>
        ) : null}

        {homepageResult && homepageResult.available ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
            {SITE_VITALS.map((metricName) => {
              const m = homepageResult.metrics[metricName as 'lcp' | 'tbt' | 'cls' | 'ttfb'];
              const value = m?.value;
              const status = (m?.status as MetricStatus) || getMetricStatus(metricName, Number(value || 0));
              return (
                <VitalCard
                  key={metricName}
                  metricKey={metricName}
                  device={device}
                  value={value}
                  status={status}
                  timestamp={m?.timestamp ?? homepageResult.timestamp}
                />
              );
            })}
          </div>
        ) : homepageResult && !homepageResult.available ? (
          <div style={{ borderRadius: '12px', border: '1px dashed var(--border-card)', padding: '20px', color: 'var(--text-muted)', fontSize: '14px' }}>
            {homepageResult.reason || 'Unavailable – PageSpeed could not analyze your storefront.'}
          </div>
        ) : null}
      </section>

      {/* ── Page-Type Performance Breakdown ─────────────────────────────────── */}
      {/* <section style={{ borderRadius: '16px', border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-label)', fontWeight: 700 }}>PageSpeed Metrics</p>
            <h2 style={{ margin: '6px 0 0', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Page-Type Performance Breakdown</h2>
          </div>
          <ScoreBadge score={activeResult?.available ? activeResult.score : null} />
        </div>

       
        <div style={{ display: 'inline-flex', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-input)', alignSelf: 'flex-start' }}>
          {PAGE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActivePage(tab.key)}
              style={{ padding: '8px 16px', background: activePage === tab.key ? 'var(--bg-input)' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: activePage === tab.key ? 700 : 500, color: 'var(--text-primary)' }}
            >
              {tab.label}
            </button>
          ))}
        </div>

       
        {activeResult?.url ? (
          <a href={activeResult.url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--text-muted)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={activeResult.url}>
            Testing: {activeResult.url}
          </a>
        ) : null}

        {pagesError ? (
          <div style={{ borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)', padding: '14px 16px', color: 'var(--error-text)', fontSize: '14px' }}>{pagesError}</div>
        ) : null}

        {pagesLoadingActive ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
            {PAGE_VITALS.map((metricName) => (
              <VitalCard key={metricName} metricKey={metricName} device={device} value={undefined} status="good" loading />
            ))}
          </div>
        ) : activeResult && !activeResult.available ? (
          <div style={{ borderRadius: '12px', border: '1px dashed var(--border-card)', padding: '24px', color: 'var(--text-muted)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            {activeResult.reason || 'Unavailable – PageSpeed could not analyze this page.'}
          </div>
        ) : activeResult ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
              {PAGE_VITALS.map((metricName) => {
                const m = activeResult.metrics[metricName as 'lcp' | 'tbt' | 'cls' | 'ttfb'];
                const value = m?.value;
                const status = (m?.status as MetricStatus) || getMetricStatus(metricName, Number(value || 0));
                return (
                  <VitalCard
                    key={metricName}
                    metricKey={metricName}
                    device={device}
                    value={value}
                    status={status}
                    timestamp={m?.timestamp ?? activeResult.timestamp}
                  />
                );
              })}
            </div>
            {activePage !== 'homepage' && activeResult.measuredAgainstHomepage ? (
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                Measured against store homepage — no dedicated {activePage.toUpperCase()} URL is configured yet.
              </p>
            ) : null}
          </>
        ) : (
          <div style={{ borderRadius: '12px', border: '1px dashed var(--border-card)', padding: '20px', color: 'var(--text-muted)', fontSize: '14px' }}>
            No page-type metrics yet — click <strong>Refresh</strong> to analyze your storefront's key pages.
          </div>
        )}
      </section> */}
    </>
  );
}