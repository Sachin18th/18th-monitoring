'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../../../context/AuthContext';
import { useParams } from 'next/navigation';
import { PageRestricted } from '../../../../../components/PageRestricted';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  BarChart3, TrendingUp, Activity, CheckCircle2,
  Wifi, WifiOff, Users, ShoppingCart, Zap, AlertTriangle,
  RefreshCw, Package, DollarSign, Globe, Target, ArrowUpRight,
  Clock
} from 'lucide-react';

const TIME_PERIODS = [
  { label: '24h', value: '24h' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
  { label: 'All time', value: 'all' },
];

const PAGE: React.CSSProperties = {
  padding: '24px 28px',
  maxWidth: '1400px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '32px',
  minHeight: '100vh',
  background: 'var(--bg-page)',
  color: 'var(--text-primary)',
};

const CARD: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '22px',
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--text-muted)',
  marginBottom: '14px',
  fontWeight: 500,
};

const ROW: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 0',
  borderBottom: '1px solid var(--border-card)',
};

const EMPTY: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  color: 'var(--text-muted)',
  fontSize: '13px',
  height: '180px',
};

/* ─── helpers ────────────────────────────────────────────────── */
const fmt = (n: any, dec = 0) => {
  if (n == null || isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: dec });
};
const fmtCur = (n: any) => {
  if (n == null || isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};
const fmtPct = (n: any) => {
  if (n == null || isNaN(Number(n))) return '—';
  return `${Number(n).toFixed(1)}%`;
};

const VITAL_THRESH: Record<string, [number, number]> = {
  lcp: [2500, 4000], fid: [100, 300], cls: [0.1, 0.25], ttfb: [800, 1800],
};
const vitalColor = (key: string, val: number) => {
  const [good, poor] = VITAL_THRESH[key] ?? [0, Infinity];
  return val <= good ? '#22c55e' : val <= poor ? '#fbbf24' : '#f87171';
};
const vitalLabel = (key: string, val: number) => {
  const [good, poor] = VITAL_THRESH[key] ?? [0, Infinity];
  return val <= good ? 'Good' : val <= poor ? 'Needs Improvement' : 'Poor';
};

const formatAgo = (ts: string | null | undefined): string | null => {
  if (!ts) return null;
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
};

const CAT_STYLE: Record<string, { color: string; border: string; bg: string }> = {
  BUSINESS:    { color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)',   bg: 'rgba(34,197,94,0.08)' },
  OPERATIONAL: { color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)',  bg: 'rgba(96,165,250,0.08)' },
  EXPERIENCE:  { color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)', bg: 'rgba(167,139,250,0.08)' },
  TECHNICAL:   { color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)',  bg: 'rgba(251,191,36,0.08)' },
};
const catColor = (cat: string) => CAT_STYLE[cat]?.color ?? 'var(--text-muted)';

/* ─── badge component ────────────────────────────────────────── */
const IconBox = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: `${color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    {children}
  </div>
);

/* ─── stat row ────────────────────────────────────────────────── */
const StatRow = ({ label, value, color = 'var(--text-primary)' }: { label: string; value: string; color?: string }) => (
  <div style={ROW}>
    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
    <span style={{ fontSize: '14px', fontWeight: 600, color }}>{value}</span>
  </div>
);

/* ─── hero card ───────────────────────────────────────────────── */
const HeroCard = ({
  label, value, sub, accentColor, icon,
}: { label: string; value: string; sub: React.ReactNode; accentColor: string; icon: React.ReactNode }) => (
  <div style={{ ...CARD, padding: '20px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{label}</span>
      <IconBox color={accentColor}>{icon}</IconBox>
    </div>
    <div style={{ fontSize: '32px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
    <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>{sub}</div>
  </div>
);

/* ─── tooltip style ───────────────────────────────────────────── */
const TOOLTIP_STYLE = { background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '8px', fontSize: '12px' };
const TICK_STYLE = { fontSize: 10, fill: 'var(--text-muted)' };

/* ═══════════════════════════════════════════════════════════════ */
export default function KpiAnalyticsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { token, apiFetch } = useAuth();

  const [timeRange, setTimeRange] = useState('30d');
  const [rumDevice, setRumDevice] = useState<'all' | 'mobile' | 'desktop'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);

  /* data */
  const [kpiSummary, setKpiSummary]         = useState<any[]>([]);
  const [catalog, setCatalog]               = useState<{ available: any[]; unavailable: any[] }>({ available: [], unavailable: [] });
  const [orderSummary, setOrderSummary]     = useState<any>(null);
  const [orderTrends, setOrderTrends]       = useState<any[]>([]);
  const [custIntel, setCustIntel]           = useState<any>(null);
  const [custSummary, setCustSummary]       = useState<any>(null);
  const [perfSummary, setPerfSummary]       = useState<any>(null);
  const [digestData, setDigestData]         = useState<any>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!token || !projectId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);

    try {
      const perms = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
      const allowed = Array.isArray(perms?.allowedPageKeys) ? perms.allowedPageKeys.map((v: any) => String(v)) : [];
      setAllowedPageKeys(allowed);
      if (!allowed.includes('management/kpi')) return;

      const qs = `siteId=${projectId}&range=${timeRange}`;

      const results = await Promise.allSettled([
        apiFetch(`/api/v1/tenants/current/projects/${projectId}/kpi/summary?range=${timeRange}`, { suppressUnauthorizedRedirect: true }),
        apiFetch(`/api/v1/tenants/current/projects/${projectId}/kpi/catalog`, { suppressUnauthorizedRedirect: true }),
        apiFetch(`/api/v1/dashboard/orders/summary?${qs}`, { suppressUnauthorizedRedirect: true }),
        apiFetch(`/api/v1/dashboard/orders/trends?${qs}`, { suppressUnauthorizedRedirect: true }),
        apiFetch(`/api/v1/dashboard/customers/intelligence?${qs}`, { suppressUnauthorizedRedirect: true }),
        apiFetch(`/api/v1/dashboard/customers/summary?${qs}`, { suppressUnauthorizedRedirect: true }),
        apiFetch(`/api/v1/dashboard/performance/summary?siteId=${projectId}&range=${timeRange}`, { suppressUnauthorizedRedirect: true }),
        apiFetch(`/api/v1/dashboard/storefront/digest?${qs}`, { suppressUnauthorizedRedirect: true }),
      ]);

      const [kpiRes, catRes, ordSumRes, ordTrRes, ciRes, cSumRes, perfRes, digestRes] = results;

      // apiFetch auto-unwraps res.data.data — value IS the payload, not {data: payload}
      if (kpiRes.status === 'fulfilled')   setKpiSummary(kpiRes.value?.kpis || []);
      if (catRes.status === 'fulfilled')   setCatalog(catRes.value || { available: [], unavailable: [] });
      if (ordSumRes.status === 'fulfilled') setOrderSummary(ordSumRes.value || null);
      if (ordTrRes.status === 'fulfilled') {
        const raw = ordTrRes.value?.trends ?? ordTrRes.value ?? [];
        setOrderTrends(Array.isArray(raw) ? raw : []);
      }
      if (ciRes.status === 'fulfilled')    setCustIntel(ciRes.value || null);
      if (cSumRes.status === 'fulfilled')  setCustSummary(cSumRes.value || null);
      if (perfRes.status === 'fulfilled')    setPerfSummary(perfRes.value || null);
      if (digestRes.status === 'fulfilled') setDigestData(digestRes.value || null);

    } catch (err) {
      console.error('[KPI Engine] Failed to load analytics', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, token, apiFetch, timeRange]);

  useEffect(() => { loadData(); }, [loadData]);

  if (allowedPageKeys !== null && !allowedPageKeys.includes('management/kpi')) {
    return <PageRestricted pageKey="management/kpi" />;
  }

  /* ── derived values ─────────────────────────────────────────── */
  const revenue    = orderSummary?.totalRevenue    ?? kpiSummary.find(k => k.key === 'revenue')?.value;
  const orderCount = orderSummary?.totalOrders     ?? kpiSummary.find(k => k.key === 'order_count')?.value;
  const custCount  = custIntel?.totalProfiles      ?? custSummary?.activeUsers;
  // getPerformanceSummary returns {lcp, fid, cls, ttfb} — not {avgLcp, ...}
  const avgLcp     = perfSummary?.lcp              ?? kpiSummary.find(k => k.key === 'page_load_time')?.value;
  const delayedOrd = orderSummary?.delayedCount;
  const identPct   = custIntel?.identifiedPct      ?? custSummary?.identifiedRatio;
  const pipelineRate = kpiSummary.find(k => k.key === 'pipeline_success_rate')?.value;

  /* ── engine health — derived from real signals, not hardcoded ──
     Factors: pipeline success rate, resync failures, critical storefront errors. */
  const engineHealth = (() => {
    const pr = pipelineRate != null ? Number(pipelineRate) : null;
    const resyncFailed = digestData?.resyncFailures?.failed ?? 0;
    const criticalErrors = digestData?.storefrontErrors?.critical ?? 0;

    const reasons: string[] = [];
    if (pr != null && pr < 95) reasons.push(`Pipeline success ${pr}%`);
    if (resyncFailed > 0) reasons.push(`${resyncFailed} resync failure${resyncFailed > 1 ? 's' : ''}`);
    if (criticalErrors > 0) reasons.push(`${criticalErrors} critical error${criticalErrors > 1 ? 's' : ''}`);

    const critical = (pr != null && pr < 80) || criticalErrors > 0;
    const degraded = (pr != null && pr < 95) || resyncFailed > 0;

    if (critical) {
      return { label: 'Critical', color: '#f87171', bg: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', detail: reasons.join(' · ') };
    }
    if (degraded) {
      return { label: 'Degraded', color: '#fbbf24', bg: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', detail: reasons.join(' · ') };
    }
    return { label: 'Nominal', color: '#22c55e', bg: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', detail: 'Real-time event-driven engine' };
  })();

  // Funnel from custIntel (real storefront sessions, time-range filtered)
  const funnelStages: any[] = Array.isArray(custIntel?.funnel) ? custIntel.funnel : [];
  const purchaseStage = funnelStages.find((s: any) => s.canonical_stage === 'purchase');
  const convRate = purchaseStage?.percent;


  const vitalsSource = rumDevice === 'all'
    ? perfSummary
    : perfSummary?.byDevice?.[rumDevice];

  const lastScanAgo = formatAgo(vitalsSource?.lastScan);

  const vitals = [
    { key: 'lcp',  label: 'LCP',  desc: 'Largest Contentful Paint', value: vitalsSource?.lcp,  unit: 'ms' },
    { key: 'fid',  label: 'FID',  desc: 'First Input Delay',         value: vitalsSource?.fid,  unit: 'ms' },
    { key: 'cls',  label: 'CLS',  desc: 'Cumulative Layout Shift',   value: vitalsSource?.cls,  unit: '' },
    { key: 'ttfb', label: 'TTFB', desc: 'Time to First Byte',        value: vitalsSource?.ttfb, unit: 'ms' },
  ];

  /* ── skeleton ───────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={PAGE}>
        <div>
          <div style={{ height: '26px', width: '260px', borderRadius: '6px', background: 'var(--bg-card)', marginBottom: '10px' }} />
          <div style={{ height: '14px', width: '380px', borderRadius: '4px', background: 'var(--bg-card)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {[0,1,2,3].map(i => <div key={i} style={{ ...CARD, height: '110px', opacity: 0.5 }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {[0,1,2,3].map(i => <div key={i} style={{ ...CARD, height: '200px', opacity: 0.5 }} />)}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════ */
  return (
    <>
      <div style={PAGE}>

        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '50%', border: '1px solid var(--border-card)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart3 style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
              </div>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)' }}>KPI Governance</span>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
              KPI Analytics Engine
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', marginLeft: '10px', verticalAlign: 'middle' }} />
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Unified business, operational, and experience intelligence across all connected data sources.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {/* Time period pill tabs */}
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '8px', overflow: 'hidden' }}>
              {TIME_PERIODS.map((p, i) => (
                <button
                  key={p.value}
                  onClick={() => setTimeRange(p.value)}
                  style={{
                    padding: '7px 14px',
                    fontSize: '12px',
                    border: 'none',
                    borderRight: i < TIME_PERIODS.length - 1 ? '1px solid var(--border-card)' : 'none',
                    cursor: 'pointer',
                    background: timeRange === p.value ? 'rgba(96,165,250,0.12)' : 'transparent',
                    color: timeRange === p.value ? '#60a5fa' : 'var(--text-muted)',
                    fontWeight: timeRange === p.value ? 600 : 400,
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', fontSize: '12px', border: '1px solid var(--border-card)', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: refreshing ? 'default' : 'pointer', opacity: refreshing ? 0.7 : 1 }}
            >
              <RefreshCw style={{ width: '13px', height: '13px' }} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* ── HERO KPI CARDS ─────────────────────────────────────── */}
        <div>
          <div style={SECTION_LABEL}>Overview · {TIME_PERIODS.find(p => p.value === timeRange)?.label ?? timeRange}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <HeroCard
              label="Total Revenue"
              value={fmtCur(revenue)}
              sub={<span>from <strong>{fmt(orderCount)}</strong> orders</span>}
              accentColor="#22c55e"
              icon={<DollarSign style={{ width: '14px', height: '14px', color: '#22c55e' }} />}
            />
            <HeroCard
              label="Total Orders"
              value={fmt(orderCount)}
              sub={
                delayedOrd != null
                  ? <span style={{ color: '#fbbf24' }}>{fmt(delayedOrd)} delayed orders</span>
                  : <span>across all channels</span>
              }
              accentColor="#60a5fa"
              icon={<ShoppingCart style={{ width: '14px', height: '14px', color: '#60a5fa' }} />}
            />
            <HeroCard
              label="Total Customers"
              value={fmt(custCount)}
              sub={
                identPct != null
                  ? <span style={{ color: '#a78bfa' }}>{fmtPct(identPct)} identified</span>
                  : <span>unique profiles</span>
              }
              accentColor="#a78bfa"
              icon={<Users style={{ width: '14px', height: '14px', color: '#a78bfa' }} />}
            />
            <HeroCard
              label="Avg Page Load"
              value={avgLcp != null ? `${Math.round(Number(avgLcp))}ms` : '—'}
              sub={
                avgLcp != null
                  ? <span style={{ color: vitalColor('lcp', Number(avgLcp)) }}>● {vitalLabel('lcp', Number(avgLcp))}</span>
                  : <span>LCP signal</span>
              }
              accentColor="#fbbf24"
              icon={<Zap style={{ width: '14px', height: '14px', color: '#fbbf24' }} />}
            />
          </div>
        </div>

        {/* ── OPERATIONAL SIGNALS STRIP ───────────────────────────── */}
        {kpiSummary.length > 0 && (
          <div style={{ ...CARD, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: engineHealth.color }} />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>KPI Engine</span>
              <span style={{ fontSize: '11px', color: engineHealth.color, fontWeight: 500 }}>{engineHealth.label}</span>
            </div>
            {kpiSummary.map(kpi => (
              <div key={kpi.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp style={{ width: '12px', height: '12px', color: catColor(kpi.category), flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{kpi.name}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {kpi.key === 'revenue' ? fmtCur(kpi.value)
                    : kpi.key === 'page_load_time' ? `${Math.round(Number(kpi.value))}ms`
                    : kpi.key === 'pipeline_success_rate' ? `${kpi.value}%`
                    : fmt(kpi.value)}
                </span>
                {kpi.freshnessStatus === 'live'
                  ? <Wifi style={{ width: '10px', height: '10px', color: '#22c55e' }} />
                  : <WifiOff style={{ width: '10px', height: '10px', color: '#94a3b8' }} />}
              </div>
            ))}
          </div>
        )}

        {/* ── ORDERS & REVENUE ───────────────────────────────────── */}
        <div>
          <div style={SECTION_LABEL}>Orders & Revenue</div>
          <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px' }}>

            {/* Stats column */}
            <div style={CARD}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Package style={{ width: '13px', height: '13px', color: '#60a5fa' }} /> Order Summary
              </div>
              {orderSummary ? (
                <>
                  <StatRow label="Total Orders"        value={fmt(orderSummary.totalOrders)}        color="#60a5fa" />
                  <StatRow label="Total Revenue"       value={fmtCur(orderSummary.totalRevenue)}    color="#22c55e" />
                  <StatRow label="Avg Order Value"     value={fmtCur(orderSummary.averageOrderValue)} color="#a78bfa" />
                  <StatRow label="Orders This Hour"    value={fmt(orderSummary.ordersThisHour)}     color="var(--text-secondary)" />
                  <StatRow label="Delayed Orders"      value={fmt(orderSummary.delayedCount)}       color="#fbbf24" />
                  {orderSummary.failedCount > 0 && (
                    <StatRow label="Failed / Cancelled" value={fmt(orderSummary.failedCount)} color="#f87171" />
                  )}
                  <div style={{ ...ROW, borderBottom: 'none' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Revenue at Risk</span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#f87171' }}>{fmtCur(orderSummary.revenueAtRisk)}</span>
                  </div>
                </>
              ) : (
                <div style={EMPTY}>
                  <ShoppingCart style={{ width: '22px', height: '22px', opacity: 0.35 }} />
                  <span>No order data. Sync a store integration.</span>
                </div>
              )}
            </div>

            {/* Trends chart */}
            <div style={CARD}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <TrendingUp style={{ width: '13px', height: '13px', color: '#22c55e' }} /> Order Volume & Revenue Trend
              </div>
              {orderTrends.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={orderTrends} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <defs>
                        <linearGradient id="gOrders" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="timestamp" tick={TICK_STYLE} tickLine={false} axisLine={false}
                        tickFormatter={(v: string) => v.length === 10 ? v.slice(5) : v} />
                      <YAxis yAxisId="left"  tick={TICK_STYLE} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" tick={TICK_STYLE} tickLine={false} axisLine={false}
                        tickFormatter={(v: number) => `₹${v}`} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: 'var(--text-secondary)' }}
                        formatter={(v: any, name: string) => name === 'Revenue (₹)' ? [`₹${Number(v).toLocaleString('en-IN')}`, name] : [v, name]} />
                      <Area yAxisId="left"  type="monotone" dataKey="orders"  stroke="#60a5fa" fill="url(#gOrders)"  strokeWidth={2} dot={false} name="Orders" />
                      <Area yAxisId="right" type="monotone" dataKey="revenue" stroke="#22c55e" fill="url(#gRevenue)" strokeWidth={2} dot={false} name="Revenue (₹)" />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', gap: '18px', marginTop: '10px' }}>
                    {[{ color: '#60a5fa', label: 'Orders' }, { color: '#22c55e', label: 'Revenue (₹)' }].map(l => (
                      <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '10px', height: '3px', borderRadius: '2px', background: l.color, display: 'inline-block' }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={EMPTY}>
                  <Activity style={{ width: '22px', height: '22px', opacity: 0.35 }} />
                  <span>No trend data available for this period</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── CUSTOMER INTELLIGENCE ──────────────────────────────── */}
        <div>
          <div style={SECTION_LABEL}>Customer Intelligence</div>
          <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px' }}>

            {/* Customer stats — sourced from synced admin/connector data */}
            <div style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Users style={{ width: '13px', height: '13px', color: '#a78bfa' }} /> Customer Summary
                </div>
                <span style={{ fontSize: '10px', color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: '999px', padding: '2px 8px', whiteSpace: 'nowrap' }}>
                  Platform sync
                </span>
              </div>
              {custIntel ? (
                <>
                  <StatRow label="Total Customers"          value={fmt(custIntel.totalProfiles)} color="#a78bfa" />
                  <StatRow label="Identified (email known)" value={fmt(custIntel.identifiedCount)} color="#60a5fa" />
                  <StatRow label="Identified %"             value={fmtPct(identPct)} color="#60a5fa" />
                  <StatRow label="Anonymous Profiles"       value={fmt(Math.max(0, (custIntel.totalProfiles ?? 0) - (custIntel.identifiedCount ?? 0)))} color="var(--text-secondary)" />
                  
                  <StatRow label="Repeated Buyers"          value={custIntel.repeatedBuyers != null ? fmt(custIntel.repeatedBuyers) : '—'} color="#fbbf24" />
                  <div style={{ ...ROW, borderBottom: 'none' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Repeat Buy Rate</span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: custIntel.repeatBuyerRate != null ? '#fbbf24' : 'var(--text-muted)' }}>
                      {custIntel.repeatBuyerRate != null ? `${custIntel.repeatBuyerRate}%` : '—'}
                    </span>
                  </div>
                </>
              ) : (
                <div style={EMPTY}>
                  <Users style={{ width: '22px', height: '22px', opacity: 0.35 }} />
                  <span>No customer data available. Sync a store.</span>
                </div>
              )}
            </div>

            {/* Journey funnel — sourced from storefront tracker (JS script) */}
            <div style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Target style={{ width: '13px', height: '13px', color: '#60a5fa' }} /> Purchase Journey Funnel
                </div>
                <span style={{ fontSize: '10px', color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: '999px', padding: '2px 8px', whiteSpace: 'nowrap' }}>
                  Storefront tracker
                </span>
              </div>
              {funnelStages.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {funnelStages.map((stage: any, i: number) => {
                    const colors = ['#60a5fa', '#a78bfa', '#22c55e', '#fbbf24', '#f87171'];
                    const c = colors[i % colors.length];
                    const prev = i > 0 ? funnelStages[i - 1] : null;
                    const dropOff = prev ? Math.round(100 - stage.percent) : null;
                    return (
                      <div key={stage.canonical_stage ?? stage.stage ?? i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>{stage.stage}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fmt(stage.count)} sessions</span>
                            {dropOff !== null && dropOff > 0 && (
                              <span style={{ fontSize: '11px', color: '#f87171' }}>↓{dropOff}%</span>
                            )}
                            <span style={{ fontSize: '13px', fontWeight: 600, color: c, minWidth: '42px', textAlign: 'right' }}>{fmtPct(stage.percent)}</span>
                          </div>
                        </div>
                        <div style={{ height: '7px', borderRadius: '999px', background: 'var(--bg-input)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(stage.percent, 100)}%`, background: c, borderRadius: '999px', transition: 'width 0.6s ease' }} />
                        </div>
                      </div>
                    );
                  })}

                  {/* Tracker session intelligence metrics */}
                  <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[
                      { label: 'Cart Abandonment',     value: fmtPct(custIntel?.sessionIntelligence?.cart_abandonment_rate),     color: '#fbbf24' },
                      { label: 'Checkout Abandonment', value: fmtPct(custIntel?.sessionIntelligence?.checkout_abandonment_rate), color: '#f87171' },
                    ].map(m => (
                      <div key={m.label} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>{m.label}</div>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: m.color }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  {convRate != null && convRate > 0 && (
                    <div style={{ padding: '12px 16px', background: 'rgba(34,197,94,0.06)', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>End-to-end Conversion Rate</span>
                      <span style={{ fontSize: '18px', fontWeight: 700, color: '#22c55e' }}>{fmtPct(convRate)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={EMPTY}>
                  <Globe style={{ width: '22px', height: '22px', opacity: 0.35 }} />
                  <span>No tracker data for this period. Install the storefront script.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── ERROR & RESYNC HEALTH ──────────────────────────────── */}
        <div>
          <div style={SECTION_LABEL}>Error & Resync Health · {TIME_PERIODS.find(p => p.value === timeRange)?.label ?? timeRange}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

            {/* Storefront Errors */}
            <div style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <AlertTriangle style={{ width: '13px', height: '13px', color: '#f87171' }} /> Storefront Errors
                </div>
                {digestData?.storefrontErrors != null && (
                  <span style={{ fontSize: '10px', color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: '999px', padding: '2px 8px' }}>
                    {digestData.storefrontErrors.total} total
                  </span>
                )}
              </div>

              {!digestData ? (
                <div style={EMPTY}>
                  <Activity style={{ width: '22px', height: '22px', opacity: 0.35 }} />
                  <span>Loading error data…</span>
                </div>
              ) : digestData.storefrontErrors.total === 0 ? (
                <div style={EMPTY}>
                  <CheckCircle2 style={{ width: '22px', height: '22px', color: '#22c55e', opacity: 0.7 }} />
                  <span style={{ color: '#22c55e' }}>No storefront errors in this period</span>
                </div>
              ) : (
                <>
                  {/* Critical vs total highlight */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    {[
                      { label: 'Total Errors',    value: digestData.storefrontErrors.total,    color: '#f87171' },
                      { label: 'Critical',         value: digestData.storefrontErrors.critical,  color: '#ef4444' },
                    ].map(m => (
                      <div key={m.label} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>{m.label}</div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: m.color }}>{fmt(m.value)}</div>
                      </div>
                    ))}
                  </div>

                  {/* All error types */}
                  {digestData.storefrontErrors.byType.map((e: any) => (
                    <div key={e.type} style={ROW}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{e.type}</span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#f87171' }}>{fmt(e.count)}</span>
                    </div>
                  ))}

                  {/* All recent errors */}
                  {digestData.storefrontErrors.recent.length > 0 && (
                    <div style={{ marginTop: '14px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Recent Errors ({digestData.storefrontErrors.recent.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
                        {digestData.storefrontErrors.recent.map((err: any, i: number) => (
                          <div key={i} style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontSize: '10px', color: '#f87171', fontFamily: 'monospace' }}>{err.type}</span>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>{formatAgo(err.occurredAt)}</span>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {err.message}
                            </div>
                            {err.pageType && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>{err.pageType}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Integration Resync Status */}
            <div style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <RefreshCw style={{ width: '13px', height: '13px', color: '#60a5fa' }} /> Integration Resync
                </div>
                {digestData?.resyncFailures != null && digestData.resyncFailures.total > 0 && (
                  <span style={{ fontSize: '10px', color: digestData.resyncFailures.failed > 0 ? '#f87171' : '#22c55e', background: digestData.resyncFailures.failed > 0 ? 'rgba(248,113,113,0.1)' : 'rgba(34,197,94,0.1)', border: `1px solid ${digestData.resyncFailures.failed > 0 ? 'rgba(248,113,113,0.25)' : 'rgba(34,197,94,0.25)'}`, borderRadius: '999px', padding: '2px 8px' }}>
                    {digestData.resyncFailures.failed > 0 ? `${digestData.resyncFailures.failed} failed` : 'All passing'}
                  </span>
                )}
              </div>

              {!digestData ? (
                <div style={EMPTY}>
                  <Activity style={{ width: '22px', height: '22px', opacity: 0.35 }} />
                  <span>Loading resync data…</span>
                </div>
              ) : digestData.resyncFailures.total === 0 ? (
                <div style={EMPTY}>
                  <RefreshCw style={{ width: '22px', height: '22px', opacity: 0.35 }} />
                  <span>No resync jobs in this period</span>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
                    {[
                      { label: 'Total Jobs',  value: fmt(digestData.resyncFailures.total),  color: 'var(--text-primary)' },
                      { label: 'Failed',       value: fmt(digestData.resyncFailures.failed), color: digestData.resyncFailures.failed > 0 ? '#f87171' : '#22c55e' },
                      { label: 'Success Rate', value: digestData.resyncFailures.successRate != null ? `${digestData.resyncFailures.successRate}%` : '—', color: (digestData.resyncFailures.successRate ?? 100) >= 95 ? '#22c55e' : (digestData.resyncFailures.successRate ?? 100) >= 80 ? '#fbbf24' : '#f87171' },
                    ].map(m => (
                      <div key={m.label} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>{m.label}</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: m.color }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  {digestData.resyncFailures.recentFailed.length > 0 ? (
                    <>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Recent Failures ({digestData.resyncFailures.recentFailed.length})
                      </div>
                      <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                        {digestData.resyncFailures.recentFailed.map((j: any) => {
                          const errMsg = typeof j.error === 'object' && j.error !== null
                            ? (j.error as any).message || JSON.stringify(j.error).slice(0, 80)
                            : String(j.error || 'Unknown error').slice(0, 80);
                          return (
                            <div key={j.jobId} style={{ ...ROW, flexDirection: 'column', alignItems: 'flex-start', gap: '2px', padding: '8px 0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{j.connectorInstanceId.slice(0, 8)}…</span>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>{formatAgo(j.initiatedAt)}</span>
                              </div>
                              <span style={{ fontSize: '11px', color: '#f87171', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{errMsg}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : digestData.resyncFailures.failed === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 16px', borderRadius: '10px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                      <CheckCircle2 style={{ width: '14px', height: '14px', color: '#22c55e' }} />
                      <span style={{ fontSize: '12px', color: '#22c55e' }}>All resync jobs completed successfully.</span>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── PERFORMANCE & SYSTEM HEALTH ────────────────────────── */}
        <div>
          <div style={SECTION_LABEL}>Platform Performance & System Health</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

            {/* Core Web Vitals — PageSpeed API */}
            <div style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Zap style={{ width: '13px', height: '13px', color: '#fbbf24' }} /> Core Web Vitals (PageSpeed API)
                </div>
                <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-card)' }}>
                  {(['all', 'mobile', 'desktop'] as const).map((d, i) => (
                    <button key={d} onClick={() => setRumDevice(d)} style={{
                      padding: '4px 11px', fontSize: '11px', border: 'none',
                      borderRight: i < 2 ? '1px solid var(--border-card)' : 'none',
                      cursor: 'pointer', textTransform: 'capitalize',
                      background: rumDevice === d ? 'rgba(251,191,36,0.12)' : 'transparent',
                      color: rumDevice === d ? '#fbbf24' : 'var(--text-muted)',
                      fontWeight: rumDevice === d ? 600 : 400,
                    }}>
                      {d === 'all' ? 'All' : d === 'mobile' ? 'Mobile' : 'Desktop'}
                    </button>
                  ))}
                </div>
              </div>
              {!perfSummary ? (
                <div style={EMPTY}>
                  <Activity style={{ width: '22px', height: '22px', opacity: 0.35 }} />
                  <span>No PageSpeed data yet. Trigger a scan to populate.</span>
                </div>
              ) : vitals.every(m => m.value == null) ? (
                <div style={EMPTY}>
                  <Activity style={{ width: '22px', height: '22px', opacity: 0.35 }} />
                  <span>No PageSpeed scan found for the selected period.</span>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {vitals.map(m => {
                    const v   = Number(m.value);
                    const clr = m.value != null ? vitalColor(m.key, v) : 'var(--text-muted)';
                    const lbl = m.value != null ? vitalLabel(m.key, v) : 'No data';
                    return (
                      <div key={m.key} style={{ padding: '14px', borderRadius: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>{m.desc}</div>
                        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-label)', marginBottom: '4px' }}>{m.label}</div>
                        <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
                          {m.value != null ? `${m.key === 'cls' ? v.toFixed(2) : Math.round(v)}${m.unit}` : '—'}
                        </div>
                        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: clr, flexShrink: 0 }} />
                          <span style={{ fontSize: '11px', color: clr }}>{lbl}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {perfSummary != null && (
                <div style={{ marginTop: '14px', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <Clock style={{ width: '11px', height: '11px', flexShrink: 0 }} />
                  {lastScanAgo
                    ? <span>Last scanned <strong style={{ color: 'var(--text-secondary)' }}>{lastScanAgo}</strong></span>
                    : <span>No scan in this period</span>
                  }
                  {rumDevice !== 'all' && <span style={{ color: '#fbbf24' }}>· {rumDevice}</span>}
                  <span>· Google PageSpeed API</span>
                </div>
              )}
            </div>

            {/* System Health */}
            <div style={CARD}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <AlertTriangle style={{ width: '13px', height: '13px', color: '#f87171' }} /> KPI System Health
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {/* Engine status — derived from pipeline rate, resync failures, critical errors */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: '10px', background: engineHealth.bg, border: engineHealth.border }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>KPI Computation Engine</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{engineHealth.detail}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: engineHealth.color }} />
                    <span style={{ fontSize: '12px', color: engineHealth.color, fontWeight: 500 }}>{engineHealth.label}</span>
                  </div>
                </div>

                {/* KPI coverage */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>KPI Coverage</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Active registered signals</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '22px', fontWeight: 600, color: '#60a5fa' }}>{catalog.available.length}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>available</div>
                  </div>
                </div>

                {/* Pipeline Success Rate */}
                {pipelineRate != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>Pipeline Success Rate</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Connector sync health</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '22px', fontWeight: 600, color: Number(pipelineRate) >= 95 ? '#22c55e' : Number(pipelineRate) >= 80 ? '#fbbf24' : '#f87171' }}>{pipelineRate}%</div>
                    </div>
                  </div>
                )}

                {/* Coverage status */}
                {catalog.unavailable.length > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: '10px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 500, color: '#fbbf24' }}>Coverage Gaps</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>KPIs awaiting data sources</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '22px', fontWeight: 600, color: '#fbbf24' }}>{catalog.unavailable.length}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>gaps</div>
                    </div>
                  </div>
                ) : catalog.available.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 16px', borderRadius: '10px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                    <CheckCircle2 style={{ width: '15px', height: '15px', color: '#22c55e' }} />
                    <span style={{ fontSize: '12px', color: '#22c55e' }}>Full KPI coverage — all signals active.</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Fixed live status pill */}
      <div style={{ position: 'fixed', bottom: '20px', left: '24px', zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border-input)', borderRadius: '999px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: engineHealth.color, flexShrink: 0 }} />
        KPI Engine · System {engineHealth.label.toLowerCase()}

      </div>
    </>
  );
}
