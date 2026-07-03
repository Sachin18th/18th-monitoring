'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

interface Props {
  projectId: string;
  connectorInstanceId: string;
  tenantId: string;
}

interface Session {
  id: string;
  session_id: string;
  visitor_id: string;
  started_at: string;
  last_active_at: string;
  device_type: string | null;
  landing_page: string | null;
  referrer: string | null;
  page_view_count: number;
  funnel_stages_reached: string[];
  purchase_completed: boolean;
  checkout_started: boolean;
  funnel_stage: string | null;
  customer_name: string | null;
  email: string | null;
}

interface JourneyEvent {
  id: string;
  event_type: string;
  page_url: string | null;
  page_title: string | null;
  occurred_at: string;
  canonical_stage: string | null;
}

// ── Literal palette (inline styles only, matching the page's card language).
const TEXT = '#374151';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const ROW_ALT = '#f9fafb';
const GREEN = '#22c55e';
const ORANGE = '#f59e0b';
const RED = '#ef4444';

const EVENT_ICONS: Record<string, string> = {
  page_view: '📄',
  product_view: '🛍️',
  element_click: '👆',
  checkout_step: '🛒',
  checkout_complete: '✅',
  checkout_abandon: '⚠️',
};

const eventIcon = (type: string) => EVENT_ICONS[type] || '•';

const PAGE_SIZE = 10;

