'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoneyCompact, formatMoneyFull } from '@/lib/format-money';

/**
 * CustomerInsights — the analytics half of the unified Customers page (ported from
 * the legacy Customers "Intelligence Lab"): KPI band, acquisition + revenue trend,
 * segmentation, lifecycle, engagement, and repeat-customers ranking. Self-contained
 * and lazy-loaded (only mounts when the "Insights" sub-view is opened) so it doesn't
 * slow the default list.
 *
 * Segment/fused distributions come from the scalable /storefront/segments endpoint;
 * the rest is computed from the full customer + order lists (as the legacy page did).
 */
export default function CustomerInsights({ projectId, connectorInstanceId, apiFetch }: { projectId: string; connectorInstanceId: string | null; apiFetch: any }) {
  const [customers, setCustomers] = useState<any[] | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [segments, setSegments] = useState<{ base: any[]; fused: any[] }>({ base: [], fused: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const segQs = new URLSearchParams({ projectId: String(projectId), ...(connectorInstanceId ? { connectorInstanceId: String(connectorInstanceId) } : {}) });
      const [listRes, ordersRes, segRes] = await Promise.all([
        apiFetch(`/api/v1/dashboard/customers/list?siteId=${projectId}&limit=100000&offset=0`, { suppressUnauthorizedRedirect: true }).catch(() => []),
        apiFetch(`/api/v1/dashboard/orders/list?siteId=${projectId}&limit=100000&offset=0`, { suppressUnauthorizedRedirect: true }).catch(() => []),
        apiFetch(`/api/storefront/segments?${segQs.toString()}`, { suppressUnauthorizedRedirect: true }).catch(() => null),
      ]);
      const list = Array.isArray(listRes) ? listRes : Array.isArray(listRes?.customers) ? listRes.customers : [];
      const ords = Array.isArray(ordersRes) ? ordersRes : Array.isArray(ordersRes?.orders) ? ordersRes.orders : [];
      setCustomers(connectorInstanceId ? list.filter((c: any) => matchesConnector(c, connectorInstanceId)) : list);
      setOrders(connectorInstanceId ? ords.filter((o: any) => matchesConnector(o, connectorInstanceId)) : ords);
      setSegments({ base: segRes?.base || [], fused: segRes?.fused || [] });
    } finally { setLoading(false); }
  }, [apiFetch, projectId, connectorInstanceId]);

  useEffect(() => { load(); }, [load]);

  const ins = useMemo(() => buildInsights(customers || [], orders), [customers, orders]);
  const currency = ins.currency;
  const money = (n: number) => formatMoneyCompact(n, currency);

  if (loading && customers === null) {
    return <div style={{ display: 'flex', height: 200, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading insights…</div>;
  }

  const FUSED_LABEL: Record<string, string> = { HIGH_VALUE_ABANDONER: 'High-value abandoner', CART_ABANDONER: 'Cart abandoner', LAPSED_REACTIVATING: 'Lapsed reactivating', NEW_HIGH_INTENT: 'New high intent', LOYAL_ACTIVE: 'Loyal active' };
  const FUSED_COLOR: Record<string, string> = { HIGH_VALUE_ABANDONER: '#ef4444', CART_ABANDONER: '#f97316', LAPSED_REACTIVATING: '#f59e0b', NEW_HIGH_INTENT: '#22d3ee', LOYAL_ACTIVE: '#22c55e' };
  const SEG_COLOR: Record<string, string> = { VIP: '#a855f7', HIGH_VALUE: '#22c55e', REGULAR: '#64748b', AT_RISK: '#f59e0b', LOST: '#ef4444' };
  const baseMax = Math.max(1, ...segments.base.map((s: any) => s.count));
  const fusedMax = Math.max(1, ...segments.fused.map((s: any) => s.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPI band */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <Kpi label="Customers" value={ins.total.toLocaleString()} />
        <Kpi label="Identified" value={`${ins.identifiedPct}%`} sub={`${ins.identified.toLocaleString()} have an email`} />
        <Kpi label="Repeat buyers" value={ins.repeatBuyers.toLocaleString()} sub={`${ins.repeatRate}% of ${ins.buyers.toLocaleString()} buyers`} />
        <Kpi label="Total lifetime value" value={money(ins.totalLtv)} sub={`Avg ${money(ins.avgLtv)} / customer`} />
        <Kpi label="New (30d)" value={ins.newLast30.toLocaleString()} />
      </div>

      {/* Acquisition & revenue trend */}
      <Card title="Customer acquisition & revenue" note="New customers (bars) · net revenue (line), monthly">
        {ins.trend.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={ins.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis yAxisId="l" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={40} />
              <YAxis yAxisId="r" orientation="right" tickFormatter={money} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={58} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' }}
                formatter={(v: number, n: string) => (n === 'revenue' ? [formatMoneyFull(v, currency), 'Revenue'] : [v, 'New customers'])} />
              <Bar yAxisId="l" dataKey="newCustomers" fill="#818cf8" radius={[3, 3, 0, 0]} maxBarSize={30} />
              <Line yAxisId="r" type="monotone" dataKey="revenue" stroke="#22d3ee" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="ci-two">
        <Card title="Behavioral segmentation" note="customers by segment (history)">
          <BarList items={segments.base.map((s: any) => ({ label: pretty(s.segment), value: s.count, color: SEG_COLOR[s.segment] || '#64748b', max: baseMax }))} />
        </Card>
        <Card title="Live × history segments" note="fused segments (live behavior + history)">
          {segments.fused.filter((s: any) => s.count > 0).length === 0 ? <Empty text="No fused segments yet." /> :
            <BarList items={segments.fused.filter((s: any) => s.count > 0).map((s: any) => ({ label: FUSED_LABEL[s.segment] || s.segment, value: s.count, color: FUSED_COLOR[s.segment] || '#22d3ee', max: fusedMax }))} />}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="ci-two">
        <Card title="Lifecycle" note="where customers sit in their lifecycle">
          <BarList items={ins.lifecycle.map((l) => ({ label: pretty(l.name), value: l.count, color: '#0ea5e9', max: Math.max(1, ...ins.lifecycle.map((x) => x.count)) }))} />
        </Card>
        <Card title="Engagement" note="recency of last activity">
          <BarList items={ins.engagement.map((e) => ({ label: e.name, value: e.count, color: e.color, max: Math.max(1, ...ins.engagement.map((x) => x.count)) }))} />
        </Card>
      </div>

      <Card title="Repeat customers" note="most orders · total spend">
        {ins.repeat.length === 0 ? <Empty text="No repeat buyers yet." /> : (
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12.5 }}>
            <tbody>
              {ins.repeat.map((r, i) => (
                <tr key={r.name + i}>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-card)', width: 26 }}><span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 7, background: 'var(--bg-input)', color: '#818cf8', fontWeight: 800, fontFamily: 'monospace', fontSize: 11 }}>{i + 1}</span></td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-card)', fontWeight: 650 }}>{r.name}</td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-card)', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.orders} orders</td>
                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-card)', textAlign: 'right', fontFamily: 'monospace', fontWeight: 650 }}>{money(r.ltv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <style>{`@media(max-width:900px){.ci-two{grid-template-columns:1fr !important}}`}</style>
    </div>
  );
}

// ── compute (lean port of buildCustomerInsights) ────────────────────────────────
function buildInsights(customers: any[], orders: any[]) {
  const now = Date.now();
  const D = 86_400_000;
  const total = customers.length;

  const curCount: Record<string, number> = {};
  const trend = new Map<string, { key: string; label: string; newCustomers: number; revenue: number }>();
  const bucket = (v: any) => {
    if (!v) return undefined; const d = new Date(v); if (isNaN(d.getTime())) return undefined;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let b = trend.get(key); if (!b) { b = { key, label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), newCustomers: 0, revenue: 0 }; trend.set(key, b); } return b;
  };
  for (const o of orders) {
    const amt = Number(o?.totalAmount ?? o?.metadata?.totalAmount ?? o?.metadata?.amount ?? 0);
    const cur = String(o?.currency || o?.metadata?.currency || '').trim().toUpperCase(); if (cur) curCount[cur] = (curCount[cur] || 0) + 1;
    const b = bucket(o?.placedAt || o?.createdAt || o?.metadata?.placedAt); if (b && Number.isFinite(amt)) b.revenue += amt;
  }

  let identified = 0, buyers = 0, repeatBuyers = 0, totalLtv = 0, newLast30 = 0;
  const lifecycle: Record<string, number> = {};
  const eng = { Active: 0, Warm: 0, 'At risk': 0, Dormant: 0 };
  const repeatRows: { name: string; orders: number; ltv: number }[] = [];
  for (const c of customers) {
    const email = custEmail(c); if (email) identified += 1;
    const oc = orderCount(c);
    if (oc > 0) buyers += 1; if (oc > 1) repeatBuyers += 1;
    const ltv = Number(c?.totalLtv || 0) || 0; totalLtv += ltv;
    lifecycle[String(c?.lifecycleState || 'NEW_GUEST')] = (lifecycle[String(c?.lifecycleState || 'NEW_GUEST')] || 0) + 1;
    const first = c?.firstSeenAt || c?.metadata?.createdAt;
    if (first) { const t = new Date(first).getTime(); if (Number.isFinite(t) && now - t <= 30 * D) newLast30 += 1; const b = bucket(first); if (b) b.newCustomers += 1; }
    const last = c?.lastSeenAt || c?.metadata?.lastSeenAt || c?.metadata?.updatedAt;
    if (last) { const age = now - new Date(last).getTime(); if (Number.isFinite(age)) { if (age <= 7 * D) eng.Active++; else if (age <= 30 * D) eng.Warm++; else if (age <= 90 * D) eng['At risk']++; else eng.Dormant++; } }
    if (oc > 1) repeatRows.push({ name: displayName(c, email), orders: oc, ltv });
  }

  const trendArr = [...trend.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).slice(-12).map(({ label, newCustomers, revenue }) => ({ label, newCustomers, revenue: Math.round(revenue) }));
  const currency = Object.entries(curCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'USD';
  const engColor: Record<string, string> = { Active: '#22c55e', Warm: '#0ea5e9', 'At risk': '#f59e0b', Dormant: '#64748b' };
  return {
    total, identified, identifiedPct: total ? Math.round((identified / total) * 100) : 0,
    buyers, repeatBuyers, repeatRate: buyers ? Math.round((repeatBuyers / buyers) * 100) : 0,
    totalLtv, avgLtv: total ? totalLtv / total : 0, newLast30, currency,
    trend: trendArr,
    lifecycle: Object.entries(lifecycle).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    engagement: (['Active', 'Warm', 'At risk', 'Dormant'] as const).map((name) => ({ name, count: (eng as any)[name], color: engColor[name] })),
    repeat: repeatRows.sort((a, b) => b.orders - a.orders || b.ltv - a.ltv).slice(0, 8),
  };
}

const custEmail = (c: any) => String(c?.email || c?.metadata?.email || c?.metadata?.rawCustomer?.email || '').trim().toLowerCase() || null;
const orderCount = (c: any) => Number(c?.orderCount ?? c?.ordersCount ?? c?.metadata?.rawCustomer?.orders_count ?? c?.metadata?.ordersCount ?? 0) || 0;
function displayName(c: any, email: string | null) {
  const meta = c?.metadata || {};
  const n = [meta.firstName || meta.rawCustomer?.first_name, meta.lastName || meta.rawCustomer?.last_name].filter(Boolean).join(' ').trim();
  return n || (email ? email.split('@')[0] : (c?.id ? String(c.id).slice(0, 8) : 'Unknown'));
}
function matchesConnector(row: any, cid: string) {
  return row?.connectorInstanceId === cid || row?.metadata?.connectorInstanceId === cid || !row?.connectorInstanceId;
}
const pretty = (s: string) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

// ── small UI bits ────────────────────────────────────────────────────────────
function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 14, border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '16px 18px' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
      {note && <div style={{ fontSize: 11.5, color: 'var(--text-label)', margin: '3px 0 12px' }}>{note}</div>}
      {children}
    </div>
  );
}
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ borderRadius: 14, border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11, color: 'var(--text-label)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 23, fontWeight: 680, letterSpacing: '-.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: 'var(--text-label)' }}>{sub}</span>}
    </div>
  );
}
function BarList({ items }: { items: { label: string; value: number; color: string; max: number }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((i) => (
        <div key={i.label} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 54px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.label}</span>
          <span style={{ height: 8, borderRadius: 999, background: 'var(--bg-input)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(i.value / i.max) * 100}%`, background: i.color, borderRadius: 999 }} /></span>
          <span style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{i.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
const Empty = ({ text = 'No data yet.' }: { text?: string }) => <div style={{ fontSize: 12.5, color: 'var(--text-label)', padding: '8px 0' }}>{text}</div>;
