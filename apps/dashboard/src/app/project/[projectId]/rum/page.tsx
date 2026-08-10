// apps/dashboard/src/app/project/[projectId]/rum/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import RumMetricsPanel from '@/components/RumMetricsPanel';
import {
  Globe, AlertCircle, CheckCircle2, Activity, RefreshCw, TrendingUp, TrendingDown,
  Bug, WifiOff, FileWarning, ShoppingCart, Terminal, ChevronRight, ChevronLeft, Users, Layers,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useConnectorFilter } from '@/hooks/useConnectorFilter';
import { PageRestricted } from '@/components/PageRestricted';

// ── constants ────────────────────────────────────────────────────────────────
const RANGES = [
  { key: '1h', label: '1h', ms: 3_600_000 },
  { key: '24h', label: '24h', ms: 86_400_000 },
  { key: '7d', label: '7d', ms: 7 * 86_400_000 },
  { key: '30d', label: '30d', ms: 30 * 86_400_000 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

type CatKey = 'all' | 'js' | 'network' | 'resource' | 'checkout' | 'console';
const CATEGORIES: { key: CatKey; label: string; icon: React.ComponentType<any>; summaryKey?: string }[] = [
  { key: 'all', label: 'All', icon: Activity },
  { key: 'js', label: 'JS', icon: Bug, summaryKey: 'js_errors' },
  { key: 'network', label: 'Network', icon: WifiOff, summaryKey: 'network_errors' },
  { key: 'resource', label: 'Resource', icon: FileWarning, summaryKey: 'resource_errors' },
  { key: 'checkout', label: 'Checkout', icon: ShoppingCart, summaryKey: 'checkout_errors' },
  { key: 'console', label: 'Console', icon: Terminal, summaryKey: 'console_errors' },
];

const PAGE_LABEL: Record<string, string> = { homepage: 'Home', plp: 'Collection', pdp: 'Product', checkout: 'Checkout', cart: 'Cart', other: 'Other' };
const DEVICE_COLOR: Record<string, string> = { Mobile: '#6366f1', Desktop: '#a855f7', Tablet: '#ec4899', Unknown: '#94a3b8' };
const GROUP_PAGE_SIZE = 15;

const sevColor = (s: string) => (s === 'critical' ? 'var(--error-text)' : s === 'warning' ? 'var(--warning-text)' : 'var(--text-label)');
const fmtWhen = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v).getTime(), now = Date.now(), diff = Math.max(0, now - d);
  const m = Math.floor(diff / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`;
};

// ── page ─────────────────────────────────────────────────────────────────────
export default function RumDashboardPage() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();
  const { connectorInstanceId, connectorSelectionTick } = useConnectorFilter();

  const [allowed, setAllowed] = useState<string[] | null>(null);
  const [range, setRange] = useState<RangeKey>('24h');
  const [overview, setOverview] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [groupsTotal, setGroupsTotal] = useState(0);
  const [category, setCategory] = useState<CatKey>('all');
  const [gPage, setGPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errLoading, setErrLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const window = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - (RANGES.find((r) => r.key === range)?.ms ?? 86_400_000));
    return { from: from.toISOString(), to: to.toISOString() };
  }, [range]);

  const baseParams = useMemo(() => {
    const p = new URLSearchParams({ projectId: String(projectId), from: window.from, to: window.to });
    if (connectorInstanceId) p.set('connectorId', String(connectorInstanceId));
    return p;
  }, [projectId, connectorInstanceId, window]);

  // permissions
  useEffect(() => {
    let active = true;
    (async () => {
      if (!token || !projectId) return;
      try {
        const perms = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
        if (active) setAllowed(Array.isArray(perms?.allowedPageKeys) ? perms.allowedPageKeys.map(String) : []);
      } catch { if (active) setAllowed([]); }
    })();
    return () => { active = false; };
  }, [apiFetch, projectId, token]);

  const loadOverview = useCallback(async () => {
    if (!token || !projectId || !allowed?.includes('rum')) return;
    setLoading(true); setFatal(null);
    try {
      const res = await apiFetch(`/api/rum/overview?${baseParams.toString()}`, { suppressUnauthorizedRedirect: true });
      setOverview(res || null);
      setUpdatedAt(Date.now());
    } catch {
      setFatal('Failed to load frontend telemetry. Check integration health and try again.');
    } finally { setLoading(false); }
  }, [apiFetch, projectId, token, allowed, baseParams]);

  const loadGroups = useCallback(async () => {
    if (!token || !projectId || !allowed?.includes('rum')) return;
    setErrLoading(true);
    try {
      const p = new URLSearchParams(baseParams);
      p.set('limit', String(GROUP_PAGE_SIZE));
      p.set('offset', String(gPage * GROUP_PAGE_SIZE));
      if (category !== 'all') p.set('type', category);
      const res = await apiFetch(`/api/rum/errors/grouped?${p.toString()}`, { suppressUnauthorizedRedirect: true });
      setGroups(Array.isArray(res?.groups) ? res.groups : []);
      setGroupsTotal(Number(res?.total) || 0);
    } catch { setGroups([]); setGroupsTotal(0); }
    finally { setErrLoading(false); }
  }, [apiFetch, projectId, token, allowed, baseParams, category, gPage]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadGroups(); }, [loadGroups]);
  // Reset paging when the scope changes.
  useEffect(() => { setGPage(0); }, [category, range, connectorSelectionTick]);

  const summary = overview?.summary || {};
  const traffic = overview?.traffic || {};
  const checkout = overview?.checkout || { events: 0, sessions: 0 };
  const totalPages = Math.max(1, Math.ceil(groupsTotal / GROUP_PAGE_SIZE));

  if (allowed !== null && !allowed.includes('rum')) return <PageRestricted pageKey="rum" />;

  const refreshAll = () => { loadOverview(); loadGroups(); };

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 28px 60px', display: 'flex', flexDirection: 'column', gap: 18, background: 'var(--bg-page)', color: 'var(--text-primary)', minHeight: '100vh' }}>
      <style>{`@keyframes rspin{to{transform:rotate(360deg)}}`}</style>

      {/* HEADER */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, border: '1px solid var(--border-card)', background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(168,85,247,0.05) 55%, transparent)', padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, flex: 'none', display: 'grid', placeItems: 'center', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
              <Globe style={{ width: 22, height: 22, color: '#818cf8' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 620, letterSpacing: '-.01em' }}>Frontend RUM</h1>
              <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>Real-user experience for {String(projectId)}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-label)' }}>{updatedAt ? `Updated ${fmtWhen(new Date(updatedAt).toISOString())}` : 'Loading…'}</span>
            <div style={{ display: 'inline-flex', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 10, padding: 3, gap: 2 }}>
              {RANGES.map((r) => (
                <button key={r.key} type="button" onClick={() => setRange(r.key)} aria-pressed={range === r.key}
                  style={{ font: 'inherit', fontSize: 12, fontWeight: 600, border: 0, padding: '5px 11px', borderRadius: 7, cursor: 'pointer', background: range === r.key ? 'var(--accent, #6366f1)' : 'transparent', color: range === r.key ? '#fff' : 'var(--text-muted)' }}>
                  {r.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={refreshAll} disabled={loading} style={btnGhost(loading)}>
              <RefreshCw size={13} style={{ animation: loading ? 'rspin 1s linear infinite' : 'none' }} /> Refresh
            </button>
          </div>
        </div>

        {/* signal strip */}
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {CATEGORIES.filter((c) => c.summaryKey).map((c) => {
            const e = summary[c.summaryKey as string] || { count: 0, trend: '', direction: 'flat' };
            const Icon = c.icon;
            const T = e.direction === 'up' ? TrendingUp : e.direction === 'down' ? TrendingDown : null;
            const col = e.direction === 'up' ? 'var(--error-text)' : e.direction === 'down' ? '#22c55e' : 'var(--text-muted)';
            return (
              <div key={c.key} style={{ borderRadius: 12, border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-label)', fontWeight: 700 }}>{c.label}</span>
                  <Icon size={14} style={{ color: 'var(--text-label)' }} />
                </div>
                <div style={{ fontSize: 25, fontWeight: 680, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{e.count}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: col }}>{T ? <T size={12} /> : null}<span style={{ color: e.direction === 'flat' ? 'var(--text-muted)' : col }}>{e.trend || '—'}</span></div>
              </div>
            );
          })}
        </div>
      </div>

      {fatal && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 10, border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.1)', padding: '12px 16px', color: '#fb7185' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}><AlertCircle size={16} /> {fatal}</span>
          <button onClick={refreshAll} style={{ background: 'transparent', border: 'none', color: '#fb7185', textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {/* REVENUE-IMPACT BANNER */}
      {checkout.events > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 18px', borderRadius: 14, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, flex: 'none', display: 'grid', placeItems: 'center', color: 'var(--error-text)', background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.35)' }}>
            <ShoppingCart size={19} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--error-text)' }}>Checkout errors are affecting orders</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
              <strong style={{ color: 'var(--text-primary)' }}>{checkout.events} checkout {checkout.events === 1 ? 'error' : 'errors'}</strong> across <strong style={{ color: 'var(--text-primary)' }}>{checkout.sessions} {checkout.sessions === 1 ? 'session' : 'sessions'}</strong> in this window — customers blocked at the purchase step.
            </div>
          </div>
          <button type="button" onClick={() => { setCategory('checkout'); setGPage(0); }} style={{ marginLeft: 'auto', flex: 'none', fontSize: 12, fontWeight: 700, color: 'var(--error-text)', border: '1px solid rgba(239,68,68,0.45)', borderRadius: 9, padding: '7px 13px', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}>View checkout errors →</button>
        </div>
      )}

      {/* KPI STRIP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <Kpi label="Sessions" value={num(traffic.sessions)} foot={`${num(traffic.errorEvents)} error events`} />
        <Kpi label="Error rate" value={`${traffic.errorRatePct ?? 0}%`}
             delta={traffic.deltaPp != null ? { v: `${traffic.deltaPp > 0 ? '▲' : traffic.deltaPp < 0 ? '▼' : ''} ${Math.abs(traffic.deltaPp)}pp`, good: (traffic.deltaPp ?? 0) <= 0 } : undefined}
             foot="of sessions hit ≥1 error" />
        <Kpi label="Affected sessions" value={num(traffic.errorSessions)} foot="unique sessions with errors" />
        <Kpi label="Checkout impact" value={num(checkout.sessions)} foot={`${num(checkout.events)} checkout errors`} accent={checkout.sessions > 0 ? 'var(--error-text)' : undefined} />
      </div>

      {/* CORE WEB VITALS (Lab / PageSpeed) */}
      <RumMetricsPanel />

      {/* BODY GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        {/* ERROR WORKLIST */}
        <section style={card()}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Errors</h2>
            <span style={{ fontSize: 11.5, color: 'var(--text-label)' }}>grouped by cause · ranked by sessions affected</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, margin: '12px 0 4px' }}>
            {CATEGORIES.map((c) => {
              const count = c.key === 'all'
                ? Object.values(summary).reduce((s: number, e: any) => s + (e?.count || 0), 0)
                : summary[c.summaryKey as string]?.count ?? 0;
              if (c.key !== 'all' && overview && count === 0) return null;
              const active = category === c.key; const Icon = c.icon;
              return (
                <button key={c.key} type="button" onClick={() => { setCategory(c.key); setGPage(0); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', border: `1px solid ${active ? 'var(--border-input)' : 'var(--border-card)'}`, background: active ? 'var(--bg-input)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  <Icon size={13} /> {c.label} <span style={{ fontSize: 11, color: 'var(--text-label)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {errLoading && groups.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12.5, padding: 16 }}><RefreshCw size={14} style={{ animation: 'rspin 1s linear infinite' }} /> Loading errors…</div>
            ) : groups.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '48px 16px', textAlign: 'center' }}>
                <CheckCircle2 style={{ width: 34, height: 34, color: '#22c55e' }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>No errors {category === 'all' ? '' : 'in this category'} — all clear</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-label)', maxWidth: 280 }}>Nothing captured in this window. New errors appear here grouped by cause.</span>
              </div>
            ) : (
              groups.map((g) => <ErrorGroup key={g.fingerprint} g={g} />)
            )}
          </div>

          {groupsTotal > GROUP_PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-card)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{groupsTotal.toLocaleString()} unique errors</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={() => setGPage((p) => Math.max(0, p - 1))} disabled={gPage === 0} style={pagerBtn(gPage === 0)}><ChevronLeft size={14} /> Prev</button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 84, textAlign: 'center' }}>Page {gPage + 1} of {totalPages}</span>
                <button type="button" onClick={() => setGPage((p) => Math.min(totalPages - 1, p + 1))} disabled={gPage >= totalPages - 1} style={pagerBtn(gPage >= totalPages - 1)}>Next <ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section style={card()}>
            <h2 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700 }}>Where errors happen</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, margin: '14px 0 4px' }}>
              <Donut data={(overview?.devices || []).map((d: any) => ({ name: d.name, value: d.value, color: DEVICE_COLOR[d.name] || '#94a3b8' }))} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
                {(overview?.devices || []).length === 0 && <span style={{ fontSize: 12, color: 'var(--text-label)' }}>No data yet.</span>}
                {(overview?.devices || []).map((d: any) => (
                  <div key={d.name} style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: DEVICE_COLOR[d.name] || '#94a3b8' }} />
                    <span>{d.name}</span><span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{d.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            {(overview?.browsers || []).length > 0 && (
              <>
                <div style={{ borderTop: '1px solid var(--border-card)', margin: '14px 0 12px' }} />
                <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-label)', fontWeight: 700, marginBottom: 10 }}>By browser</div>
                <BarList items={(overview?.browsers || []).map((b: any) => ({ label: b.name, pct: b.pct }))} />
              </>
            )}
          </section>

          <section style={card()}>
            <h2 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700 }}>Top pages by error volume</h2>
            {(overview?.topPages || []).length === 0
              ? <span style={{ fontSize: 12, color: 'var(--text-label)' }}>No data yet.</span>
              : <BarList items={(overview?.topPages || []).map((p: any) => ({ label: PAGE_LABEL[p.name] || p.name, pct: p.pct }))} />}
          </section>
        </div>
      </div>
    </div>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────
function ErrorGroup({ g }: { g: any }) {
  return (
    <details style={{ borderTop: '1px solid var(--border-card)' }}>
      <summary style={{ listStyle: 'none', cursor: 'pointer', display: 'grid', gridTemplateColumns: '4px 1fr auto', gap: 12, alignItems: 'center', padding: '13px 2px' }}>
        <span style={{ width: 4, alignSelf: 'stretch', minHeight: 40, borderRadius: 3, background: sevColor(g.severity) }} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.message}</span>
          <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 10.5, padding: '1px 6px', borderRadius: 5, background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>{String(g.error_type).replace(/_/g, ' ')}</span>
            {g.top_page ? <span>{PAGE_LABEL[g.top_page] || g.top_page}</span> : null}
            <span>first {fmtWhen(g.first_seen)}</span><span>last {fmtWhen(g.last_seen)}</span>
          </span>
        </span>
        <span style={{ display: 'flex', gap: 18, alignItems: 'center', textAlign: 'right' }}>
          <Stat n={g.events} l="events" />
          <Stat n={g.sessions} l="sessions" />
          <Stat n={g.session_pct != null ? `${g.session_pct}%` : '—'} l="of sessions" />
          <Spark values={g.spark || []} color={sevColor(g.severity)} />
        </span>
      </summary>
      <div style={{ padding: '2px 0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {g.sample_stack ? (
          <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6, color: 'var(--text-muted)', background: 'var(--bg-input)', border: '1px solid var(--border-card)', borderRadius: 10, padding: '12px 14px', overflowX: 'auto' }}>{g.sample_stack}</pre>
        ) : null}
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {g.status_code ? <span><b style={{ color: 'var(--text-primary)' }}>{g.http_method || ''} {g.status_code}</b></span> : null}
          {g.sample_page_url ? <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{g.sample_page_url}</span> : null}
        </div>
      </div>
    </details>
  );
}

function Stat({ n, l }: { n: any; l: string }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 15, fontWeight: 680, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-label)' }}>{l}</span>
    </span>
  );
}

function Kpi({ label, value, foot, delta, accent }: { label: string; value: string; foot?: string; delta?: { v: string; good: boolean }; accent?: string }) {
  return (
    <div style={{ ...card(), padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-label)', fontWeight: 700 }}>{label}</span>
        {delta && <span style={{ fontSize: 11.5, fontWeight: 700, color: delta.good ? '#22c55e' : 'var(--error-text)' }}>{delta.v}</span>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 660, lineHeight: 1, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', color: accent || 'var(--text-primary)' }}>{value}</div>
      {foot && <div style={{ fontSize: 11, color: 'var(--text-label)' }}>{foot}</div>}
    </div>
  );
}

function BarList({ items }: { items: { label: string; pct: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.pct));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {items.map((i) => (
        <div key={i.label} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 42px', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.label}</span>
          <span style={{ height: 8, borderRadius: 999, background: 'var(--bg-input)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(i.pct / max) * 100}%`, borderRadius: 999, background: 'linear-gradient(90deg, #6366f1, #a855f7)' }} />
          </span>
          <span style={{ fontFamily: 'monospace', textAlign: 'right', color: 'var(--text-muted)', fontSize: 11.5 }}>{i.pct}%</span>
        </div>
      ))}
    </div>
  );
}

