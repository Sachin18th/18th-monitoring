'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, ChevronDown, ExternalLink, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const cardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '20px',
  overflow: 'visible',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.03)',
};

const sectionTitleStyle: React.CSSProperties = { fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 };
const sectionSubStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' };

type GatewaySlug = 'twilio' | 'gupshup' | 'clicksend' | 'infobip';

interface SmsGatewayStatus {
  gateway: GatewaySlug;
  displayName: string;
  indicator: 'none' | 'minor' | 'major' | 'critical' | 'unknown';
  description: string;
  statusPageUrl: string;
  checkedAt: string;
  httpStatus: number | null;
  activeDowntimes: number;
}

// Fixed roster — these four gateways are not user-managed at this phase.
const GATEWAYS: { slug: GatewaySlug; displayName: string }[] = [
  { slug: 'twilio', displayName: 'Twilio' },
  { slug: 'gupshup', displayName: 'GupShup' },
  { slug: 'clicksend', displayName: 'ClickSend' },
  { slug: 'infobip', displayName: 'Infobip' },
];

// Indicator -> badge. Matches the Payment Gateways status palette exactly.
const badgeForIndicator = (indicator: SmsGatewayStatus['indicator']) => {
  if (indicator === 'none') {
    return { label: 'OPERATIONAL', text: 'var(--success-text, #15803d)', bg: 'var(--success-bg, rgba(34,197,94,0.14))' };
  }
  if (indicator === 'minor') {
    return { label: 'DEGRADED', text: 'var(--warning-text, #92400e)', bg: 'var(--warning-bg, rgba(245,158,11,0.18))' };
  }
  if (indicator === 'major' || indicator === 'critical') {
    return { label: 'DOWN', text: 'var(--error-text, #b91c1c)', bg: 'var(--error-bg, rgba(239,68,68,0.14))' };
  }
  return { label: 'UNKNOWN', text: 'var(--text-muted)', bg: 'rgba(148,163,184,0.15)' };
};

