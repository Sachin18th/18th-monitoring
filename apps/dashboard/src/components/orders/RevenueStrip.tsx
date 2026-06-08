'use client';

import React, { useMemo } from 'react';
import { Activity, AlertTriangle, Building2, CheckCircle2, ShoppingBag } from 'lucide-react';

export type TimeWindow = 'all' | 'today' | 'week' | 'month' | 'custom';

export interface WindowRange {
  start: number; // epoch ms (inclusive)
  end: number; // epoch ms (inclusive)
}

/**
 * Resolve a TimeWindow (+ optional custom YYYY-MM-DD bounds) to an epoch range.
 * Lifted here so the strip and the orders table compute the identical window.
 */
export function computeWindowRange(window: TimeWindow, customFrom?: string, customTo?: string): WindowRange {
  const now = Date.now();

  if (window === 'all') {
    return { start: 0, end: now };
  }

  if (window === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return { start: d.getTime(), end: now };
  }

  if (window === 'week') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0 = Sunday … 6 = Saturday
    const backToMonday = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - backToMonday);
    return { start: d.getTime(), end: now };
  }

  if (window === 'month') {
    const d = new Date();
    const first = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    return { start: first.getTime(), end: now };
  }

  // custom
  const start = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : 0;
  const end = customTo ? new Date(`${customTo}T23:59:59`).getTime() : now;
  return {
    start: Number.isFinite(start) ? start : 0,
    end: Number.isFinite(end) ? end : now,
  };
}

const OFFLINE_STATUSES = new Set(['offline', 'pos']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled']);
const PENDING_STATUSES = new Set(['placed', 'pending', 'processing']);

const isOfflineOrder = (o: any): boolean =>
  OFFLINE_STATUSES.has(String(o?.channel || '').toLowerCase()) ||
  String(o?.sourceSystem || '').toLowerCase() === 'csv' ||
  o?.metadata?.orderSource === 'offline';

const money = (amount: number, currency: string, decimals = 0): string => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount || 0);
  } catch {
    return `${(amount || 0).toFixed(decimals)} ${currency}`;
  }
};

interface RevenueStripProps {
  orders: any[]; // already windowed
  timeWindow: TimeWindow;
  onWindowChange: (w: TimeWindow) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (v: string) => void;
  onCustomTo: (v: string) => void;
  lastUpdated: Date | null;
}

const WINDOW_TABS: Array<{ key: TimeWindow; label: string }> = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom' },
];