const truncate = (s: string | null | undefined, n: number): string => {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

const titleCase = (s: string): string =>
  String(s || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

// "2h ago" style relative time.
const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

// "Xm Ys" duration between two timestamps.
const formatDuration = (startIso: string, endIso: string): string => {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return '—';
  const secs = Math.max(0, Math.round((end - start) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
};

// HH:MM:SS in local time.
const formatTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const dotColor = (s: Session): string => {
  if (s.purchase_completed) return GREEN;
  if (s.checkout_started) return ORANGE;
  return RED;
};

const cardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: `1px solid ${BORDER}`,
  background: '#ffffff',
  padding: '20px',
  color: TEXT,
};

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 10px',
  borderRadius: '999px',
  border: `1px solid ${BORDER}`,
  background: ROW_ALT,
  fontSize: '12px',
  color: TEXT,
  whiteSpace: 'nowrap',
};

const Spinner: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <span
    style={{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '999px',
      border: `2px solid ${BORDER}`,
      borderTopColor: MUTED,
      display: 'inline-block',
      animation: 'spin 1s linear infinite',
    }}
  />
);

export default function SessionJourneyTimeline({ projectId, connectorInstanceId, tenantId }: Props) {
  const { apiFetch } = useAuth();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [sessionEvents, setSessionEvents] = useState<Record<string, JourneyEvent[]>>({});
  const [loadingEventsFor, setLoadingEventsFor] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // ── Load session list on mount / when scope changes.
  useEffect(() => {
    let cancelled = false;

    if (!connectorInstanceId) {
      setSessions([]);
      setLoadingSessions(false);
      return;
    }

    setLoadingSessions(true);
    setError(null);
    setExpandedSessionId(null);
    setPage(1);

    (async () => {
      try {
        const qs = new URLSearchParams({
          projectId: String(projectId),
          connectorInstanceId: String(connectorInstanceId),
          limit: '50',
        });
        const res = await apiFetch(`/api/storefront/session-journeys?${qs.toString()}`);
        if (cancelled) return;
        const list: Session[] = Array.isArray(res?.sessions) ? res.sessions : [];
        setSessions(
          list.map((s) => ({
            ...s,
            funnel_stages_reached: Array.isArray(s.funnel_stages_reached) ? s.funnel_stages_reached : [],
          }))
        );
      } catch (err) {
        if (cancelled) return;
        console.error('[SessionJourneyTimeline] failed to load sessions', err);
        setError('Failed to load sessions.');
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiFetch, projectId, connectorInstanceId, tenantId]);

  const handleRowClick = useCallback(
    async (session: Session) => {
      const sid = session.session_id;

      // Collapse if already open.
      if (expandedSessionId === sid) {
        setExpandedSessionId(null);
        return;
      }

      // Cached → just expand.
      if (sessionEvents[sid]) {
        setExpandedSessionId(sid);
        return;
      }

      // Otherwise fetch, then expand.
      setExpandedSessionId(sid);
      setLoadingEventsFor(sid);
      try {
        const qs = new URLSearchParams({
          projectId: String(projectId),
          connectorInstanceId: String(connectorInstanceId),
          sessionId: sid,
        });
        const res = await apiFetch(`/api/storefront/session-journey-events?${qs.toString()}`);
        const events: JourneyEvent[] = Array.isArray(res?.events) ? res.events : [];
        setSessionEvents((prev) => ({ ...prev, [sid]: events }));
      } catch (err) {
        console.error('[SessionJourneyTimeline] failed to load events', err);
        setSessionEvents((prev) => ({ ...prev, [sid]: [] }));
      } finally {
        setLoadingEventsFor((cur) => (cur === sid ? null : cur));
      }
    },
    [apiFetch, projectId, connectorInstanceId, expandedSessionId, sessionEvents]
  );

  const renderDetail = (session: Session) => {
    const sid = session.session_id;
    const events = sessionEvents[sid];
    const isLoading = loadingEventsFor === sid;

    return (
      <div style={{ padding: '16px 18px', background: ROW_ALT, borderTop: `1px solid ${BORDER}` }}>
        {/* Session metadata bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          <span style={pillStyle}>{session.device_type || 'unknown device'}</span>
          <span style={pillStyle} title={session.landing_page || ''}>
            🔗 {session.landing_page ? truncate(session.landing_page, 40) : '(no landing page)'}
          </span>
          <span style={pillStyle} title={session.referrer || 'Direct'}>
            ↩ {session.referrer ? truncate(session.referrer, 40) : 'Direct'}
          </span>
          <span style={pillStyle}>⏱ {formatDuration(session.started_at, session.last_active_at)}</span>
          <span style={pillStyle}>👁 {session.page_view_count} page views</span>
        </div>

        {/* Event timeline */}
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0', color: MUTED, fontSize: '13px' }}>
            <Spinner /> Loading journey…
          </div>
        ) : !events || events.length === 0 ? (
          <div style={{ padding: '12px 0', color: MUTED, fontSize: '13px' }}>No events recorded for this session</div>
        ) : (
          <div>
            {events.map((evt, idx) => {
              const isLast = idx === events.length - 1;
              const showDropOff = isLast && !session.purchase_completed;
              const showPurchase = isLast && session.purchase_completed;
              return (
                <div key={evt.id} style={{ display: 'flex', gap: '12px' }}>
                  {/* Stepper spine + icon */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '28px', flexShrink: 0 }}>
                    <span
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        border: `1px solid ${BORDER}`,
                        background: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                      }}
                    >
                      {eventIcon(evt.event_type)}
                    </span>
                    {!isLast && <span style={{ flex: 1, width: '2px', background: BORDER, minHeight: '18px' }} />}
                  </div>

                  {/* Event body */}
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: TEXT }}>{titleCase(evt.event_type)}</span>
                      <span style={{ fontSize: '12px', color: MUTED, flexShrink: 0 }}>{formatTime(evt.occurred_at)}</span>
                    </div>
                    <div
                      style={{ fontSize: '12px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={evt.page_title || evt.page_url || ''}
                    >
                      {evt.page_title || truncate(evt.page_url, 60) || '—'}
                    </div>

                    {showPurchase && (
                      <span
                        style={{
                          display: 'inline-block',
                          marginTop: '8px',
                          padding: '3px 10px',
                          borderRadius: '999px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#15803d',
                          background: 'rgba(34,197,94,0.12)',
                          border: `1px solid ${GREEN}`,
                        }}
                      >
                        ✓ Purchase completed
                      </span>
                    )}

                    {showDropOff && (
                      <div style={{ marginTop: '10px' }}>
                        <div style={{ borderTop: `2px dashed ${RED}`, marginBottom: '6px' }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: RED }}>Session ended here</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stage tags */}
        {session.funnel_stages_reached.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${BORDER}` }}>
            {session.funnel_stages_reached.map((stage, i) => (
              <span
                key={`${stage}-${i}`}
                style={{
                  padding: '2px 9px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: MUTED,
                  background: '#ffffff',
                  border: `1px solid ${BORDER}`,
                }}
              >
                {titleCase(stage)}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={cardStyle}>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: TEXT, margin: 0 }}>Session Journey Timeline</h3>
        <p style={{ fontSize: '12px', color: MUTED, margin: '2px 0 0' }}>
          Individual visitor paths through your storefront — event by event.
        </p>
      </div>

      {!connectorInstanceId ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
          Select a store to view individual session journeys.
        </div>
      ) : loadingSessions ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '28px 0', color: MUTED, fontSize: '13px' }}>
          <Spinner /> Loading sessions…
        </div>
      ) : error ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: RED, fontSize: '13px' }}>{error}</div>
      ) : sessions.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No sessions recorded yet</div>
      ) : (() => {
        const pageCount = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
        const currentPage = Math.min(page, pageCount);
        const start = (currentPage - 1) * PAGE_SIZE;
        const pageSessions = sessions.slice(start, start + PAGE_SIZE);
        return (
        <>
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: '10px', overflow: 'hidden' }}>
          {pageSessions.map((session, idx) => {
            const sid = session.session_id;
            const isExpanded = expandedSessionId === sid;
            const lastStage = session.funnel_stages_reached[session.funnel_stages_reached.length - 1];
            return (
              <div key={session.id} style={{ borderBottom: idx === pageSessions.length - 1 && !isExpanded ? 'none' : `1px solid ${BORDER}` }}>
                {/* Session row */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleRowClick(session)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRowClick(session);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    background: isExpanded ? ROW_ALT : idx % 2 === 1 ? ROW_ALT : '#ffffff',
                  }}
                >
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: dotColor(session), flexShrink: 0 }} />
                  {(() => {
                    // Prefer the resolved buyer identity (name → email); otherwise
                    // fall back to a "Guest · <short id>" label so an anonymous
                    // visitor is legible without exposing the raw hex id alone.
                    const identity = session.customer_name || session.email;
                    const shortId = session.visitor_id ? session.visitor_id.slice(0, 8) : null;
                    const label = identity || (shortId ? `Guest · ${shortId}` : '—');
                    return (
                      <span
                        style={{ fontSize: '13px', fontWeight: 600, color: TEXT, width: '150px', flexShrink: 0, fontFamily: identity ? 'inherit' : 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={identity || session.visitor_id || ''}
                      >
                        {label}
                      </span>
                    );
                  })()}
                  <span style={{ fontSize: '12px', color: MUTED, width: '90px', flexShrink: 0 }}>{relativeTime(session.started_at)}</span>
                  <span style={{ fontSize: '12px', color: TEXT, width: '90px', flexShrink: 0, textTransform: 'capitalize' }}>
                    {session.device_type || '—'}
                  </span>
                  <span
                    style={{ fontSize: '12px', color: MUTED, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={lastStage || ''}
                  >
                    {lastStage ? titleCase(lastStage) : '—'}
                  </span>
                  <span style={{ fontSize: '14px', color: MUTED, flexShrink: 0, transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
                    ›
                  </span>
                </div>

                {/* Expanded detail */}
                {isExpanded && renderDetail(session)}
              </div>
            );
          })}
        </div>

        {/* Pagination — client-side over the loaded sessions. */}
        {pageCount > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '14px' }}>
            <span style={{ fontSize: '12px', color: MUTED }}>
              Showing {start + 1}–{Math.min(start + PAGE_SIZE, sessions.length)} of {sessions.length} sessions
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${BORDER}`,
                  background: '#ffffff',
                  fontSize: '12px',
                  color: currentPage <= 1 ? '#9ca3af' : TEXT,
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Previous
              </button>
              <span style={{ fontSize: '12px', color: MUTED }}>
                Page {currentPage} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage >= pageCount}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${BORDER}`,
                  background: '#ffffff',
                  fontSize: '12px',
                  color: currentPage >= pageCount ? '#9ca3af' : TEXT,
                  cursor: currentPage >= pageCount ? 'not-allowed' : 'pointer',
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
        </>
        );
      })()}
    </div>
  );
}