const relativeTime = (iso: string | null): string => {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

interface SmsGatewayPanelProps {
  projectId: string;
}

export function SmsGatewayPanel({ projectId }: SmsGatewayPanelProps) {
  const { apiFetch, token } = useAuth();

  // Cached probe results keyed by gateway slug — reused when a gateway is
  // toggled back on so we don't refetch unnecessarily.
  const [statuses, setStatuses] = useState<Record<string, SmsGatewayStatus>>({});
  // Nothing selected by default — the user picks which gateway(s) to inspect.
  const [selected, setSelected] = useState<Set<GatewaySlug>>(new Set());
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<GatewaySlug | null>(null);
  const didInit = useRef(false);

  const basePath = `/api/v1/dashboard/customers/sms-gateways?siteId=${projectId}`;

  // Fetch all four in parallel (server fans out with Promise.allSettled).
  const loadAll = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    setSynced(false);
    setError(null);
    try {
      const res = await apiFetch(basePath, { timeout: 30000 });
      const list: SmsGatewayStatus[] = Array.isArray(res) ? res : [];
      if (list.length === 0) {
        setError('Unable to reach SMS gateway status endpoints. Check server connectivity and try again.');
      } else {
        const next: Record<string, SmsGatewayStatus> = {};
        list.forEach((item) => {
          next[item.gateway] = item;
        });
        setStatuses(next);
        setSynced(true);
      }
    } catch (err) {
      console.error('[SmsGateways] Load failed', err);
      setError('Unable to reach SMS gateway status endpoints. Check server connectivity and try again.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, projectId, token]);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    loadAll();
  }, [loadAll]);

  // Probe a single gateway (used when toggling one back on without cached data).
  const loadOne = useCallback(async (slug: GatewaySlug) => {
    if (!token || !projectId) return;
    try {
      const res = await apiFetch(`${basePath}&gateway=${slug}`, { timeout: 15000 });
      if (res && res.gateway) {
        setStatuses((current) => ({ ...current, [slug]: res as SmsGatewayStatus }));
      }
    } catch (err) {
      console.error(`[SmsGateways] Single probe failed (${slug})`, err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, projectId, token]);

  const toggleGateway = useCallback((slug: GatewaySlug) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(slug)) {
        // Selection may go all the way back to zero (the default state).
        next.delete(slug);
      } else {
        next.add(slug);
        // Fetch fresh status on (re)select only if we have nothing cached.
        if (!statuses[slug]) {
          loadOne(slug);
        }
      }
      return next;
    });
  }, [statuses, loadOne]);

  const visibleGateways = GATEWAYS.filter((g) => selected.has(g.slug));
  const showSkeletons = loading && Object.keys(statuses).length === 0;

  // Most recent probe timestamp across all checked gateways — SMS status is a
  // live, on-demand probe (no background history), so this "last fetch" is the
  // meaningful freshness signal, not a time-period filter.
  const lastChecked = (() => {
    const times = Object.values(statuses)
      .map((s) => new Date(s.checkedAt).getTime())
      .filter((n) => !Number.isNaN(n));
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
  })();

  return (
    <div style={cardStyle}>
      {/* Header — mirrors the Payment Gateway Status header. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={sectionTitleStyle}>SMS Gateway Status</h3>
          <p style={{ ...sectionSubStyle, lineHeight: 1.6, maxWidth: '640px' }}>
            Live, on-demand check from each gateway&apos;s public status page (not filtered by the dashboard time period).
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success-text, #15803d)', flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: 'var(--success-text, #15803d)' }}>Live</span>
            <span>· Last checked {lastChecked ? relativeTime(lastChecked) : 'never'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={loadAll}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid var(--border-card)',
              background: 'transparent',
              color: 'var(--text-primary)',
              borderRadius: '8px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            <RefreshCw style={{ width: '13px', height: '13px', flexShrink: 0, animation: loading ? 'spin 1s linear infinite' : undefined }} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              border: '1px solid transparent',
              color: loading ? 'var(--text-muted)' : 'var(--success-text, #15803d)',
              background: loading ? 'rgba(148,163,184,0.15)' : 'var(--success-bg, rgba(34,197,94,0.14))',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'Checking…' : synced ? 'Refresh synced' : 'Idle'}
          </span>
        </div>
      </div>

      {/* Gateway selector pills. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        {GATEWAYS.map((g) => {
          const isSelected = selected.has(g.slug);
          return (
            <button
              key={g.slug}
              type="button"
              onClick={() => toggleGateway(g.slug)}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${isSelected ? 'rgba(59,130,246,0.4)' : 'var(--border-card)'}`,
                background: isSelected ? 'rgba(59,130,246,0.12)' : 'transparent',
                color: isSelected ? '#3b82f6' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              {g.displayName}
            </button>
          );
        })}
      </div>

      {/* Inline error — page does not crash; Refresh stays clickable above. */}
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
            marginBottom: '16px',
          }}
        >
          <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* Empty state — nothing selected (the default). */}
      {!error && visibleGateways.length === 0 && (
        <div
          style={{
            borderRadius: '10px',
            border: '1px dashed var(--border-card)',
            background: 'rgba(15,23,42,0.02)',
            padding: '24px 16px',
            textAlign: 'center',
            fontSize: '13px',
            color: 'var(--text-muted)',
          }}
        >
          Select a gateway above to view its live status.
        </div>
      )}

      {/* Accordion rows. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {showSkeletons
          ? visibleGateways.map((g) => (
              <div
                key={g.slug}
                style={{
                  borderRadius: '10px',
                  border: '1px solid var(--border-card)',
                  background: 'rgba(15,23,42,0.02)',
                  padding: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ width: '90px', height: '12px', borderRadius: '4px', background: 'var(--border-card)', animation: 'pulse-glow 1.5s ease-in-out infinite' }} />
                    <span style={{ width: '60px', height: '9px', borderRadius: '4px', background: 'var(--border-card)', animation: 'pulse-glow 1.5s ease-in-out infinite' }} />
                  </div>
                  <span style={{ width: '74px', height: '18px', borderRadius: '999px', background: 'var(--border-card)', animation: 'pulse-glow 1.5s ease-in-out infinite' }} />
                </div>
              </div>
            ))
          : visibleGateways.map((g) => {
              const status = statuses[g.slug];
              const indicator = status?.indicator ?? 'unknown';
              const badge = badgeForIndicator(indicator);
              const isExpanded = expanded === g.slug;
              const downtimes = status?.activeDowntimes ?? 0;

              return (
                <div
                  key={g.slug}
                  style={{
                    borderRadius: '10px',
                    border: '1px solid var(--border-card)',
                    background: 'rgba(15,23,42,0.02)',
                    padding: '10px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpanded((current) => (current === g.slug ? null : g.slug))}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{g.displayName}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {g.slug.toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <span
                        style={{
                          padding: '3px 9px',
                          borderRadius: '999px',
                          fontSize: '9px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          border: '1px solid transparent',
                          color: badge.text,
                          background: badge.bg,
                        }}
                      >
                        {badge.label}
                      </span>
                      <ChevronDown
                        style={{
                          width: '14px',
                          height: '14px',
                          color: 'var(--text-label)',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.16s ease',
                        }}
                      />
                    </div>
                  </button>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    <span>Active downtimes</span>
                    <span style={{ fontWeight: 700, color: downtimes > 0 ? 'var(--error-text, #b91c1c)' : 'var(--text-primary)' }}>{downtimes}</span>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
                      {[
                        { label: 'Status Description', value: status?.description || '—' },
                        { label: 'Last Checked', value: relativeTime(status?.checkedAt ?? null) },
                      ].map((row) => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '11px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                          <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{row.value}</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '11px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Status Page</span>
                        {status?.statusPageUrl ? (
                          <a
                            href={status.statusPageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                          >
                            View
                            <ExternalLink style={{ width: '11px', height: '11px' }} />
                          </a>
                        ) : (
                          <span style={{ color: 'var(--text-primary)' }}>—</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '11px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>HTTP Status</span>
                        <span style={{ color: status?.httpStatus && status.httpStatus < 400 ? 'var(--text-primary)' : '#ef4444', fontFamily: 'monospace' }}>
                          {status?.httpStatus ?? 'error'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
      </div>
    </div>
  );
}

export default SmsGatewayPanel;
