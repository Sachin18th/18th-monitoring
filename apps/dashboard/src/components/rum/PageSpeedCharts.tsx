'use client';

import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// Comparison charts for the page-wise PageSpeed breakdown. Reads the SAME cached
// page-type payload the metric cards use (no extra API calls), so the charts and the
// cards can never disagree. There is no historical series stored for PSI metrics
// (the performance table keeps only the latest value per source), so the X-axis is
// the page type (in funnel order Home → PLP → PDP → Checkout), not time — each line
// shows how a metric moves across page types for mobile vs desktop.

type MetricStatus = 'good' | 'needs-improvement' | 'poor';
type PageMetric = { value: number; unit: string; status: MetricStatus; timestamp?: string | null } | null;
type PageResult = {
  pageType: string;
  available: boolean;
  isCartPage?: boolean;
  score: number | null;
  scoreStatus: MetricStatus | null;
  metrics: { lcp: PageMetric; tbt: PageMetric; cls: PageMetric; ttfb: PageMetric };
};
type PageType = 'homepage' | 'pdp' | 'plp' | 'checkout';
type PagesResponse = Record<PageType, PageResult>;

// Same display order as the stacked detail sections below the charts.
const PAGE_ORDER: Array<{ key: PageType; short: string }> = [
  { key: 'homepage', short: 'Home' },
  { key: 'plp', short: 'PLP' },
  { key: 'pdp', short: 'PDP' },
  { key: 'checkout', short: 'Checkout' },
];

type VitalKey = 'lcp' | 'tbt' | 'cls' | 'ttfb';
const VITALS: Array<{
  key: VitalKey;
  label: string;
  unit: string;
  // Convert the stored value (ms / raw CLS) into the displayed magnitude.
  toDisplay: (raw: number) => number;
  // Axis/tooltip tick formatting of the displayed magnitude.
  fmt: (display: number) => string;
  // "Good" PSI threshold, in display units — drawn as a reference line.
  goodThreshold: number;
}> = [
  { key: 'lcp', label: 'LCP (Largest Contentful Paint)', unit: 's', toDisplay: (v) => v / 1000, fmt: (v) => v.toFixed(2), goodThreshold: 2.5 },
  { key: 'tbt', label: 'TBT (Total Blocking Time)', unit: 'ms', toDisplay: (v) => v, fmt: (v) => `${Math.round(v)}`, goodThreshold: 200 },
  { key: 'cls', label: 'CLS (Cumulative Layout Shift)', unit: '', toDisplay: (v) => v, fmt: (v) => v.toFixed(2), goodThreshold: 0.1 },
  { key: 'ttfb', label: 'TTFB (Time to First Byte)', unit: 'ms', toDisplay: (v) => v, fmt: (v) => `${Math.round(v)}`, goodThreshold: 800 },
];

const MOBILE_COLOR = '#6366f1';
const DESKTOP_COLOR = '#a855f7';
const THRESHOLD_COLOR = '#22c55e';

const tooltipContentStyle: React.CSSProperties = {
  backgroundColor: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '8px',
};

const axisTick = { fill: 'var(--text-muted)', fontSize: 11 };

const pageLabel = (key: PageType, short: string, data: PagesResponse | null): string => {
  // Shopify measures the cart in place of the hosted checkout — title it "Cart".
  if (key === 'checkout' && data?.checkout?.isCartPage) return 'Cart';
  return short;
};

