// apps/dashboard/src/app/project/[projectId]/rum/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import RumMetricsPanel from '@/components/RumMetricsPanel';
import {
  Globe,
  AlertCircle,
  CheckCircle2,
  Activity,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Bug,
  WifiOff,
  FileWarning,
  ShoppingCart,
  Terminal,
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

const sectionCardStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  overflow: 'visible',
};

// Friendly placeholder for panels whose data source isn't populated yet, so the
// page reads as intentional rather than broken/blank.
const PanelEmptyState: React.FC<{ icon: React.ReactNode; message: string; hint?: string }> = ({ icon, message, hint }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      gap: '10px',
      minHeight: '220px',
      padding: '16px',
    }}
  >
    <div style={{ color: 'var(--text-label)', opacity: 0.7 }}>{icon}</div>
    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>{message}</span>
    {hint ? <span style={{ fontSize: '11px', color: 'var(--text-label)', maxWidth: '260px', lineHeight: 1.5 }}>{hint}</span> : null}
  </div>
);

const errorBannerStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  borderRadius: '10px',
  border: '1px solid rgba(244,63,94,0.2)',
  background: 'rgba(244,63,94,0.1)',
  padding: '12px 16px',
  color: '#fb7185',
  overflow: 'visible',
};

type StorefrontErrorRow = {
  id: string;
  error_type: string;
  severity: 'critical' | 'warning' | 'info' | string;
  message: string;
  page_type?: string | null;
  page_url?: string | null;
  request_url?: string | null;
  status_code?: number | null;
  http_method?: string | null;
  source_url?: string | null;
  duration_ms?: number | null;
  resource_tag?: string | null;
  occurred_at?: string | null;
};

// Per-category summary the API returns alongside the paginated rows. Drives the
// signal strip and the filter-pill counts so they reflect the full window, not
// just the rows on the current page.
type ErrorSummaryEntry = { count: number; trend: string; direction: 'up' | 'down' | 'flat' };
type ErrorSummary = {
  js_errors: ErrorSummaryEntry;
  network_errors: ErrorSummaryEntry;
  resource_errors: ErrorSummaryEntry;
  checkout_errors: ErrorSummaryEntry;
  console_errors: ErrorSummaryEntry;
};

const severityBadge = (severity: string): { bg: string; color: string } => {
  switch (String(severity).toLowerCase()) {
    case 'critical':
      return { bg: 'var(--error-bg)', color: 'var(--error-text)' };
    case 'warning':
      return { bg: 'var(--warning-bg)', color: 'var(--warning-text)' };
    default:
      return { bg: 'var(--bg-input)', color: 'var(--text-muted)' };
  }
};

const formatErrorType = (type: string) => String(type || '').replace(/_/g, ' ');

// Category buckets — mirror the backend grouping (storefront-error.service.ts).
// "js" spans uncaught exceptions and promise rejections. `key` doubles as the
// `type` query param the API accepts (js | network | resource | checkout | console).
type ErrorCategoryKey = 'all' | 'js' | 'network' | 'resource' | 'checkout' | 'console';

const ERROR_CATEGORIES: {
  key: ErrorCategoryKey;
  label: string;
  types: string[];
  icon: React.ComponentType<any>;
  summaryKey?: keyof ErrorSummary;
}[] = [
  { key: 'all', label: 'All', types: [], icon: Activity },
  { key: 'js', label: 'JS', types: ['js_error', 'promise_rejection'], icon: Bug, summaryKey: 'js_errors' },
  { key: 'network', label: 'Network', types: ['network_error'], icon: WifiOff, summaryKey: 'network_errors' },
  { key: 'resource', label: 'Resource', types: ['resource_error'], icon: FileWarning, summaryKey: 'resource_errors' },
  { key: 'checkout', label: 'Checkout', types: ['checkout_error'], icon: ShoppingCart, summaryKey: 'checkout_errors' },
  { key: 'console', label: 'Console', types: ['console_error'], icon: Terminal, summaryKey: 'console_errors' },
];

const ERROR_PAGE_SIZE = 20;

