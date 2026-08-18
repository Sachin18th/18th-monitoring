'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  ShoppingBag,
  MousePointerClick,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
  Circle,
  Search,
  Share2,
  Leaf,
  ArrowRight,
  Link2,
  Globe,
  Monitor,
  Cpu,
  CornerDownLeft,
  Clock,
  Eye,
  ChevronRight,
  ChevronLeft,
  Check,
  Radio,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface Props {
  projectId: string;
  connectorInstanceId: string;
  tenantId: string;
  /** Date window from the page's range selector. Drives the Explore lane. */
  range?: '1d' | '7d' | '30d';
}

interface Session {
  id: string;
  session_id: string;
  visitor_id: string;
  started_at: string;
  last_active_at: string;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  landing_page: string | null;
  referrer: string | null;
  channel: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  page_view_count: number;
  funnel_stages_reached: string[];
  product_viewed: boolean;
  add_to_cart: boolean;
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

interface Counts {
  converted: number;
  abandoned_checkout: number;
  browsed: number;
  bounced: number;
  identified: number;
  total: number;
}

// ── Literal palette (inline styles only, matching the page's card language).
const TEXT = '#374151';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const ROW_ALT = '#f9fafb';
const GREEN = '#22c55e';
const ORANGE = '#f59e0b';
const RED = '#ef4444';
const INK = '#111827';

type IconCmp = React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>;

const EVENT_ICONS: Record<string, IconCmp> = {
  page_view: FileText,
  product_view: ShoppingBag,
  element_click: MousePointerClick,
  checkout_step: ShoppingCart,
  checkout_complete: CheckCircle2,
  checkout_abandon: AlertTriangle,
};

// Renders the lucide icon for an event type (falls back to a neutral dot).
const EventIcon: React.FC<{ type: string; size?: number; color?: string }> = ({ type, size = 14, color }) => {
  const Icon = EVENT_ICONS[type] || Circle;
  return <Icon size={size} color={color} />;
};

// ── Acquisition channels (classified server-side; see classifyChannel).
type ChannelFilter = 'all' | 'google' | 'meta' | 'organic' | 'direct' | 'other';
const CHANNEL_PILLS: Array<{ key: ChannelFilter; label: string }> = [
  { key: 'all', label: 'All channels' },
  { key: 'google', label: 'Google' },
  { key: 'meta', label: 'Meta' },
  { key: 'organic', label: 'Organic' },
  { key: 'direct', label: 'Direct' },
  { key: 'other', label: 'Other' },
];
const CHANNEL_META: Record<string, { label: string; color: string; Icon: IconCmp }> = {
  google: { label: 'Google', color: '#4285F4', Icon: Search },
  meta: { label: 'Meta', color: '#1877F2', Icon: Share2 },
  organic: { label: 'Organic', color: '#22c55e', Icon: Leaf },
  direct: { label: 'Direct', color: '#6b7280', Icon: ArrowRight },
  other: { label: 'Other', color: '#f59e0b', Icon: Link2 },
};
const channelMeta = (c: string | null) => (c && CHANNEL_META[c]) || CHANNEL_META.other;

// ── Outcome buckets. Overlapping lenses, not a partition — the counts are not
// expected to sum to the total, which is why the total is labelled separately.
type Outcome = 'all' | 'converted' | 'abandoned_checkout' | 'browsed' | 'bounced';
const OUTCOME_TILES: Array<{ key: Exclude<Outcome, 'all'>; label: string; hint: string; color: string }> = [
  { key: 'converted', label: 'Converted', hint: 'completed a purchase', color: GREEN },
  { key: 'abandoned_checkout', label: 'Abandoned checkout', hint: 'started checkout, never paid', color: RED },
  { key: 'browsed', label: 'Browsed, no cart', hint: 'viewed products, never added', color: ORANGE },
  { key: 'bounced', label: 'Bounced', hint: 'single page view', color: MUTED },
];

type Device = 'all' | 'desktop' | 'mobile' | 'tablet';
type Identified = 'all' | 'true' | 'false';
type Sort = 'recent' | 'intent';
type Lane = 'live' | 'explore';

// ── Volume bounds. A busy store makes thousands of sessions a day, so the list
// is never "all sessions". The Explore lane shows exactly PAGE_SIZE rows per
// page and steps through them with a keyset cursor, so page 40 costs the same
// as page 1.
const PAGE_SIZE = 25;
// Live tail: a feed, not a table. Bounded rows, polled, newest prepended.
const LIVE_WINDOW_MINUTES = 30;
const LIVE_PAGE_SIZE = 25;
const LIVE_MAX_ROWS = 50;
const LIVE_POLL_MS = 10_000;

// Must mirror the page's range selector and the API's allowlist in
// getCustomerIntelligence, so the timeline and the funnel above it describe the
// same window.
const RANGE_DAYS: Record<string, number> = { '1d': 1, '7d': 7, '30d': 30 };
const DEFAULT_RANGE = '1d';

// "24 hours" reads better than "1 day" for the shortest window.
const rangeLabel = (range: string): string => (range === '1d' ? '24 hours' : `${RANGE_DAYS[range] ?? 30} days`);

const truncate = (s: string | null | undefined, n: number): string => {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

const titleCase = (s: string): string =>
  String(s || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const compact = (n: number): string =>
  n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : n.toLocaleString();

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

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: '8px',
  border: `1px solid ${BORDER}`,
  background: '#ffffff',
  fontSize: '12px',
  color: TEXT,
  cursor: 'pointer',
};

// Previous / Next buttons. Disabled reads as greyed-out rather than removed, so
// the pager keeps a stable width as you step through pages.
const pagerButtonStyle = (enabled: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '6px 12px',
  borderRadius: '8px',
  border: `1px solid ${BORDER}`,
  background: '#ffffff',
  fontSize: '12px',
  fontWeight: 600,
  color: enabled ? TEXT : '#9ca3af',
  cursor: enabled ? 'pointer' : 'not-allowed',
});

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

export default function SessionJourneyTimeline({ projectId, connectorInstanceId, tenantId, range = DEFAULT_RANGE }: Props) {
  const { apiFetch } = useAuth();

  // Explore is the default lane: it is the one that pages through the store's
  // sessions. Live is an opt-in "watch what is happening now" feed.
  const [lane, setLane] = useState<Lane>('explore');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 1-based page number in the Explore lane.
  const [page, setPage] = useState(1);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [sessionEvents, setSessionEvents] = useState<Record<string, JourneyEvent[]>>({});
  const [loadingEventsFor, setLoadingEventsFor] = useState<string | null>(null);

  // ── Explore-lane filters.
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [outcome, setOutcome] = useState<Outcome>('all');
  const [device, setDevice] = useState<Device>('all');
  const [identified, setIdentified] = useState<Identified>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Debounce the search box so typing does not fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Newest started_at we already hold — the live tail's exclusive lower bound,
  // so each poll fetches only genuinely new sessions instead of the whole list.
  const liveHighWaterRef = useRef<string | null>(null);
  // Set on every live poll. Shown in the footer, and its state change re-renders
  // the list so the "Xm ago" column keeps counting up even on a quiet tick that
  // returned no new sessions.
  const [lastPolledAt, setLastPolledAt] = useState<string | null>(null);

  const baseParams = useCallback(
    (extra: Record<string, string> = {}) => {
      const qs = new URLSearchParams({
        projectId: String(projectId),
        connectorInstanceId: String(connectorInstanceId),
        ...extra,
      });
      return qs;
    },
    [projectId, connectorInstanceId]
  );

  // Filter params shared by the list and the counts query, so a tile's number
  // always matches the rows that tile lists.
  const exploreScope = useCallback(
    (extra: Record<string, string> = {}) => {
      const days = RANGE_DAYS[range] ?? RANGE_DAYS[DEFAULT_RANGE];
      const to = new Date();
      const from = new Date(to.getTime() - days * 86_400_000);
      const qs = baseParams({ from: from.toISOString(), to: to.toISOString(), ...extra });
      if (channel !== 'all') qs.set('channel', channel);
      if (device !== 'all') qs.set('device', device);
      if (identified !== 'all') qs.set('identified', identified);
      if (search) qs.set('q', search);
      return qs;
    },
    [baseParams, range, channel, device, identified, search]
  );

  // Scope of the bucket counts — everything except `outcome` (the counts query
  // reports every bucket at once) and `sort`/`page` (which don't change totals).
  const countsKey = `${range}:${channel}:${device}:${identified}:${search}`;
  // Scope of the paged list. A change here means page 1 again.
  const listKey = `${countsKey}:${outcome}:${sort}`;

  // Keyset cursors, indexed by page: cursorStack[0] is always null (page 1 needs
  // no cursor) and cursorStack[n] is the cursor that fetches page n+1, learned
  // from page n's response. Held in a ref so paging does not re-trigger the
  // fetch effect, and reset whenever the filter scope changes.
  const cursorStackRef = useRef<Array<string | null>>([null]);
  const listKeyRef = useRef(listKey);

  // ── Explore lane: bucket counts. Refetched on filter changes only, never on
  // page turns — so the "of N" total stays stable while paging through it.
  useEffect(() => {
    if (lane !== 'explore') return;
    let cancelled = false;

    if (!connectorInstanceId) {
      setCounts(null);
      return;
    }

    (async () => {
      try {
        const res = await apiFetch(`/api/storefront/session-journey-counts?${exploreScope().toString()}`);
        if (!cancelled) setCounts(res?.counts ?? null);
      } catch (err) {
        if (cancelled) return;
        console.error('[SessionJourneyTimeline] failed to load counts', err);
        setCounts(null);
      }
    })();

    return () => {
      cancelled = true;
    };
    // countsKey collapses the scope filters into one dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, connectorInstanceId, tenantId, lane, countsKey]);

  // ── Explore lane: one page of sessions.
  useEffect(() => {
    if (lane !== 'explore') return;
    let cancelled = false;

    if (!connectorInstanceId) {
      setSessions([]);
      setLoadingSessions(false);
      return;
    }

    // A filter changed: discard the learned cursors and go back to page 1.
    if (listKeyRef.current !== listKey) {
      listKeyRef.current = listKey;
      cursorStackRef.current = [null];
      if (page !== 1) {
        setPage(1);
        return; // this effect re-runs with page === 1
      }
    }

    const cursor = cursorStackRef.current[page - 1] ?? null;

    setLoadingSessions(true);
    setError(null);
    setExpandedSessionId(null);

    (async () => {
      try {
        const qs = exploreScope({ limit: String(PAGE_SIZE), sort });
        if (outcome !== 'all') qs.set('outcome', outcome);
        if (cursor) qs.set('cursor', cursor);

        const res = await apiFetch(`/api/storefront/session-journeys?${qs.toString()}`);
        if (cancelled) return;

        const list: Session[] = Array.isArray(res?.sessions) ? res.sessions : [];
        setSessions(
          list.map((s) => ({
            ...s,
            funnel_stages_reached: Array.isArray(s.funnel_stages_reached) ? s.funnel_stages_reached : [],
          }))
        );
        // Remember how to reach the next page.
        const next = res?.nextCursor ?? null;
        cursorStackRef.current[page] = next;
        setNextCursor(next);
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
    // listKey collapses every filter into one dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, connectorInstanceId, tenantId, lane, listKey, page]);

  // ── Live lane: last LIVE_WINDOW_MINUTES, polled, newest prepended.
  useEffect(() => {
    if (lane !== 'live') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (!connectorInstanceId) {
      setSessions([]);
      setCounts(null);
      setLoadingSessions(false);
      return;
    }

    liveHighWaterRef.current = null;
    setLoadingSessions(true);
    setError(null);
    setExpandedSessionId(null);
    setNextCursor(null);
    setCounts(null);

    const tick = async (isFirst: boolean) => {
      try {
        const to = new Date();
        const from = new Date(to.getTime() - LIVE_WINDOW_MINUTES * 60_000);
        const qs = baseParams({
          from: from.toISOString(),
          to: to.toISOString(),
          limit: String(LIVE_PAGE_SIZE),
          sort: 'recent',
        });
        // Poll only for sessions newer than the newest row we hold.
        if (!isFirst && liveHighWaterRef.current) qs.set('after', liveHighWaterRef.current);

        const res = await apiFetch(`/api/storefront/session-journeys?${qs.toString()}`);
        if (cancelled) return;

        const incoming: Session[] = (Array.isArray(res?.sessions) ? res.sessions : []).map((s: Session) => ({
          ...s,
          funnel_stages_reached: Array.isArray(s.funnel_stages_reached) ? s.funnel_stages_reached : [],
        }));

        if (incoming.length > 0) {
          liveHighWaterRef.current = incoming[0].started_at;
        }

        setSessions((prev) => {
          if (isFirst) return incoming.slice(0, LIVE_MAX_ROWS);
          if (incoming.length === 0) return prev;
          // Prepend, de-duplicating on session_id — a session can be updated
          // between polls and come back with a newer started_at.
          const seen = new Set(incoming.map((s) => s.session_id));
          return [...incoming, ...prev.filter((s) => !seen.has(s.session_id))].slice(0, LIVE_MAX_ROWS);
        });
        setLastPolledAt(new Date().toISOString());
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error('[SessionJourneyTimeline] live tail failed', err);
        if (isFirst) setError('Failed to load sessions.');
      } finally {
        if (!cancelled) {
          if (isFirst) setLoadingSessions(false);
          timer = setTimeout(() => tick(false), LIVE_POLL_MS);
        }
      }
    };

    tick(true);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, baseParams, connectorInstanceId, tenantId, lane]);

  // Forward paging needs the cursor page N returned; backward paging replays a
  // cursor already in the stack, so it is always available.
  const canGoNext = nextCursor !== null && !loadingSessions;
  const canGoPrev = page > 1 && !loadingSessions;

  const goToPage = useCallback(
    (next: number) => {
      if (next < 1 || loadingSessions) return;
      // Page 1 needs no cursor; any later page needs the one its predecessor
      // returned, so a page whose cursor was never learned is unreachable.
      if (next > 1 && !cursorStackRef.current[next - 1]) return;
      setPage(next);
    },
    [loadingSessions]
  );

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
        const qs = baseParams({ sessionId: sid });
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
    [apiFetch, baseParams, expandedSessionId, sessionEvents]
  );

  const activeFilterCount = useMemo(
    () =>
      [channel !== 'all', device !== 'all', identified !== 'all', outcome !== 'all', Boolean(search)].filter(Boolean)
        .length,
    [channel, device, identified, outcome, search]
  );

  const clearFilters = useCallback(() => {
    setChannel('all');
    setDevice('all');
    setIdentified('all');
    setOutcome('all');
    setSearchInput('');
    setSearch('');
    setSort('recent');
  }, []);

  // Sessions matching the current filter, per the counts query — the honest
  // denominator for "showing X of N", which the page never has to COUNT to page.
  const filteredTotal = useMemo(() => {
    if (!counts) return null;
    if (outcome === 'all') return counts.total;
    return counts[outcome];
  }, [counts, outcome]);

  // Total pages, derived from the counts query rather than by paging to the end.
  // Null until counts land, in which case the footer falls back to "Page N".
  const pageCount = useMemo(
    () => (filteredTotal === null ? null : Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE))),
    [filteredTotal]
  );

  // 1-based index of the first row on this page, for the "Showing a–b of N" label.
  const rangeStart = sessions.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = sessions.length === 0 ? 0 : rangeStart + sessions.length - 1;

  const renderDetail = (session: Session) => {
    const sid = session.session_id;
    const events = sessionEvents[sid];
    const isLoading = loadingEventsFor === sid;

    return (
      <div style={{ padding: '16px 18px', background: ROW_ALT, borderTop: `1px solid ${BORDER}` }}>
        {/* Session metadata bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {(() => {
            const cm = channelMeta(session.channel);
            const CmIcon = cm.Icon;
            const tags = [session.source, session.medium, session.campaign].filter(Boolean).join(' · ');
            return (
              <span
                style={{ ...pillStyle, color: cm.color, borderColor: `${cm.color}55` }}
                title={tags ? `${cm.label} — ${tags}` : cm.label}
              >
                <CmIcon size={13} /> {cm.label}{tags ? ` · ${truncate(tags, 32)}` : ''}
              </span>
            );
          })()}
          <span style={pillStyle}>
            <Monitor size={13} /> {session.device_type ? titleCase(session.device_type) : 'Unknown device'}
          </span>
          {session.browser && (
            <span style={pillStyle}>
              <Globe size={13} /> {session.browser}
            </span>
          )}
          {session.os && (
            <span style={pillStyle}>
              <Cpu size={13} /> {session.os}
            </span>
          )}
          <span style={pillStyle} title={session.landing_page || ''}>
            <Link2 size={13} /> {session.landing_page ? truncate(session.landing_page, 40) : '(no landing page)'}
          </span>
          <span style={pillStyle} title={session.referrer || 'Direct'}>
            <CornerDownLeft size={13} /> {session.referrer ? truncate(session.referrer, 40) : 'Direct'}
          </span>
          <span style={pillStyle}>
            <Clock size={13} /> {formatDuration(session.started_at, session.last_active_at)}
          </span>
          <span style={pillStyle}>
            <Eye size={13} /> {session.page_view_count} page views
          </span>
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
                        color: MUTED,
                      }}
                    >
                      <EventIcon type={evt.event_type} size={14} />
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
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
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
                        <Check size={13} /> Purchase completed
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

  const renderRows = () => (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: '10px', overflow: 'hidden' }}>
      {/* Column headers — clarify what each column represents. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '9px 16px',
          background: ROW_ALT,
          borderBottom: `1px solid ${BORDER}`,
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: MUTED,
        }}
      >
        <span style={{ width: '9px', flexShrink: 0 }} />
        <span style={{ width: '150px', flexShrink: 0 }}>Visitor</span>
        <span style={{ width: '90px', flexShrink: 0 }}>Started</span>
        <span style={{ width: '90px', flexShrink: 0, textAlign: 'center' }}>Channel</span>
        <span style={{ width: '150px', flexShrink: 0 }}>Device / Client</span>
        <span style={{ flex: 1, minWidth: 0 }}>Furthest stage</span>
        <span style={{ width: '16px', flexShrink: 0 }} />
      </div>
      {sessions.map((session, idx) => {
        const sid = session.session_id;
        const isExpanded = expandedSessionId === sid;
        const lastStage = session.funnel_stages_reached[session.funnel_stages_reached.length - 1];
        return (
          <div key={session.id} style={{ borderBottom: idx === sessions.length - 1 && !isExpanded ? 'none' : `1px solid ${BORDER}` }}>
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
              {(() => {
                const cm = channelMeta(session.channel);
                const CmIcon = cm.Icon;
                return (
                  <span
                    title={`Channel: ${cm.label}${session.source ? ` · ${session.source}` : ''}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      fontSize: '11px', fontWeight: 600, color: cm.color,
                      background: `${cm.color}14`, border: `1px solid ${cm.color}33`,
                      borderRadius: '999px', padding: '2px 9px', width: '90px',
                      flexShrink: 0, justifyContent: 'center',
                    }}
                  >
                    <CmIcon size={12} /> {cm.label}
                  </span>
                );
              })()}
              {(() => {
                // Device / client column: device type with browser + OS beneath,
                // so the visitor's environment is legible at a glance.
                const client = [session.browser, session.os].filter(Boolean).join(' · ');
                return (
                  <span style={{ display: 'flex', flexDirection: 'column', width: '150px', flexShrink: 0, minWidth: 0 }} title={client || undefined}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: TEXT }}>
                      <Monitor size={13} style={{ flexShrink: 0, color: MUTED }} />
                      <span style={{ textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {session.device_type || 'Unknown'}
                      </span>
                    </span>
                    {client && (
                      <span style={{ fontSize: '11px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: '18px' }}>
                        {client}
                      </span>
                    )}
                  </span>
                );
              })()}
              <span
                style={{ fontSize: '12px', color: MUTED, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={lastStage || ''}
              >
                {lastStage ? titleCase(lastStage) : '—'}
              </span>
              <ChevronRight
                size={16}
                style={{ color: MUTED, flexShrink: 0, transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}
              />
            </div>

            {/* Expanded detail */}
            {isExpanded && renderDetail(session)}
          </div>
        );
      })}
    </div>
  );

  const laneButton = (key: Lane, label: string, Icon: IconCmp) => {
    const active = lane === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setLane(key)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          border: 'none',
          background: active ? '#ffffff' : 'transparent',
          color: active ? INK : MUTED,
          boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
        }}
      >
        <Icon size={13} /> {label}
      </button>
    );
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: TEXT, margin: 0 }}>Session Journey Timeline</h3>
          <p style={{ fontSize: '12px', color: MUTED, margin: '2px 0 0' }}>
            {lane === 'live'
              ? `Sessions from the last ${LIVE_WINDOW_MINUTES} minutes, refreshing automatically.`
              : 'Individual visitor paths through your storefront — event by event.'}
          </p>
        </div>

        {/* Lane switch: a live feed for watching, an explorer for finding. */}
        <div style={{ display: 'inline-flex', gap: '2px', padding: '3px', borderRadius: '10px', background: ROW_ALT, border: `1px solid ${BORDER}` }}>
          {laneButton('live', 'Live', Radio)}
          {laneButton('explore', 'Explore', SlidersHorizontal)}
        </div>
      </div>

      {lane === 'explore' && (
        <>
          {/* Outcome buckets — the primary way to turn thousands of sessions into
              a browsable list. Counts come from the counts endpoint, so they
              describe the whole window, not just the loaded page. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '14px' }}>
            {OUTCOME_TILES.map((tile) => {
              const active = outcome === tile.key;
              const value = counts ? counts[tile.key] : null;
              return (
                <button
                  key={tile.key}
                  type="button"
                  title={tile.hint}
                  onClick={() => setOutcome(active ? 'all' : tile.key)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    border: `1px solid ${active ? tile.color : BORDER}`,
                    background: active ? `${tile.color}12` : '#ffffff',
                    color: TEXT,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: tile.color, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tile.label}</span>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: active ? tile.color : TEXT, marginTop: '4px' }}>
                    {value === null ? '—' : compact(value)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Acquisition-channel filter pills — filter the session list by origin. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {CHANNEL_PILLS.map((p) => {
              const active = channel === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setChannel(p.key)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: `1px solid ${active ? INK : BORDER}`,
                    background: active ? INK : '#ffffff',
                    color: active ? '#ffffff' : TEXT,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Secondary filters + search. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search email, name or visitor id…"
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 30px',
                  borderRadius: '8px',
                  border: `1px solid ${BORDER}`,
                  fontSize: '12px',
                  color: TEXT,
                  background: '#ffffff',
                }}
              />
            </div>
            <select value={device} onChange={(e) => setDevice(e.target.value as Device)} style={selectStyle} aria-label="Device">
              <option value="all">All devices</option>
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
              <option value="tablet">Tablet</option>
            </select>
            <select value={identified} onChange={(e) => setIdentified(e.target.value as Identified)} style={selectStyle} aria-label="Identity">
              <option value="all">Everyone</option>
              <option value="true">Identified only</option>
              <option value="false">Guests only</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={selectStyle} aria-label="Sort">
              <option value="recent">Most recent</option>
              <option value="intent">Highest intent</option>
            </select>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                style={{ ...selectStyle, display: 'inline-flex', alignItems: 'center', gap: '5px', color: MUTED }}
              >
                <X size={13} /> Clear ({activeFilterCount})
              </button>
            )}
          </div>
        </>
      )}

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
        <div style={{ padding: '24px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
          {lane === 'live'
            ? `No sessions in the last ${LIVE_WINDOW_MINUTES} minutes`
            : activeFilterCount > 0
              ? 'No sessions match these filters'
              : 'No sessions recorded yet'}
        </div>
      ) : (
        <>
          {renderRows()}

          {lane === 'live' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '14px', fontSize: '12px', color: MUTED }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: GREEN, flexShrink: 0, animation: 'pulse 2s ease-in-out infinite' }} />
              Live · {sessions.length} session{sessions.length === 1 ? '' : 's'} in the last {LIVE_WINDOW_MINUTES} minutes,
              refreshing every {LIVE_POLL_MS / 1000}s
              {lastPolledAt ? ` · updated ${formatTime(lastPolledAt)}` : ''}
            </div>
          ) : (
            // Keyset pagination, PAGE_SIZE rows per page. Prev replays a cursor
            // already in the stack; Next uses the one this page returned. The
            // page total comes from the counts query, so "Page 2 of 4" is honest
            // without ever counting the paged result set.
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '14px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: MUTED }}>
                Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}
                {filteredTotal !== null ? ` of ${filteredTotal.toLocaleString()}` : ''} session
                {filteredTotal === 1 ? '' : 's'} in the last {rangeLabel(range)}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={!canGoPrev}
                  style={pagerButtonStyle(canGoPrev)}
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <span style={{ fontSize: '12px', color: MUTED, minWidth: '96px', textAlign: 'center' }}>
                  {loadingSessions ? (
                    <Spinner size={13} />
                  ) : (
                    <>Page {page.toLocaleString()}{pageCount !== null ? ` of ${pageCount.toLocaleString()}` : ''}</>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={!canGoNext}
                  style={pagerButtonStyle(canGoNext)}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