function Donut({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 120, r = 46, sw = 15, C = 2 * Math.PI * r, cx = size / 2, cy = size / 2;
  let off = 0;
  const top = [...data].sort((a, b) => b.value - a.value)[0];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: 'none' }} role="img" aria-label="Errors by device">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-input)" strokeWidth={sw} />
      {total > 0 && data.map((d) => {
        const len = (d.value / total) * C; const el = (
          <circle key={d.name} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={sw}
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cy})`} />
        ); off += len; return el;
      })}
      <text x={cx} y={cy - 1} textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--text-primary)" fontFamily="monospace">{total > 0 ? `${top?.value ? Math.round((top.value / total) * 100) : 0}%` : '—'}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" letterSpacing="1" fill="var(--text-label)">{total > 0 ? String(top?.name || '').toUpperCase() : ''}</text>
    </svg>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const W = 74, H = 26, pad = 3;
  if (!values.length) return <svg width={W} height={H} style={{ flex: 'none' }} />;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const step = (W - pad * 2) / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [pad + i * step, H - pad - ((v - min) / span) * (H - pad * 2)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${H} L ${pts[0][0].toFixed(1)} ${H} Z`;
  const uid = `sp${Math.round(pts[0][1] * 100)}${values.length}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flex: 'none' }} aria-hidden="true">
      <defs><linearGradient id={uid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill={`url(#${uid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── style helpers ──────────────────────────────────────────────────────────────
function card(): React.CSSProperties { return { borderRadius: 16, border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: 20 }; }
function btnGhost(disabled: boolean): React.CSSProperties { return { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 9, padding: '6px 12px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }; }
function pagerBtn(disabled: boolean): React.CSSProperties { return { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 500, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1 }; }
const num = (v: any) => (typeof v === 'number' ? v.toLocaleString() : v ?? '—');