const metricValue = (data: PagesResponse | null, key: PageType, vital: VitalKey): number | null => {
  const m = data?.[key]?.metrics?.[vital] ?? null;
  return m && Number.isFinite(Number(m.value)) ? Number(m.value) : null;
};

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: '14px', border: '1px solid var(--border-card)', background: 'var(--bg-page)', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</p>
        {subtitle ? <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

const seriesName = (key: string) => (key === 'mobile' ? 'Mobile' : 'Desktop');

export default function PageSpeedCharts({
  pageData,
  loading,
}: {
  pageData: Record<'mobile' | 'desktop', PagesResponse | null>;
  loading?: boolean;
}) {
  const anyData = pageData.mobile || pageData.desktop;

  // Performance score (0–100): one point per page type, a line each for mobile/desktop.
  const scoreData = useMemo(
    () =>
      PAGE_ORDER.map(({ key, short }) => ({
        page: pageLabel(key, short, anyData),
        mobile: pageData.mobile?.[key]?.score ?? null,
        desktop: pageData.desktop?.[key]?.score ?? null,
      })),
    [pageData, anyData],
  );

  // Per-vital lines across page types — mobile vs desktop, in display units.
  const vitalsData = useMemo(
    () =>
      VITALS.map((vital) => ({
        vital,
        rows: PAGE_ORDER.map(({ key, short }) => {
          const mob = metricValue(pageData.mobile, key, vital.key);
          const desk = metricValue(pageData.desktop, key, vital.key);
          return {
            page: pageLabel(key, short, anyData),
            mobile: mob == null ? null : vital.toDisplay(mob),
            desktop: desk == null ? null : vital.toDisplay(desk),
          };
        }),
      })),
    [pageData, anyData],
  );

  const hasAnyData = useMemo(
    () => scoreData.some((d) => d.mobile != null || d.desktop != null),
    [scoreData],
  );

  return (
    <section style={{ borderRadius: '16px', border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-label)', fontWeight: 700 }}>PageSpeed Comparison</p>
          <h2 style={{ margin: '6px 0 0', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Performance across page types</h2>
        </div>
      </div>

      {loading && !hasAnyData ? (
        <div style={{ height: '260px', borderRadius: '12px', background: 'var(--bg-page)', border: '1px solid var(--border-card)', animation: 'pulse 1.2s ease-in-out infinite' }} />
      ) : !hasAnyData ? (
        <div style={{ borderRadius: '12px', border: '1px dashed var(--border-card)', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
          No PageSpeed measurements yet — click “Refresh” on a page-type section below to populate the charts.
        </div>
      ) : (
        <>
          {/* Performance score (0–100): mobile vs desktop lines across page types. */}
          <ChartCard title="Performance score by page type" subtitle="Lighthouse performance score (0–100) — higher is better · green line = “Good” (90)">
            <div style={{ width: '100%', height: '260px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreData} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card)" vertical={false} />
                  <XAxis dataKey="page" tick={axisTick} axisLine={{ stroke: 'var(--border-card)' }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ stroke: 'rgba(148,163,184,0.4)' }}
                    contentStyle={tooltipContentStyle}
                    itemStyle={{ color: '#f8fafc' }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(value: any, name: string) => [value == null ? '—' : value, seriesName(name)]}
                  />
                  <Legend formatter={seriesName} wrapperStyle={{ fontSize: '12px' }} />
                  <ReferenceLine y={90} stroke={THRESHOLD_COLOR} strokeDasharray="4 4" strokeOpacity={0.7} />
                  <Line type="monotone" dataKey="mobile" stroke={MOBILE_COLOR} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
                  <Line type="monotone" dataKey="desktop" stroke={DESKTOP_COLOR} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Core Web Vitals by page type</p>

          {/* One line chart per vital: mobile vs desktop across page types, with a
              dashed reference line at the "Good" PSI threshold. All four kept on a
              single row (equal columns); scrolls horizontally if the row gets too
              narrow rather than wrapping. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))', gap: '16px', overflowX: 'auto' }}>
            {vitalsData.map(({ vital, rows }) => (
              <ChartCard
                key={vital.key}
                title={vital.label}
                subtitle={`Lower is better · green line = “Good” (${vital.fmt(vital.goodThreshold)}${vital.unit ? ` ${vital.unit}` : ''})`}
              >
                <div style={{ width: '100%', height: '210px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card)" vertical={false} />
                      <XAxis dataKey="page" tick={axisTick} axisLine={{ stroke: 'var(--border-card)' }} tickLine={false} />
                      <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v: number) => vital.fmt(v)} width={44} />
                      <Tooltip
                        cursor={{ stroke: 'rgba(148,163,184,0.4)' }}
                        contentStyle={tooltipContentStyle}
                        itemStyle={{ color: '#f8fafc' }}
                        labelStyle={{ color: '#94a3b8' }}
                        formatter={(value: any, name: string) => [value == null ? '—' : `${vital.fmt(Number(value))}${vital.unit ? ` ${vital.unit}` : ''}`, seriesName(name)]}
                      />
                      <Legend formatter={seriesName} wrapperStyle={{ fontSize: '12px' }} />
                      <ReferenceLine y={vital.goodThreshold} stroke={THRESHOLD_COLOR} strokeDasharray="4 4" strokeOpacity={0.7} />
                      <Line type="monotone" dataKey="mobile" stroke={MOBILE_COLOR} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
                      <Line type="monotone" dataKey="desktop" stroke={DESKTOP_COLOR} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
