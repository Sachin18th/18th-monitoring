'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ChevronDown, Clock3, Gauge, RefreshCw, Timer, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConnectorFilter } from '../hooks/useConnectorFilter';
import PageSpeedCharts from './rum/PageSpeedCharts';

type MetricKey = 'lcp' | 'fid' | 'tbt' | 'cls' | 'ttfb';
type MetricStatus = 'good' | 'needs-improvement' | 'poor';

// Each vital gets its own icon + accent color so the cards are scannable at a glance.
const metricMeta: Record<MetricKey, { label: string; unit: string; icon: React.ComponentType<any>; color: string; thresholds: [number, number]; formatter: (value: number) => string }> = {
  // LCP is stored in ms (thresholds stay in ms for status), but displayed in seconds.
  lcp: { label: 'LCP', unit: 's', icon: Gauge, color: '#6366f1', thresholds: [2500, 4000], formatter: (value) => (value / 1000).toFixed(2) },
  fid: { label: 'FID', unit: 'ms', icon: Zap, color: '#f59e0b', thresholds: [200, 500], formatter: (value) => `${Math.round(value)}` },
  tbt: { label: 'TBT', unit: 'ms', icon: Zap, color: '#f59e0b', thresholds: [200, 600], formatter: (value) => `${Math.round(value)}` },
  cls: { label: 'CLS', unit: '', icon: Timer, color: '#a855f7', thresholds: [0.1, 0.25], formatter: (value) => value.toFixed(2) },
  ttfb: { label: 'TTFB', unit: 'ms', icon: Clock3, color: '#06b6d4', thresholds: [800, 1800], formatter: (value) => `${Math.round(value)}` },
};

// Lighthouse-style score color: green ≥90, amber 50–89, red <50.
const scoreColor = (status: MetricStatus | null, score: number | null): string => {
  if (status === 'good' || (score != null && score >= 90)) return '#22c55e';
  if (status === 'poor' || (score != null && score < 50)) return '#ef4444';
  return '#f59e0b';
};

const statusStyleMap: Record<MetricStatus, { background: string; color: string; border: string }> = {
  good: { background: 'var(--success-bg)', color: 'var(--success-text)', border: 'rgba(34,197,94,0.2)' },
  'needs-improvement': { background: 'var(--warning-bg)', color: 'var(--warning-text)', border: 'rgba(245,158,11,0.2)' },
  poor: { background: 'var(--error-bg)', color: 'var(--error-text)', border: 'rgba(239,68,68,0.2)' },
};

// ── heatmap-matrix cell/table helpers ──────────────────────────────────────────
function heatCell(status: MetricStatus | null): React.CSSProperties {
  const base: React.CSSProperties = { display: 'inline-block', minWidth: '58px', padding: '5px 9px', borderRadius: '8px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontVariantNumeric: 'tabular-nums', fontWeight: 650, fontSize: '12.5px' };
  if (!status) return { ...base, background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-input)' };
  const s = statusStyleMap[status];
  return { ...base, background: s.background, color: s.color, border: `1px solid ${s.border}` };
}
function matrixTh(align: 'left' | 'center'): React.CSSProperties {
  return { textAlign: align, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', fontWeight: 700, padding: '0 6px 11px' };
}
function matrixTd(align: 'left' | 'center'): React.CSSProperties {
  return { textAlign: align, padding: '7px 6px', borderTop: '1px solid var(--border-card)', verticalAlign: 'middle' };
}
function legendKey(color: string): React.CSSProperties {
  return { display: 'inline-block', width: '9px', height: '9px', borderRadius: '3px', background: color, verticalAlign: 'middle', marginRight: '4px' };
}
function SkeletonCell() {
  return <span style={{ display: 'inline-block', width: '48px', height: '22px', borderRadius: '6px', background: 'var(--border-card)', animation: 'pulse 1.2s ease-in-out infinite' }} />;
}

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
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', background: `${meta.color}1f`, border: `1px solid ${meta.color}40`, flexShrink: 0 }}>
          <Icon size={17} style={{ color: meta.color }} />
        </span>
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

// Lighthouse-style circular performance score (0–100) shown in each section header.
function ScoreRing({ score, status, loading }: { score: number | null; status: MetricStatus | null; loading?: boolean }) {
  const size = 60;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const hasScore = score != null && Number.isFinite(Number(score));
  const pct = hasScore ? Math.max(0, Math.min(100, Number(score))) : 0;
  const color = scoreColor(status, hasScore ? Number(score) : null);
  const dash = (pct / 100) * circumference;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ position: 'relative', width: `${size}px`, height: `${size}px`, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-card)" strokeWidth={stroke} />
          {hasScore && !loading ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
            />
          ) : null}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', fontWeight: 700, color: hasScore && !loading ? color : 'var(--text-muted)' }}>
          {loading ? '…' : hasScore ? Math.round(pct) : '—'}
        </div>
      </div>
      <div style={{ lineHeight: 1.3 }}>
        <p style={{ margin: 0, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 700 }}>Performance</p>
        <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Lighthouse score</p>
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
  measurementError?: string;
  discoveredCount?: number;
  coverageTarget?: number;
  coverageLimited?: boolean;
  candidates?: Array<{ url: string; rank: number }>;
  selectedUrl?: string | null;
  isCartPage?: boolean;
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
  { key: 'plp', label: 'PLP — Category Page' },
  { key: 'pdp', label: 'PDP — Product Page' },
  { key: 'checkout', label: 'Checkout' },
];
const PAGE_VITALS: MetricKey[] = ['lcp', 'tbt', 'cls', 'ttfb'];

