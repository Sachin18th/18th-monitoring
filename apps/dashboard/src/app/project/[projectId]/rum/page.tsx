// apps/dashboard/src/app/project/[projectId]/rum/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { DeviceDistribution } from '@/components/rum/DeviceDistribution';
import RumMetricsPanel from '@/components/RumMetricsPanel';
import { Globe, AlertCircle, Smartphone, CheckCircle2 } from 'lucide-react';
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
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  overflow: 'visible',
};

// Device-split panel below the full-width Errors card. Constrained width so the
// donut doesn't stretch awkwardly across the full row.
const deviceCardRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 420px)',
  gap: '24px',
  overflow: 'visible',
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--text-label)',
  fontWeight: 500,
  marginBottom: '16px',
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
  borderRadius: '8px',
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
// "js" spans uncaught exceptions and promise rejections.
type ErrorCategoryKey = 'all' | 'js' | 'network' | 'resource' | 'checkout' | 'console';

const ERROR_CATEGORIES: { key: ErrorCategoryKey; label: string; types: string[] }[] = [
  { key: 'all', label: 'All', types: [] },
  { key: 'js', label: 'JS', types: ['js_error', 'promise_rejection'] },
  { key: 'network', label: 'Network', types: ['network_error'] },
  { key: 'resource', label: 'Resource', types: ['resource_error'] },
  { key: 'checkout', label: 'Checkout', types: ['checkout_error'] },
  { key: 'console', label: 'Console', types: ['console_error'] },
];

const categoryOfErrorType = (errorType: string): ErrorCategoryKey => {
  const match = ERROR_CATEGORIES.find((category) => category.types.includes(errorType));
  return match ? match.key : 'console';
};


const normalizeLookupValue = (value?: string | null) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const collectLookupValues = (...values: any[]) =>
  values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => normalizeLookupValue(value))
    .filter(Boolean);

const getRowMetadata = (row: any): any => {
  const metadata = row?.metadata;
  if (!metadata) return {};

  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }

  return metadata;
};

const rowMatchesActiveConnector = (row: any, connectorInstanceId: string | null) => {
  if (!connectorInstanceId) return true;

  const metadata = getRowMetadata(row);
  const connectorCandidates = collectLookupValues(
    row?.connectorInstanceId,
    row?.connectorId,
    row?.connectorLabel,
    row?.sourceSystem,
    row?.channel,
    row?.source,
    metadata?.connectorInstanceId,
    metadata?.connectorId,
    metadata?.connectorLabel,
    metadata?.connectorInstanceLabel,
    metadata?.sourceSystem,
    metadata?.source,
    metadata?.platform,
  );

  return connectorCandidates.includes(normalizeLookupValue(connectorInstanceId));
};