export default function RumDashboardPage() {
  const { projectId } = useParams();
  const { apiFetch, token, user } = useAuth();
  const { connectorInstanceId, connectorSelectionTick } = useConnectorFilter();
  const tenantId = user?.tenantId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [analytics, setAnalytics] = useState<any>(null);
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);
  const isLoadingRef = useRef(false);

  // Storefront errors — server-side paginated. `errorsTotal` is the count for the
  // ACTIVE category filter (the API applies `type`), so it drives the pager.
  const [storefrontErrors, setStorefrontErrors] = useState<StorefrontErrorRow[]>([]);
  const [errorsTotal, setErrorsTotal] = useState(0);
  const [errorsSummary, setErrorsSummary] = useState<ErrorSummary | null>(null);
  const [errorCategory, setErrorCategory] = useState<ErrorCategoryKey>('all');
  const [errorPage, setErrorPage] = useState(0);
  const [errorsLoading, setErrorsLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    setLoading(true);
    setError(null);

    try {
      const permissions = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
      const nextAllowedPageKeys = Array.isArray(permissions?.allowedPageKeys) ? permissions.allowedPageKeys.map((value: any) => String(value)) : [];
      setAllowedPageKeys(nextAllowedPageKeys);

      if (!nextAllowedPageKeys.includes('rum')) return;

      const [perfSummary, userAnalytics] = await Promise.all([
        apiFetch(`/api/v1/dashboard/performance/summary?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/customers/analytics?siteId=${projectId}`)
      ]);

      console.log('[RUM] Performance summary response', { projectId, perfSummary });

      setAnalytics(userAnalytics);

    } catch (err: any) {
      console.error('[RUM] Load failed', err);
      setError('Failed to synchronize frontend telemetry. Please check integration health.');
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [apiFetch, projectId, tenantId, token, connectorInstanceId]);

  // Storefront errors are fetched independently so pagination / category changes
  // don't re-run the (expensive) PageSpeed + analytics load above.
  const loadErrors = useCallback(async () => {
    if (!token || !projectId) return;
    // Wait until permissions confirm access before hitting the errors endpoint.
    if (!allowedPageKeys || !allowedPageKeys.includes('rum')) return;

    setErrorsLoading(true);
    try {
      const errorsQuery = new URLSearchParams({
        projectId: String(projectId),
        limit: String(ERROR_PAGE_SIZE),
        offset: String(errorPage * ERROR_PAGE_SIZE),
      });
      if (errorCategory !== 'all') errorsQuery.set('type', errorCategory);
      if (connectorInstanceId) errorsQuery.set('connectorId', connectorInstanceId);

      const errorsResponse = await apiFetch(`/api/rum/errors?${errorsQuery.toString()}`);
      const rows = Array.isArray(errorsResponse?.errors) ? (errorsResponse.errors as StorefrontErrorRow[]) : [];
      setStorefrontErrors(rows);
      setErrorsTotal(Number(errorsResponse?.total) || rows.length);
      if (errorsResponse?.summary) setErrorsSummary(errorsResponse.summary as ErrorSummary);
    } catch (errErr) {
      console.warn('[RUM] Failed to load storefront errors', errErr);
      setStorefrontErrors([]);
      setErrorsTotal(0);
    } finally {
      setErrorsLoading(false);
    }
  }, [apiFetch, projectId, token, allowedPageKeys, errorCategory, errorPage, connectorInstanceId]);

  useEffect(() => {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    setStorefrontErrors([]);
    setErrorsTotal(0);
    setErrorsSummary(null);
    setErrorCategory('all');
    setErrorPage(0);
    setAnalytics(null);
  }, [connectorSelectionTick, projectId, token]);

  useEffect(() => {
    loadData();
    // REMOVED: No auto-refresh every 30s to avoid PageSpeed API quota exhaustion (429 errors).
    // Users must manually click Refresh to sync new PageSpeed metrics.
  }, [loadData]);

  useEffect(() => {
    loadErrors();
  }, [loadErrors]);

  // Category → count derived from the API summary so pill badges reflect the full
  // 24h window (not just the rows on the current page).
  const errorCategoryCounts = useMemo(() => {
    const counts: Record<ErrorCategoryKey, number> = { all: 0, js: 0, network: 0, resource: 0, checkout: 0, console: 0 };
    if (!errorsSummary) return counts;
    counts.js = errorsSummary.js_errors?.count || 0;
    counts.network = errorsSummary.network_errors?.count || 0;
    counts.resource = errorsSummary.resource_errors?.count || 0;
    counts.checkout = errorsSummary.checkout_errors?.count || 0;
    counts.console = errorsSummary.console_errors?.count || 0;
    counts.all = counts.js + counts.network + counts.resource + counts.checkout + counts.console;
    return counts;
  }, [errorsSummary]);

  const totalPages = Math.max(1, Math.ceil(errorsTotal / ERROR_PAGE_SIZE));
  const rangeStart = errorsTotal === 0 ? 0 : errorPage * ERROR_PAGE_SIZE + 1;
  const rangeEnd = Math.min(errorPage * ERROR_PAGE_SIZE + storefrontErrors.length, errorsTotal);

  // Signal strip cards — the top-line health readout, driven by the summary.
  const signalCards = useMemo(
    () =>
      ERROR_CATEGORIES.filter((c) => c.summaryKey).map((c) => {
        const entry = errorsSummary?.[c.summaryKey as keyof ErrorSummary];
        return {
          key: c.key,
          label: c.label,
          icon: c.icon,
          count: entry?.count ?? 0,
          trend: entry?.trend ?? '',
          direction: entry?.direction ?? 'flat',
        };
      }),
    [errorsSummary],
  );

  const isPageRestricted = allowedPageKeys !== null && !allowedPageKeys.includes('rum');

  if (loading && !analytics) {
    return (
      <div style={{ ...pageStyle, ...sectionSpacingStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '999px', border: '4px solid var(--border-card)', borderTopColor: '#6366f1', marginBottom: '16px', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Synchronizing Frontend Telemetry...</span>
        </div>
      </div>
    );
  }

  if (isPageRestricted) {
    return <PageRestricted pageKey="rum" />;
  }

  return (
    <div style={{ ...pageStyle, ...sectionSpacingStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Header — gradient hero with icon badge + live status */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '16px',
          border: '1px solid var(--border-card)',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(168,85,247,0.06) 55%, transparent)',
          padding: '24px 26px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', flexShrink: 0 }}>
              <Globe style={{ width: '22px', height: '22px', color: '#818cf8' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: '20px', lineHeight: 1.25, fontWeight: 600, color: 'var(--text-primary)' }}>
                Frontend Observability (RUM)
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                Real-time user experience monitoring for {projectId as string}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '999px', border: '1px solid rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.1)', flexShrink: 0 }}>
            <span style={{ position: 'relative', display: 'inline-flex', width: '8px', height: '8px' }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '999px', background: '#4ade80', opacity: 0.5, animation: 'ping 1.6s cubic-bezier(0,0,0.2,1) infinite' }} />
              <span style={{ position: 'relative', width: '8px', height: '8px', borderRadius: '999px', background: '#4ade80' }} />
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4ade80' }}>Live</span>
          </div>
        </div>

        {/* Signal strip — per-category error counts (24h vs previous 24h) */}
        <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          {signalCards.map((card) => {
            const Icon = card.icon;
            const TrendIcon = card.direction === 'up' ? TrendingUp : card.direction === 'down' ? TrendingDown : null;
            // "up" (more errors) is bad → red; "down" (fewer) is good → green.
            const trendColor = card.direction === 'up' ? 'var(--error-text)' : card.direction === 'down' ? '#4ade80' : 'var(--text-muted)';
            return (
              <div
                key={card.key}
                style={{
                  borderRadius: '12px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', fontWeight: 600 }}>{card.label}</span>
                  <Icon size={14} style={{ color: 'var(--text-label)' }} />
                </div>
                <div style={{ fontSize: '26px', fontWeight: 700, lineHeight: 1, color: 'var(--text-primary)' }}>{card.count}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: trendColor }}>
                  {TrendIcon ? <TrendIcon size={12} /> : null}
                  <span style={{ color: card.direction === 'flat' ? 'var(--text-muted)' : trendColor }}>{card.trend || '—'}</span>
                </div>
              </div>
            );
          })}
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

      {/* Core Web Vitals — real PageSpeed (PSI) data: LCP, TBT, CLS, TTFB per page type */}
      <RumMetricsPanel />

      {/* Storefront Errors — full width, server-paginated */}
      <div style={{ ...sectionCardStyle, minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <p style={{ margin: 0, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 600 }}>
              Storefront Errors
            </p>
            {errorsTotal > 0 ? (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{errorsTotal.toLocaleString()} total</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={loadErrors}
            disabled={errorsLoading}
            title="Reload storefront errors"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '999px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 500, cursor: errorsLoading ? 'default' : 'pointer', opacity: errorsLoading ? 0.6 : 1 }}
          >
            <RefreshCw size={13} style={{ animation: errorsLoading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>

        {/* Category filter pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {ERROR_CATEGORIES.map((category) => {
            const count = errorCategoryCounts[category.key];
            // Keep "All" always visible; hide empty categories only once we have a summary.
            if (category.key !== 'all' && errorsSummary && count === 0) return null;
            const active = errorCategory === category.key;
            const Icon = category.icon;
            return (
              <button
                key={category.key}
                type="button"
                onClick={() => {
                  setErrorCategory(category.key);
                  setErrorPage(0);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--border-input)' : 'var(--border-card)'}`,
                  background: active ? 'var(--bg-input)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={13} style={{ opacity: active ? 1 : 0.7 }} />
                {category.label}
                <span style={{ fontSize: '11px', color: 'var(--text-label)' }}>{count}</span>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {storefrontErrors.length === 0 ? (
            errorsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px', padding: '12px' }}>
                <RefreshCw style={{ width: '14px', height: '14px', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
                Loading storefront errors…
              </div>
            ) : errorCategory === 'all' ? (
              <PanelEmptyState
                icon={<CheckCircle2 style={{ width: '36px', height: '36px', color: '#4ade80' }} />}
                message="No errors — all clear"
                hint="No storefront errors have been captured in the last 24 hours. New errors will appear here in real time."
              />
            ) : (
              <PanelEmptyState
                icon={<CheckCircle2 style={{ width: '36px', height: '36px', color: '#4ade80' }} />}
                message="No errors in this category"
                hint="Try a different category, or check back later."
              />
            )
          ) : (
            storefrontErrors.map((err) => {
              const badge = severityBadge(err.severity);
              return (
                <div key={err.id} style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, background: badge.bg, color: badge.color }}>
                        {err.severity}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {formatErrorType(err.error_type)}
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-label)', flexShrink: 0 }}>
                      {err.occurred_at ? new Date(err.occurred_at).toLocaleString() : ''}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4, overflowWrap: 'anywhere', marginBottom: (err.page_url || err.status_code || err.page_type) ? '6px' : 0 }}>
                    {err.message}
                  </div>

                  {(err.page_url || err.status_code || err.page_type) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', color: 'var(--text-label)', fontFamily: 'monospace' }}>
                      {err.page_type ? <span>{err.page_type}</span> : null}
                      {typeof err.status_code === 'number' ? <span>{err.http_method ? `${err.http_method} ` : ''}{err.status_code}</span> : null}
                      {err.page_url ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{err.page_url}</span> : null}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Pagination footer */}
        {errorsTotal > ERROR_PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-card)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Showing <strong style={{ color: 'var(--text-secondary)' }}>{rangeStart}–{rangeEnd}</strong> of {errorsTotal.toLocaleString()}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setErrorPage((p) => Math.max(0, p - 1))}
                disabled={errorPage === 0 || errorsLoading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '8px',
                  border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)',
                  fontSize: '12px', fontWeight: 500,
                  cursor: errorPage === 0 || errorsLoading ? 'default' : 'pointer',
                  opacity: errorPage === 0 || errorsLoading ? 0.45 : 1,
                }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '84px', textAlign: 'center' }}>
                Page <strong style={{ color: 'var(--text-secondary)' }}>{errorPage + 1}</strong> of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setErrorPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={errorPage >= totalPages - 1 || errorsLoading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '8px',
                  border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)',
                  fontSize: '12px', fontWeight: 500,
                  cursor: errorPage >= totalPages - 1 || errorsLoading ? 'default' : 'pointer',
                  opacity: errorPage >= totalPages - 1 || errorsLoading ? 0.45 : 1,
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