// Cooldown between the mobile and desktop PSI runs of a single Refresh. Firing desktop
// the instant mobile resolves hits the same (often fragile/staging) origin with a second
// Lighthouse load back-to-back, which is the PAGE_HUNG trigger the backend is already
// guarding against. A short pause lets the origin recover between the two device runs.
const DEVICE_COOLDOWN_MS = 20000;

export default function RumMetricsPanel() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { apiFetch, token, user } = useAuth();
  const { connectorInstanceId, connectorSelectionTick } = useConnectorFilter();
  const tenantId = user?.tenantId;

  // Which page-type section (if any) is currently running a live PSI refresh. Only one
  // page type is measured per request so a refresh stays under the proxy timeout.
  const [refreshingType, setRefreshingType] = useState<PageType | null>(null);
  // Each section has its OWN Mobile/Desktop toggle — a refresh measures both devices and
  // both are cached, so this just picks which stored result a section displays.
  const [sectionDevice, setSectionDevice] = useState<Record<PageType, 'mobile' | 'desktop'>>({
    homepage: 'mobile', plp: 'mobile', pdp: 'mobile', checkout: 'mobile',
  });
  // Single device toggle for the by-page-type heatmap matrix.
  const [matrixDevice, setMatrixDevice] = useState<'mobile' | 'desktop'>('mobile');
  // Which discovered URL each PDP/PLP section is currently viewing. null = the default
  // (top-ranked) candidate. PDP/PLP can have several discovered pages; the user picks
  // which one to view/measure from a per-section dropdown.
  const [sectionUrl, setSectionUrl] = useState<Record<PageType, string | null>>({
    homepage: null, plp: null, pdp: null, checkout: null,
  });
  // Which section's PDP/PLP page picker is currently open (custom dropdown).
  const [openPicker, setOpenPicker] = useState<PageType | null>(null);
  // Error text is captured but intentionally not rendered (PageSpeed errors are hidden in the UI).
  const [, setError] = useState<string | null>(null);

  // Page-type breakdown state (cached client-side per strategy). This is also the
  // single source of truth for the site-wide "Core Web Vitals" panel above, which
  // reads its numbers from the `homepage` entry — so the two panels can never show
  // conflicting values for the same page.
  const [pageData, setPageData] = useState<Record<'mobile' | 'desktop', PagesResponse | null>>({ mobile: null, desktop: null });
  const [pagesLoading, setPagesLoading] = useState(false);
  const [, setPagesError] = useState<string | null>(null);

  const fetchPages = useCallback(async (strategy: 'mobile' | 'desktop', force = false, pageType?: PageType, sourceUrl?: string | null) => {
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
          params: { strategy, ...(force ? { refresh: 'true' } : {}), ...(pageType ? { page_type: pageType } : {}), ...(pageType && sourceUrl ? { source_url: sourceUrl } : {}) },
          // Exceed the server's worst-case PageSpeed time (mobile = 2 retries × 120s).
          // If the client times out first, apiFetch serves STALE cached data, which is
          // exactly the "refresh shows old numbers" symptom we are fixing.
          timeout: 250000,
        });
        const payload = response?.data ? response.data : response;
        // Single-page-type refresh: merge only that section so the others keep their
        // current values (the server returns the rest from cache anyway). A full
        // (no pageType) fetch replaces the whole strategy payload.
        setPageData((prev) => {
          const existing = prev[strategy];
          if (pageType && existing && payload && payload[pageType]) {
            return { ...prev, [strategy]: { ...existing, [pageType]: payload[pageType] } };
          }
          return { ...prev, [strategy]: payload || null };
        });
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
    setSectionUrl({ homepage: null, plp: null, pdp: null, checkout: null });
    setOpenPicker(null);
  }, [connectorSelectionTick, projectId, token]);

  // Lazily load the cached page-type breakdown for BOTH devices (read-only, no PSI), so
  // every section's Mobile/Desktop toggle has data to show. Loads one strategy at a
  // time — once the first lands, this re-runs and loads the other.
  useEffect(() => {
    if (!token || !projectId || !tenantId) return;
    if (pagesLoading) return;
    if (pageData.mobile == null) {
      void fetchPages('mobile', false);
    } else if (pageData.desktop == null) {
      void fetchPages('desktop', false);
    }
  }, [pageData, pagesLoading, fetchPages, token, projectId, tenantId]);

  // NOTE: a live PageSpeed run is triggered ONLY by the Refresh button (handleRefresh
  // below). We deliberately do NOT auto-measure on mount — the lazy load above is
  // read-only and just displays the last stored measurement (or a "not measured yet"
  // state until the user clicks Refresh).

  // Refresh ONE page type for BOTH devices. Each device is a separate request with a
  // single live PSI call, fired sequentially (mobile → desktop) so each stays under the
  // proxy timeout — measuring both in one request is what caused the socket-hang-up.
  // This way switching the device toggle after a refresh never shows a stale/empty card.
  const handleRefreshSection = useCallback(async (pageType: PageType) => {
    if (!token || !projectId || !tenantId) return;
    if (refreshingType) return; // one live run at a time

    setRefreshingType(pageType);
    setError(null);

    // The homepage measurement also feeds the site-wide alerts/RUM path, so kick off
    // the background sync alongside a homepage refresh (never block on it).
    if (pageType === 'homepage') {
      apiFetch(`/api/v1/tenants/${tenantId}/projects/${projectId}/pagespeed/sync`, {
        method: 'POST',
        body: connectorInstanceId ? JSON.stringify({ connectorInstanceId }) : undefined,
        // Backend allows a single PSI attempt up to ~180s for slow staging origins; give
        // the frontend enough headroom so it doesn't spuriously report "still syncing".
        timeout: 210000,
      }).catch((err) => console.warn('[RumMetricsPanel] background sync failed', err));
    }

    // refresh=true + page_type bypasses the server cache for just this page type, and
    // for the SELECTED discovered URL (source_url). fetchPages handles its own errors
    // (sets pagesError, never throws), so run both strategies in order — mobile, desktop.
    const url = sectionUrl[pageType];
    await fetchPages('mobile', true, pageType, url);
    // Cooldown before the desktop run so the origin isn't hit by two back-to-back
    // Lighthouse loads (PAGE_HUNG). See DEVICE_COOLDOWN_MS.
    await new Promise((resolve) => setTimeout(resolve, DEVICE_COOLDOWN_MS));
    await fetchPages('desktop', true, pageType, url);
    setRefreshingType(null);
  }, [apiFetch, connectorInstanceId, fetchPages, projectId, refreshingType, sectionUrl, tenantId, token]);

  // Switch which discovered PDP/PLP page a section is viewing. Loads that URL's cached
  // result for both devices (read-only — no PSI), so toggling the device stays in sync.
  const handleSelectUrl = useCallback(async (pageType: PageType, url: string) => {
    if (refreshingType) return;
    setSectionUrl((prev) => ({ ...prev, [pageType]: url }));
    await fetchPages('mobile', false, pageType, url);
    await fetchPages('desktop', false, pageType, url);
  }, [fetchPages, refreshingType]);

  // Optional status badge for a section header.
  const sectionBadge = (result: PageResult | null): { tone: 'muted' | 'warning'; text: string } | null => {
    if (!result) return null;
    if (result.measuredAgainstHomepage) {
      return { tone: 'muted', text: 'Proxied from homepage — no dedicated URL discovered' };
    }
    // A real PageSpeed/Lighthouse failure (NO_FCP, PAGE_HUNG, timeout, rate limit…).
    // The detailed cause is shown in the note above the grid; keep the badge concise
    // and never blame URL config, which is usually correct.
    if (result.measurementError === 'pagespeed_error' || result.measurementError === 'discovered_url_unreachable') {
      return { tone: 'warning', text: 'PageSpeed couldn’t measure this page' };
    }
    // Real measurement, but the achievable sample was below target. Label honestly so
    // the panel never implies full-catalog sampling occurred.
    if (result.coverageLimited && typeof result.discoveredCount === 'number') {
      return { tone: 'muted', text: `Limited coverage — sampled ${result.discoveredCount} of up to ${result.coverageTarget} URLs` };
    }
    // Any other explanatory note (e.g. Shopify checkout measured against /cart).
    if (result.note) {
      return { tone: 'muted', text: result.note };
    }
    return null;
  };

  const renderSection = ({ key, label }: { key: PageType; label: string }) => {
    const secDevice = sectionDevice[key];
    const strategyData = pageData[secDevice];
    const result = strategyData ? strategyData[key] : null;
    const badge = sectionBadge(result);
    const available = Boolean(result && result.available);
    const sectionRefreshing = refreshingType === key;
    // Skeleton while THIS section runs a live PSI refresh, or while this device's cached
    // data is still loading.
    const sectionLoading = sectionRefreshing || (!strategyData && pagesLoading);
    // Block other sections' refresh buttons while one live run is in flight (one at a time).
    const refreshDisabled = refreshingType !== null;

    const deviceButton = (value: 'mobile' | 'desktop', text: string) => (
      <button
        type="button"
        onClick={() => setSectionDevice((prev) => ({ ...prev, [key]: value }))}
        style={{ padding: '6px 12px', background: secDevice === value ? 'var(--bg-input)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: secDevice === value ? 700 : 500, color: 'var(--text-primary)' }}
      >
        {text}
      </button>
    );

    // PDP/PLP can have several discovered pages — let the user pick which one to view
    // and measure. Homepage/checkout are single-URL, so no picker.
    const candidates = result?.candidates && result.candidates.length > 0 ? result.candidates : [];
    const showPicker = (key === 'pdp' || key === 'plp') && candidates.length > 1;
    const selectedUrl = sectionUrl[key] ?? result?.selectedUrl ?? candidates[0]?.url ?? '';
    const urlShortLabel = (u: string) => {
      try { const p = new URL(u).pathname; return p.length > 1 ? p : u; } catch { return u; }
    };
    // Shopify measures the cart page in place of the hosted checkout, so title it "Cart".
    const displayLabel = key === 'checkout' && result?.isCartPage ? 'Cart' : label;

    return (
      <section key={key} style={{ borderRadius: '16px', border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
            <ScoreRing score={result?.score ?? null} status={result?.scoreStatus ?? null} loading={sectionLoading} />
            <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{displayLabel}</h3>
            {result?.url ? (
              <a href={result.url} target="_blank" rel="noreferrer" title={result.url} style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '460px' }}>
                {result.url}
              </a>
            ) : null}
            {/* Last PageSpeed fetch for THIS page, shown on the outer card. */}
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Clock3 size={12} />
              {result?.timestamp ? `Last fetched ${new Date(result.timestamp).toLocaleString()}` : 'Not fetched yet'}
            </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
            {/* Discovered-page picker (PDP/PLP only) — choose which page to view/measure.
                Custom dropdown (not a native <select>) so long URLs truncate cleanly and
                the panel scrolls within a fixed box instead of running off-screen. */}
            {showPicker ? (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  disabled={refreshDisabled}
                  onClick={() => setOpenPicker((prev) => (prev === key ? null : key))}
                  title={selectedUrl}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '280px', padding: '7px 12px', borderRadius: '999px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '13px', cursor: refreshDisabled ? 'default' : 'pointer', opacity: refreshDisabled ? 0.6 : 1 }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{urlShortLabel(selectedUrl)}</span>
                  <ChevronDown size={14} style={{ flexShrink: 0 }} />
                </button>
                {openPicker === key ? (
                  <>
                    {/* Click-away backdrop. */}
                    <div onClick={() => setOpenPicker(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, width: '380px', maxWidth: '85vw', maxHeight: '320px', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '12px', boxShadow: '0 12px 32px rgba(0,0,0,0.22)', padding: '6px' }}>
                      {candidates.map((c) => (
                        <button
                          key={c.url}
                          type="button"
                          title={c.url}
                          onClick={() => { setOpenPicker(null); void handleSelectUrl(key, c.url); }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: '8px', border: 'none', background: c.url === selectedUrl ? 'var(--bg-input)' : 'transparent', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {urlShortLabel(c.url)}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
            {/* Per-section device toggle — view this page's mobile vs desktop result. */}
            <div style={{ display: 'inline-flex', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-input)' }}>
              {deviceButton('mobile', 'Mobile')}
              {deviceButton('desktop', 'Desktop')}
            </div>
            <button
              type="button"
              onClick={() => handleRefreshSection(key)}
              disabled={refreshDisabled}
              title={`Run PageSpeed for ${displayLabel} (mobile + desktop)`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 13px', borderRadius: '999px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500, cursor: refreshDisabled ? 'default' : 'pointer', opacity: refreshDisabled && !sectionRefreshing ? 0.5 : 1 }}
            >
              <RefreshCw size={15} style={{ animation: sectionRefreshing ? 'spin 1s linear infinite' : 'none' }} />
              {sectionRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {sectionLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
            {PAGE_VITALS.map((metricName) => (
              <VitalCard key={metricName} metricKey={metricName} device={secDevice} value={undefined} status="good" loading />
            ))}
          </div>
        ) : available && result ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
            {PAGE_VITALS.map((metricName) => {
              const m = result.metrics[metricName as 'lcp' | 'tbt' | 'cls' | 'ttfb'];
              const value = m?.value;
              const status = (m?.status as MetricStatus) || getMetricStatus(metricName, Number(value || 0));
              return (
                <VitalCard key={metricName} metricKey={metricName} device={secDevice} value={value} status={status} timestamp={m?.timestamp ?? result.timestamp} />
              );
            })}
          </div>
        ) : (
          // No measurement yet (or it failed). Keep the 4-card layout intact —
          // render empty "—" cards rather than collapsing the whole section into a
          // single message — and surface the reason as a small note above the grid.
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ borderRadius: '12px', border: '1px dashed var(--border-card)', padding: '12px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
              {result?.measurementError
                ? (result.reason || 'PageSpeed couldn’t measure this page.')
                : (result?.reason || 'Not measured yet — click “Refresh” on this section to run PageSpeed for this page.')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
              {PAGE_VITALS.map((metricName) => (
                <VitalCard key={metricName} metricKey={metricName} device={secDevice} value={undefined} status="good" timestamp={result?.timestamp ?? null} />
              ))}
            </div>
          </div>
        )}
      </section>
    );
  };

  return (
    <section style={{ borderRadius: '16px', border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header: title + Lab tag + a single Mobile/Desktop toggle for the matrix. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-label)', fontWeight: 700 }}>PageSpeed Metrics</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h2 style={{ margin: '6px 0 0', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Core Web Vitals by page type</h2>
            <span title="Lab data from Google PageSpeed Insights — a synthetic test run, not real-visitor field measurements." style={{ marginTop: '6px', fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: '6px', background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-input)' }}>Lab · PageSpeed</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '12px', fontSize: '10.5px', color: 'var(--text-label)' }}>
            <span><i style={legendKey('#22c55e')} />Good</span>
            <span><i style={legendKey('#f59e0b')} />Needs work</span>
            <span><i style={legendKey('#ef4444')} />Poor</span>
          </div>
          <div style={{ display: 'inline-flex', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: '10px', padding: '3px', gap: '2px' }}>
            {(['mobile', 'desktop'] as const).map((d) => (
              <button key={d} type="button" onClick={() => setMatrixDevice(d)} aria-pressed={matrixDevice === d}
                style={{ font: 'inherit', fontSize: '12px', fontWeight: 600, border: 0, padding: '5px 12px', borderRadius: '7px', cursor: 'pointer', background: matrixDevice === d ? '#6366f1' : 'transparent', color: matrixDevice === d ? '#fff' : 'var(--text-muted)' }}>
                {d === 'mobile' ? 'Mobile' : 'Desktop'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Heatmap matrix: page types × vitals, colored by Google thresholds. */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12.5px', minWidth: '600px' }}>
          <thead>
            <tr>
              <th style={matrixTh('left')}>Page type</th>
              <th style={matrixTh('center')}>Score</th>
              {PAGE_VITALS.map((mk) => (
                <th key={mk} style={matrixTh('center')}>{metricMeta[mk].label}<span style={{ color: 'var(--text-label)', fontWeight: 500 }}>{metricMeta[mk].unit ? ` (${metricMeta[mk].unit})` : ''}</span></th>
              ))}
              <th style={{ width: '40px' }} />
            </tr>
          </thead>
          <tbody>
            {PAGE_SECTIONS.map(({ key, label }) => {
              const result = pageData[matrixDevice] ? pageData[matrixDevice]![key] : null;
              const refreshing = refreshingType === key;
              const rowLabel = key === 'homepage' ? 'Home' : key === 'plp' ? 'Collection' : key === 'pdp' ? 'Product' : result?.isCartPage ? 'Cart' : 'Checkout';
              const shortPath = (u?: string | null) => { if (!u) return null; try { const p = new URL(u).pathname; return p.length > 1 ? p : u; } catch { return u; } };
              // PDP/PLP can have several discovered pages — let the user pick which one
              // to view/measure. Selecting one runs PageSpeed for that URL.
              const candidates = result?.candidates && result.candidates.length > 0 ? result.candidates : [];
              const showPicker = (key === 'pdp' || key === 'plp') && candidates.length > 1;
              const selectedUrl = sectionUrl[key] ?? result?.selectedUrl ?? candidates[0]?.url ?? result?.url ?? '';
              return (
                <tr key={key}>
                  <td style={matrixTd('left')}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{rowLabel}</div>
                    {showPicker ? (
                      <select
                        value={selectedUrl}
                        onChange={(e) => handleSelectUrl(key, e.target.value)}
                        disabled={refreshingType !== null}
                        title="Choose which page to measure"
                        style={{ marginTop: '4px', maxWidth: '260px', fontSize: '11px', fontFamily: 'ui-monospace, monospace', padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', colorScheme: 'light dark', cursor: refreshingType !== null ? 'default' : 'pointer' }}
                      >
                        {candidates.map((c) => (
                          <option key={c.url} value={c.url} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>{shortPath(c.url)}</option>
                        ))}
                      </select>
                    ) : result?.url ? (
                      <div style={{ fontSize: '10.5px', color: 'var(--text-label)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '260px' }}>{shortPath(result.url)}</div>
                    ) : null}
                  </td>
                  <td style={matrixTd('center')}>
                    {refreshing ? <SkeletonCell /> : result?.score != null ? <span style={heatCell(result.scoreStatus)}>{Math.round(Number(result.score))}</span> : <span style={heatCell(null)}>—</span>}
                  </td>
                  {PAGE_VITALS.map((mk) => {
                    const m = result?.metrics ? result.metrics[mk] : null;
                    return (
                      <td key={mk} style={matrixTd('center')}>
                        {refreshing ? <SkeletonCell /> : m && Number.isFinite(Number(m.value)) ? <span style={heatCell(m.status)}>{metricMeta[mk].formatter(Number(m.value))}</span> : <span style={heatCell(null)}>—</span>}
                      </td>
                    );
                  })}
                  <td style={matrixTd('center')}>
                    <button type="button" onClick={() => handleRefreshSection(key)} disabled={refreshingType !== null} title={`Re-run PageSpeed for ${rowLabel}`}
                      style={{ display: 'inline-flex', padding: '6px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', cursor: refreshingType !== null ? 'default' : 'pointer', opacity: refreshingType !== null && !refreshing ? 0.5 : 1 }}>
                      <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!pageData[matrixDevice] && (
        <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-label)' }}>
          {pagesLoading ? 'Loading PageSpeed data…' : 'No PageSpeed data yet — use a row’s refresh to run a test.'}
        </p>
      )}
    </section>
  );
}