export default function RumDashboardPage() {
  const { projectId } = useParams();
  const { apiFetch, token, user } = useAuth();
  const { connectorInstanceId, connectorSelectionTick } = useConnectorFilter();
  const tenantId = user?.tenantId;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [devices, setDevices] = useState<any[]>([]);
  const [storefrontErrors, setStorefrontErrors] = useState<StorefrontErrorRow[]>([]);
  const [errorsTotal, setErrorsTotal] = useState(0);
  const [errorCategory, setErrorCategory] = useState<ErrorCategoryKey>('all');
  const [analytics, setAnalytics] = useState<any>(null);
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);
  const isLoadingRef = useRef(false);

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

      const [perfSummary, deviceData, userAnalytics] = await Promise.all([
        apiFetch(`/api/v1/dashboard/performance/summary?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/performance/device?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/customers/analytics?siteId=${projectId}`)
      ]);

      console.log('[RUM] Performance summary response', { projectId, perfSummary });

      const scopedDevices = Array.isArray(deviceData) ? deviceData.filter((row) => rowMatchesActiveConnector(row, connectorInstanceId)) : [];

      setDevices(scopedDevices);
      setAnalytics(userAnalytics);

      // Storefront errors captured by the public RUM tracker (storefront_errors table).
      try {
        const errorsQuery = new URLSearchParams({ projectId: String(projectId), limit: '50' });
        if (connectorInstanceId) errorsQuery.set('connectorId', connectorInstanceId);
        const errorsResponse = await apiFetch(`/api/rum/errors?${errorsQuery.toString()}`);
        const rows = Array.isArray(errorsResponse?.errors) ? (errorsResponse.errors as StorefrontErrorRow[]) : [];
        setStorefrontErrors(rows);
        setErrorsTotal(Number(errorsResponse?.total) || rows.length);
      } catch (errErr) {
        console.warn('[RUM] Failed to load storefront errors', errErr);
        setStorefrontErrors([]);
        setErrorsTotal(0);
      }
      
    } catch (err: any) {
      console.error('[RUM] Load failed', err);
      setError('Failed to synchronize frontend telemetry. Please check integration health.');
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [apiFetch, projectId, tenantId, token, connectorInstanceId]);

  useEffect(() => {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    setDevices([]);
    setStorefrontErrors([]);
    setErrorsTotal(0);
    setAnalytics(null);
  }, [connectorSelectionTick, projectId, token]);

  // Per-category counts for the filter pills (derived from the fetched rows so the
  // badge counts always match what the list shows).
  const errorCategoryCounts = useMemo(() => {
    const counts: Record<ErrorCategoryKey, number> = { all: 0, js: 0, network: 0, resource: 0, checkout: 0, console: 0 };
    storefrontErrors.forEach((err) => {
      counts.all += 1;
      counts[categoryOfErrorType(err.error_type)] += 1;
    });
    return counts;
  }, [storefrontErrors]);

  const filteredErrors = useMemo(() => {
    if (errorCategory === 'all') return storefrontErrors;
    return storefrontErrors.filter((err) => categoryOfErrorType(err.error_type) === errorCategory);
  }, [storefrontErrors, errorCategory]);

  useEffect(() => {
    loadData();
    // REMOVED: No auto-refresh every 30s to avoid PageSpeed API quota exhaustion (429 errors).
    // Users must manually click Refresh to sync new PageSpeed metrics.
  }, [loadData]);

  const isPageRestricted = allowedPageKeys !== null && !allowedPageKeys.includes('rum');

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

  if (isPageRestricted) {
    return <PageRestricted pageKey="rum" />;
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

      {/* Core Web Vitals — real PageSpeed (PSI) data, shared with the Performance Lab page */}
      <RumMetricsPanel />

      {/* Storefront Errors — full width */}
      <div style={{ ...sectionCardStyle, minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500 }}>
            STOREFRONT ERRORS{errorsTotal > 0 ? ` (${errorsTotal})` : ''}
          </p>
          <span style={{ fontSize: '10px', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em' }}>LIVE</span>
        </div>

        {/* Category filter pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {ERROR_CATEGORIES.map((category) => {
            const count = errorCategoryCounts[category.key];
            if (category.key !== 'all' && count === 0) return null;
            const active = errorCategory === category.key;
            return (
              <button
                key={category.key}
                type="button"
                onClick={() => setErrorCategory(category.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
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
                {category.label}
                <span style={{ fontSize: '11px', color: 'var(--text-label)' }}>{count}</span>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '520px' }}>
          {filteredErrors.length === 0 ? (
            loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px', padding: '12px' }}>
                <AlertCircle style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                Loading storefront errors…
              </div>
            ) : storefrontErrors.length === 0 ? (
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
            filteredErrors.map((err) => {
              const badge = severityBadge(err.severity);
              return (
                <div key={err.id} style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', flexShrink: 0, background: badge.bg, color: badge.color }}>
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

                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4, overflowWrap: 'anywhere', marginBottom: (err.page_url || err.status_code) ? '6px' : 0 }}>
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
      </div>

      {/* Device split panel below the Errors card */}
      <div style={deviceCardRowStyle}>
        {/* Device Split */}
        <div style={sectionCardStyle}>
          <p style={sectionHeadingStyle}>DEVICE DISTRIBUTION</p>
          {devices.length === 0 ? (
            <PanelEmptyState
              icon={<Smartphone style={{ width: '28px', height: '28px' }} />}
              message="No device data yet"
              hint="The mobile vs. desktop split will appear here once real-user sessions are recorded."
            />
          ) : (
            <DeviceDistribution data={devices} title="" />
          )}
        </div>
      </div>
    </div>
  );
}