'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Clock3, Gauge, RefreshCw, Timer, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConnectorFilter } from '../hooks/useConnectorFilter';

type MetricKey = 'lcp' | 'fid' | 'tbt' | 'cls' | 'ttfb';
type MetricStatus = 'good' | 'needs-improvement' | 'poor';

const metricMeta: Record<MetricKey, { label: string; unit: string; icon: React.ComponentType<any>; thresholds: [number, number]; formatter: (value: number) => string }> = {
  // LCP is stored in ms (thresholds stay in ms for status), but displayed in seconds.
  lcp: { label: 'LCP', unit: 's', icon: Gauge, thresholds: [2500, 4000], formatter: (value) => (value / 1000).toFixed(2) },
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
        {/* No measurement → neutral "No data" chip instead of a misleading green "GOOD". */}
        {hasData ? (
          <span style={{ padding: '4px 10px', borderRadius: '999px', background: statusStyle.background, color: statusStyle.color, border: `1px solid ${statusStyle.border}`, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            {status.replace('-', ' ')}
          </span>
        ) : (
          <span style={{ padding: '4px 10px', borderRadius: '999px', background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-input)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            No data
          </span>
        )}
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {timestamp ? `Last fetched ${new Date(timestamp).toLocaleString()}` : 'Not fetched yet'}
        </span>
      </div>
    </article>
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
  measurementError?: string;
  score: number | null;
  scoreStatus: MetricStatus | null;
  metrics: { lcp: PageMetric; tbt: PageMetric; cls: PageMetric; ttfb: PageMetric };
  timestamp: string | null;
};
type PageType = 'homepage' | 'pdp' | 'plp' | 'checkout';
type PagesResponse = Record<PageType, PageResult>;

// Stacked sections, in display order: Homepage → PLP → PDP → Checkout.
const PAGE_SECTIONS: Array<{ key: PageType; label: string }> = [
  { key: 'homepage', label: 'Homepage' },
  // PLP/PDP/Checkout PageSpeed calculation disabled — only the homepage is measured for now.
  // { key: 'plp', label: 'PLP — Category Page' },
  // { key: 'pdp', label: 'PDP — Product Page' },
  // { key: 'checkout', label: 'Checkout' },
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
  // Error text is captured but intentionally not rendered (PageSpeed errors are hidden in the UI).
  const [, setError] = useState<string | null>(null);

  // Page-type breakdown state (cached client-side per strategy). This is also the
  // single source of truth for the site-wide "Core Web Vitals" panel above, which
  // reads its numbers from the `homepage` entry — so the two panels can never show
  // conflicting values for the same page.
  const [pageData, setPageData] = useState<Record<'mobile' | 'desktop', PagesResponse | null>>({ mobile: null, desktop: null });
  const [pagesLoading, setPagesLoading] = useState(false);
  const [, setPagesError] = useState<string | null>(null);

  const fetchPages = useCallback(async (strategy: 'mobile' | 'desktop', force = false) => {
    if (!token || !projectId || !tenantId) return;
    setPagesLoading(true);
    setPagesError(null);

    // A 5xx here is almost always a transient upstream blip — the API proxy can't
    // reach the backend for a moment (e.g. the API is restarting/redeploying), NOT a
    // real PageSpeed failure. Retry once after a short delay before surfacing an error
    // so a brief restart doesn't flash a scary red banner on the panel.
    const isTransient = (err: any) => {
      const status = err?.status;
      return !status || status >= 500;
    };

    let lastErr: any = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
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
        setPagesLoading(false);
        return;
      } catch (err) {
        lastErr = err;
        if (attempt === 0 && isTransient(err)) {
          console.warn('[RumMetricsPanel] fetchPages transient failure — retrying once', err);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
        break;
      }
    }

    console.error('[RumMetricsPanel] fetchPages failed', lastErr);
    setPagesError(lastErr instanceof Error ? lastErr.message : 'Failed to load page-type metrics');
    setPagesLoading(false);
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

  // NOTE: a live PageSpeed run is triggered ONLY by the Refresh button (handleRefresh
  // below). We deliberately do NOT auto-measure on mount — the lazy load above is
  // read-only and just displays the last stored measurement (or a "not measured yet"
  // state until the user clicks Refresh).

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
  // One unified loading state for the whole stack — never 4 independent spinners.
  const isLoading = !pages && (pagesLoading || refreshing);

  // Optional status badge for a section header.
  const sectionBadge = (result: PageResult | null): { tone: 'muted' | 'warning'; text: string } | null => {
    if (!result) return null;
    if (result.measuredAgainstHomepage) {
      return { tone: 'muted', text: 'Proxied from homepage — no dedicated URL discovered' };
    }
    if (result.measurementError === 'discovered_url_unreachable') {
      return { tone: 'warning', text: 'Discovered URL unreachable — check URL suffix config' };
    }
    return null;
  };

  const renderSection = ({ key, label }: { key: PageType; label: string }) => {
    const result = pages ? pages[key] : null;
    const badge = sectionBadge(result);
    const available = Boolean(result && result.available);

    return (
      <section key={key} style={{ borderRadius: '16px', border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</h3>
            {result?.url ? (
              <a href={result.url} target="_blank" rel="noreferrer" title={result.url} style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '460px' }}>
                {result.url}
              </a>
            ) : null}
          </div>
          {badge ? (
            <span style={{
              padding: '5px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, lineHeight: 1.4,
              background: badge.tone === 'warning' ? 'var(--warning-bg)' : 'var(--bg-input)',
              color: badge.tone === 'warning' ? 'var(--warning-text)' : 'var(--text-muted)',
              border: `1px solid ${badge.tone === 'warning' ? 'rgba(245,158,11,0.2)' : 'var(--border-input)'}`,
            }}>
              {badge.text}
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
            {PAGE_VITALS.map((metricName) => (
              <VitalCard key={metricName} metricKey={metricName} device={device} value={undefined} status="good" loading />
            ))}
          </div>
        ) : available && result ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
            {PAGE_VITALS.map((metricName) => {
              const m = result.metrics[metricName as 'lcp' | 'tbt' | 'cls' | 'ttfb'];
              const value = m?.value;
              const status = (m?.status as MetricStatus) || getMetricStatus(metricName, Number(value || 0));
              return (
                <VitalCard key={metricName} metricKey={metricName} device={device} value={value} status={status} timestamp={m?.timestamp ?? result.timestamp} />
              );
            })}
          </div>
        ) : (
          // No measurement yet (or it failed). Keep the 4-card layout intact —
          // render empty "—" cards rather than collapsing the whole section into a
          // single message — and surface the reason as a small note above the grid.
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ borderRadius: '12px', border: '1px dashed var(--border-card)', padding: '12px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
              {result?.measurementError === 'discovered_url_unreachable'
                ? (result.reason || 'The discovered URL could not be measured. Check the store’s URL suffix configuration.')
                : (result?.reason || 'Not measured yet — click “Refresh all” to run PageSpeed for this page.')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
              {PAGE_VITALS.map((metricName) => (
                <VitalCard key={metricName} metricKey={metricName} device={device} value={undefined} status="good" timestamp={result?.timestamp ?? null} />
              ))}
            </div>
          </div>
        )}
      </section>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Shared header: title, single device toggle, single "Refresh all". */}
      <section style={{ borderRadius: '16px', border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-label)', fontWeight: 700 }}>PageSpeed Metrics</p>
            <h2 style={{ margin: '6px 0 0', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Core Web Vitals by page type</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-input)' }}>
              <button type="button" onClick={() => setDevice('mobile')} style={{ padding: '8px 12px', background: device === 'mobile' ? 'var(--bg-input)' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: device === 'mobile' ? 700 : 500 }}>Mobile</button>
              <button type="button" onClick={() => setDevice('desktop')} style={{ padding: '8px 12px', background: device === 'desktop' ? 'var(--bg-input)' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: device === 'desktop' ? 700 : 500 }}>Desktop</button>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '999px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500, cursor: isLoading ? 'default' : 'pointer', opacity: isLoading ? 0.7 : 1 }}
            >
              <RefreshCw size={16} style={{ animation: (refreshing || pagesLoading) ? 'spin 1s linear infinite' : 'none' }} />
              {isLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* PageSpeed fetch/refresh errors are intentionally not surfaced in the UI. */}
      </section>

      {PAGE_SECTIONS.map((section) => renderSection(section))}
    </div>
  );
}