export const RevenueStrip: React.FC<RevenueStripProps> = ({ orders, timeWindow, onWindowChange, customFrom, customTo, onCustomFrom, onCustomTo, lastUpdated }) => {
  const m = useMemo(() => {
    let total = 0, paid = 0, pending = 0, failed = 0, atRisk = 0, offline = 0;
    let nonCancelledSum = 0, nonCancelledCount = 0;
    const currencyCounts: Record<string, number> = {};

    for (const o of orders) {
      const amt = Number(o?.amount ?? o?.totalAmount ?? 0) || 0;
      const status = String(o?.status || '').toLowerCase();
      const health = String(o?.health || '').toLowerCase();
      const cur = String(o?.currency || 'USD').toUpperCase();
      currencyCounts[cur] = (currencyCounts[cur] || 0) + 1;

      total += amt;
      if (status === 'paid') paid += amt;
      else if (PENDING_STATUSES.has(status)) pending += amt;
      if (CANCELLED_STATUSES.has(status)) failed += amt;

      // AOV excludes cancelled orders.
      if (!CANCELLED_STATUSES.has(status)) { nonCancelledSum += amt; nonCancelledCount += 1; }

      // Revenue at risk: delayed or failed health.
      if (health === 'delayed' || health === 'failed') atRisk += amt;

      if (isOfflineOrder(o)) offline += amt;
    }

    const currency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'USD';
    const aov = nonCancelledCount > 0 ? nonCancelledSum / nonCancelledCount : 0;
    const other = total - offline;
    const offlinePct = total > 0 ? Math.round((offline / total) * 100) : 0;

    return { total, paid, pending, failed, atRisk, offline, other, offlinePct, aov, currency, count: orders.length };
  }, [orders]);

  const card: React.CSSProperties = { borderRadius: '12px', border: '1px solid var(--border-card)', background: 'var(--bg-page)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '104px' };
  const labelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 600 };
  const bigValue: React.CSSProperties = { fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.1 };
  const subStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--text-label)' };
  const tabBtn = (active: boolean): React.CSSProperties => ({ padding: '6px 12px', background: active ? 'var(--bg-input)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: active ? 700 : 500, color: 'var(--text-primary)' });

  return (
    <div style={{ borderRadius: '16px', border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Header: title + window selector + freshness */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-label)', fontWeight: 700 }}>Revenue Analytics</p>
          <h2 style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Revenue for the selected window</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {timeWindow === 'custom' ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => onCustomFrom(e.target.value)} style={{ borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '6px 8px', fontSize: '12px' }} aria-label="From date" />
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>→</span>
              <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => onCustomTo(e.target.value)} style={{ borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '6px 8px', fontSize: '12px' }} aria-label="To date" />
            </div>
          ) : null}
          <div style={{ display: 'inline-flex', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-input)' }}>
            {WINDOW_TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => onWindowChange(t.key)} style={tabBtn(timeWindow === t.key)}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Metric tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px' }}>
        {/* AOV */}
        <div style={card}>
          <span style={labelStyle}>Avg Order Value <ShoppingBag size={14} style={{ color: 'var(--text-label)' }} /></span>
          <span style={bigValue}>{money(m.aov, m.currency, 2)}</span>
          <span style={subStyle}>Excludes cancelled orders</span>
        </div>

        {/* Total Revenue */}
        <div style={card}>
          <span style={labelStyle}>Total Revenue <Activity size={14} style={{ color: 'var(--text-label)' }} /></span>
          <span style={bigValue}>{money(m.total, m.currency)}</span>
          <span style={subStyle}>{m.count.toLocaleString()} orders in window</span>
        </div>

        {/* Revenue by status */}
        <div style={card}>
          <span style={labelStyle}>Revenue by Status <CheckCircle2 size={14} style={{ color: 'var(--text-label)' }} /></span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '2px' }}>
            {[
              { k: 'Paid', v: m.paid, c: 'var(--success-text)' },
              { k: 'Pending', v: m.pending, c: 'var(--warning-text)' },
              { k: 'Failed', v: m.failed, c: 'var(--error-text)' },
            ].map((r) => (
              <div key={r.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: r.c, display: 'inline-block' }} />
                  {r.k}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{money(r.v, m.currency)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue at risk — alert-level signal */}
        <div style={{ ...card, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.07)' }}>
          <span style={{ ...labelStyle, color: 'var(--error-text)' }}>Revenue at Risk <AlertTriangle size={14} style={{ color: 'var(--error-text)' }} /></span>
          <span style={{ ...bigValue, color: 'var(--error-text)' }}>{money(m.atRisk, m.currency)}</span>
          <span style={subStyle}>Delayed + failed order value</span>
        </div>

        {/* Channel split */}
        <div style={card}>
          <span style={labelStyle}>Channel Split <Building2 size={14} style={{ color: 'var(--text-label)' }} /></span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Offline</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{money(m.offline, m.currency)}</span>
            </div>
            <div style={{ height: '6px', borderRadius: '999px', background: 'var(--border-card)', overflow: 'hidden' }}>
              <div style={{ width: `${m.offlinePct}%`, height: '100%', background: 'var(--text-muted)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Other channels</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{money(m.other, m.currency)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Freshness */}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        {lastUpdated ? `Metrics as of ${lastUpdated.toLocaleTimeString()}` : 'Awaiting first sync…'}
      </div>
    </div>
  );
};

export default RevenueStrip;
