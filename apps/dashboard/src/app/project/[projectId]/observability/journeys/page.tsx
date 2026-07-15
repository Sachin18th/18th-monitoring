'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Map,
  ZapOff,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ArrowDown,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Check,
  Users,
  Zap,
  Clock,
  Lightbulb,
  Package,
  RotateCcw
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useAuth } from '@/context/AuthContext';
import { useConnectorFilter } from '@/hooks/useConnectorFilter';
import { useConnectorPlatform } from '@/context/ConnectorPlatformContext';
import { PageRestricted } from '@/components/PageRestricted';
import SessionJourneyTimeline from '@/components/journey/SessionJourneyTimeline';
import TrackingInstallCard from '@/components/integrations/TrackingInstallCard';

const pageStyle: React.CSSProperties = {
  padding: '24px 28px',
  maxWidth: '1280px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  overflow: 'visible',
  minHeight: '100vh',
  background: 'var(--bg-page)',
  color: 'var(--text-primary)'
};

const cardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '20px',
  overflow: 'visible',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.03)'
};

// Secondary surface — quieter than a primary card so only major sections carry
// a strong border + shadow. Reduces the "many boxes" clutter.
const subCardStyle: React.CSSProperties = {
  borderRadius: '10px',
  border: '1px solid transparent',
  background: 'color-mix(in srgb, var(--bg-input) 45%, transparent)',
  padding: '14px'
};

// ── Semantic color tokens — color is used to encode meaning, never decoration.
//   green = positive/healthy · amber = warning · red = loss/friction · blue/indigo = neutral.
const C = {
  green: '#22c55e',
  greenText: '#16a34a',
  greenBg: 'rgba(34,197,94,0.10)',
  greenBorder: 'rgba(34,197,94,0.28)',
  amber: '#f59e0b',
  amberBg: 'rgba(245,158,11,0.10)',
  amberBorder: 'rgba(245,158,11,0.30)',
  red: '#ef4444',
  redSoft: '#f87171',
  redBg: 'rgba(239,68,68,0.10)',
  redBorder: 'rgba(239,68,68,0.28)',
  blue: '#3b82f6',
  blueBg: 'rgba(59,130,246,0.10)',
  blueBorder: 'rgba(59,130,246,0.28)',
  teal: '#14b8a6',
  indigo: '#6366f1',
};

// Shared section header typography (sentence case, not all-caps).
const sectionTitleStyle: React.CSSProperties = { fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 };
const sectionSubStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' };

// Threshold → color helpers (single source of truth for metric health coloring).
const completionColor = (pct: number) => (pct > 20 ? C.green : pct >= 10 ? C.amber : C.red);
const dropBadgeColor = (pct: number) => (pct > 50 ? C.red : pct >= 20 ? C.amber : C.green);
const stageLossColor = (pct: number) => (pct > 20 ? C.red : pct >= 10 ? C.amber : 'var(--text-muted)');
const bounceAccent = (pct: number) => (pct > 60 ? C.red : pct >= 40 ? C.amber : C.green);
const durationAccent = (secs: number) => (secs > 60 ? C.green : secs >= 15 ? C.amber : 'var(--border-card)');
const repeatAccent = (pct: number) => (pct > 30 ? C.green : pct >= 10 ? C.amber : 'var(--border-card)');
const truncate = (s: string, n = 40) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Donut chart palette for categorical breakdowns (devices, etc.).
const DONUT_PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6', '#a855f7'];

// Reusable donut with an optional centered label. Theme-aware via CSS vars.
function Donut({
  data,
  height = 180,
  centerLabel,
  centerSub
}: {
  data: Array<{ name: string; value: number; color: string }>;
  height?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="64%"
            outerRadius="92%"
            paddingAngle={data.length > 1 ? 3 : 0}
            stroke="none"
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)' }}
            itemStyle={{ color: 'var(--text-primary)' }}
          />
        </PieChart>
      </ResponsiveContainer>
      {centerLabel && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}
        >
          <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{centerLabel}</span>
          {centerSub && <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>{centerSub}</span>}
        </div>
      )}
    </div>
  );
}

export default function JourneyIntelligencePage() {
  const { projectId } = useParams();
  const { apiFetch, token, user } = useAuth();
  const { connectorInstanceId, connectorSelectionTick } = useConnectorFilter();
  const { connectedStores } = useConnectorPlatform();
  const initialLoadKeyRef = useRef<string | null>(null);

  // Platform of the store currently selected in the connector filter — used to
  // open the tracking-install instructions on the right platform. Falls back to
  // the only connected store when "All stores" is active.
  const selectedPlatform = useMemo(() => {
    const store =
      connectedStores.find((s) => s.connectorId === connectorInstanceId) ||
      (connectedStores.length === 1 ? connectedStores[0] : undefined);
    return store?.platform;
  }, [connectedStores, connectorInstanceId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [funnelSteps, setFunnelSteps] = useState<any[]>([]);
  const [intelligence, setIntelligence] = useState<any>(null);
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const permissions = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
      const nextAllowedPageKeys = Array.isArray(permissions?.allowedPageKeys) ? permissions.allowedPageKeys.map((value: any) => String(value)) : [];
      setAllowedPageKeys(nextAllowedPageKeys);

      if (!nextAllowedPageKeys.includes('observability/journeys')) return;

      const qs = new URLSearchParams({
        siteId: String(projectId),
        range,
      });
      if (connectorInstanceId && connectorInstanceId !== 'all') {
        qs.set('connector_instance_id', connectorInstanceId);
      }

      const res = await apiFetch(`/api/v1/dashboard/customers/intelligence?${qs.toString()}`);
      const funnel = Array.isArray(res?.funnel) ? res.funnel : [];
      setFunnelSteps(
        funnel.map((s: any) => ({
          label: s.stage,
          count: s.count,
          dropRate: s.percent ? Math.round(100 - s.percent) : 0,
          technicalDropCount: 0
        }))
      );
      setIntelligence(res);
    } catch (err: any) {
      console.error('[Journeys] Load failed', err);
      setError('Failed to reconstruct user journeys.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId, token, range, connectorInstanceId]);

  useEffect(() => {
    if (!token || !projectId) {
      return;
    }

    const loadKey = `${projectId}:${token}:${range}:${connectorInstanceId || 'all'}:${connectorSelectionTick}`;

    if (initialLoadKeyRef.current === loadKey) {
      return;
    }

    initialLoadKeyRef.current = loadKey;
    loadData();
  }, [loadData, projectId, token, range, connectorInstanceId, connectorSelectionTick]);

  const isPageRestricted = allowedPageKeys !== null && !allowedPageKeys.includes('observability/journeys');

  const firstStep = funnelSteps[0]?.count || 0;
  const lastStep = funnelSteps[funnelSteps.length - 1]?.count || 0;
  const completion = firstStep > 0 ? ((lastStep / firstStep) * 100).toFixed(2) : '0.00';
  const frictionSignals = funnelSteps.filter((s) => s.dropRate > 50).length;

  // Session Intelligence (live, from storefront_sessions + storefront_events).
  const si = intelligence?.sessionIntelligence || {};
  // Real tracked-session count — sourced from storefront_sessions, NOT the
  // funnel's first stage. The funnel's visit stage can be lifted by the synced-
  // order merge (off-domain Shopify checkouts), so reading it here made "Total
  // Sessions" show the order count. Fall back to the funnel only if the API
  // predates total_sessions.
  const totalSessions = Number(si.total_sessions ?? firstStep) || 0;
  const fmtDuration = (secs: number) => {
    const s = Math.max(0, Math.round(secs || 0));
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  };
  // Real stage-to-stage drop-off attribution, derived from the funnel.
  const dropAttribution = funnelSteps.slice(1).map((step, i) => {
    const prev = funnelSteps[i];
    const lost = Math.max(0, (prev?.count || 0) - (step?.count || 0));
    const pctLost = prev?.count > 0 ? Math.round((lost / prev.count) * 100) : 0;
    return { label: `${prev?.label} → ${step?.label}`, lost, pctLost };
  });
  const biggestDrop = [...dropAttribution].sort((a, b) => b.pctLost - a.pctLost)[0];

  // Content & acquisition insights (from storefront_sessions + storefront_events).
  const shortPath = (u: string) => {
    if (!u) return '(none)';
    try { const url = new URL(u); return (url.pathname + url.search) || url.hostname; } catch { return u; }
  };
  const insightPanels = [
    { title: 'Top Viewed Products', rows: (si.top_products || []).map((p: any) => ({ label: p.product, value: p.sessions })) },
    { title: 'Top Entry Pages', rows: (si.top_entry_pages || []).map((p: any) => ({ label: shortPath(p.page), value: p.sessions })) },
    { title: 'Top Exit Pages', rows: (si.top_exit_pages || []).map((p: any) => ({ label: shortPath(p.page), value: p.sessions })) },
    { title: 'Top Referrers', rows: (si.top_referrers || []).map((r: any) => ({ label: r.referrer, value: r.sessions })) },
    { title: 'Devices', rows: (si.device_breakdown || []).map((d: any) => ({ label: d.device, value: d.sessions })) },
    { title: 'Checkout Steps', rows: (si.checkout_steps || []).map((s: any) => ({ label: s.step, value: s.sessions })) }
  ].filter((panel) => panel.rows.length > 0);

  const completionNum = parseFloat(completion);
  const dropCount = firstStep - lastStep;
  const hasTraffic = firstStep > 0;

  // ── Journey Health Score — a single 0-100 executive metric blending end-to-end
  //   conversion, engagement (inverse bounce) and loyalty (repeat visitors).
  const healthScore = hasTraffic
    ? Math.max(0, Math.min(100, Math.round(
        0.45 * Math.min(100, completionNum * 4) +          // 25% conversion → full marks
        0.35 * Math.max(0, 100 - (si.bounce_rate ?? 0)) +  // lower bounce → healthier
        0.20 * Math.min(100, (si.repeat_visitor_rate ?? 0) * 2.5) // 40% repeat → full marks
      )))
    : null;
  const healthTone = healthScore == null ? 'var(--text-label)' : healthScore >= 80 ? C.green : healthScore >= 60 ? C.amber : C.red;
  const healthLabel = healthScore == null ? 'Awaiting data' : healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Fair' : 'Needs attention';

  const metricCards = useMemo(
    () => [
      {
        label: 'Completion Rate',
        value: `${completion}%`,
        badge: 'End-to-end conversion',
        icon: CheckCircle,
        accent: C.green,
        valueColor: completionColor(completionNum),
        iconColor: completionColor(completionNum)
      },
      {
        label: 'Total Sessions',
        value: totalSessions.toLocaleString(),
        badge: 'Tracked storefront sessions',
        icon: Users,
        accent: C.blue,
        valueColor: 'var(--text-primary)',
        iconColor: C.blue
      },
      {
        label: 'Journey Drop-offs',
        value: dropCount.toLocaleString(),
        badge: 'Exited before completion',
        icon: TrendingDown,
        accent: C.amber,
        valueColor: dropCount > 0 ? C.amber : 'var(--text-primary)',
        iconColor: dropCount > 0 ? C.amber : 'var(--text-label)'
      },
      {
        label: 'Friction Signals',
        value: `${frictionSignals} stages`,
        badge: 'High-loss stage count',
        icon: Zap,
        accent: C.red,
        valueColor: frictionSignals > 0 ? C.red : 'var(--text-primary)',
        iconColor: frictionSignals > 0 ? C.red : 'var(--text-label)'
      }
    ],
    [completion, completionNum, dropCount, firstStep, totalSessions, frictionSignals]
  );

  if (isPageRestricted) {
    return <PageRestricted pageKey="observability/journeys" />;
  }

  if (loading && funnelSteps.length === 0) {
    return (
      <div style={{ ...pageStyle, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '999px',
              border: '4px solid #1f2937',
              borderTopColor: '#22c55e',
              marginBottom: '16px',
              animation: 'spin 1s linear infinite'
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: 'var(--text-muted)'
            }}
          >
            Reconstructing user journeys...
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={pageStyle}>
        <div style={{ marginBottom: '4px', paddingBottom: '18px', borderBottom: '1px solid var(--border-card)', overflow: 'visible' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Map style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
            </div>
            <span
              style={{
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-label)'
              }}
            >
              Journey Observability
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, maxWidth: '760px' }}>
              <div style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Customer Journey Intelligence
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#22c55e',
                    display: 'inline-block',
                    marginLeft: '10px',
                    verticalAlign: 'middle'
                  }}
                />
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Behavioral diagnostics and technical funnel attribution for {projectId as string}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '10px 16px',
                  borderRadius: '12px',
                  border: `1px solid ${healthTone}33`,
                  background: `color-mix(in srgb, ${healthTone} 8%, var(--bg-card))`
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)' }}>
                    Journey Health
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: healthTone }}>{healthLabel}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: '32px', fontWeight: 700, color: healthTone, lineHeight: 1 }}>
                    {healthScore == null ? '—' : healthScore}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-label)' }}>/ 100</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <select
                value={range}
                onChange={(event) => setRange(event.target.value as '7d' | '30d' | '90d')}
                aria-label="Date range"
                style={{
                  borderRadius: '10px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(244,63,94,0.2)',
              background: 'rgba(244,63,94,0.1)',
              color: '#fb7185',
              overflow: 'visible'
            }}
          >
            <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '12px' }}>
              <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', overflowWrap: 'anywhere' }}>{error}</span>
            </div>
            <button
              onClick={loadData}
              style={{
                marginLeft: '8px',
                flexShrink: 0,
                fontSize: '12px',
                fontWeight: 500,
                color: '#fb7185',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                padding: 0
              }}
            >
              Retry
            </button>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
            overflow: 'visible'
          }}
        >
          {metricCards.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
                style={{
                  position: 'relative',
                  borderRadius: '12px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '132px',
                  overflow: 'visible',
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                    {metric.label}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      background: `color-mix(in srgb, ${metric.accent} 14%, transparent)`,
                      flexShrink: 0
                    }}
                  >
                    <Icon style={{ width: '16px', height: '16px', color: metric.iconColor }} />
                  </span>
                </div>
                {/* Large, color-coded headline figure. Trend deltas (↑/↓) render here
                    once historical comparison data is available. */}
                <div style={{ fontSize: '38px', fontWeight: 700, color: metric.valueColor, lineHeight: 1 }}>{metric.value}</div>
                <div style={{ marginTop: '10px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{metric.badge}</span>
                </div>
              </div>
            );
          })}
        </div>


        {/* Intelligence Insight — surfaced immediately below the KPIs so the most
            important takeaway is visible without scrolling. */}
        <div
          style={{
            ...cardStyle,
            background: C.blueBg,
            border: `1px solid ${C.blueBorder}`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '14px'
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: `color-mix(in srgb, ${C.blue} 16%, transparent)`,
              flexShrink: 0
            }}
          >
            <Lightbulb style={{ width: '19px', height: '19px', color: C.blue }} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>Intelligence Insight</p>
            {hasTraffic ? (
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                {biggestDrop && biggestDrop.pctLost > 0
                  ? `Largest drop-off is ${biggestDrop.label} — ${biggestDrop.pctLost}% of sessions (${biggestDrop.lost.toLocaleString()}) are lost here. ${
                      (si.bounce_rate ?? 0) > 0 ? `Bounce rate is ${(si.bounce_rate).toFixed(1)}%.` : ''
                    }`
                  : `No major funnel drop-off detected. Overall conversion is ${completion}% across ${firstStep.toLocaleString()} visits.`}
              </p>
            ) : (
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Waiting for traffic data. At least 100 sessions are required before journey insights can be surfaced.
              </p>
            )}
          </div>
        </div>

        {/* Purchase Journey Funnel — the page's primary visualization. Stage counts
            and the loss between each stage are merged into one full-width view, so
            conversion loss is immediately legible (replaces the old split funnel /
            drop-off attribution cards). */}
        {funnelSteps.length === 0 ? (
          <div
            style={{
              ...cardStyle,
              minHeight: '300px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: '14px'
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '56px',
                height: '56px',
                borderRadius: '14px',
                background: `color-mix(in srgb, ${C.indigo} 12%, transparent)`
              }}
            >
              <TrendingUp style={{ width: '26px', height: '26px', color: C.indigo }} />
            </span>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Journey Intelligence</p>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6, maxWidth: '380px' }}>
                Traffic data has not started flowing yet. Connect storefront tracking to
                begin reconstructing the purchase funnel.
              </p>
            </div>
          </div>
        ) : (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '22px' }}>
              <div>
                <h3 style={sectionTitleStyle}>Purchase Journey Funnel</h3>
                <p style={sectionSubStyle}>Session retention and where conversion is lost at each stage.</p>
              </div>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  border: '1px solid var(--border-input)',
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.green }} />
                Live · Project scope
              </span>
            </div>

            <div style={{ overflow: 'visible' }}>
              {funnelSteps.map((step, idx) => {
                const widthPct = firstStep > 0 ? Math.min(100, Math.max(0, (step.count / firstStep) * 100)) : 0;
                const barColor = idx === 0 ? C.green : dropBadgeColor(step.dropRate);
                const isEntry = idx === 0;
                const isLast = idx === funnelSteps.length - 1;
                // Loss flowing from the previous stage into this one (shown inline on this row).
                const prev = funnelSteps[idx - 1];
                const lostIn = isEntry ? 0 : Math.max(0, (prev?.count || 0) - step.count);
                const pctIn = !isEntry && prev?.count > 0 ? Math.round((lostIn / prev.count) * 100) : 0;
                const lossColor = stageLossColor(pctIn);
                const nodeIsLoss = !isEntry && pctIn > 0;

                return (
                  <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: '16px', minHeight: '64px' }}>
                    {/* Stage node + dashed connector spine */}
                    <div style={{ position: 'relative', width: '32px', flexShrink: 0, alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {!isEntry && <div style={{ position: 'absolute', top: 0, height: 'calc(50% - 14px)', borderLeft: '2px dashed var(--border-card)' }} />}
                      {!isLast && <div style={{ position: 'absolute', bottom: 0, height: 'calc(50% - 14px)', borderLeft: '2px dashed var(--border-card)' }} />}
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          zIndex: 1,
                          background: isEntry ? C.green : 'var(--bg-card)',
                          border: isEntry ? 'none' : `2px solid ${nodeIsLoss ? C.red : 'var(--border-card)'}`
                        }}
                      >
                        {isEntry ? (
                          <Check style={{ width: '15px', height: '15px', color: '#fff' }} />
                        ) : nodeIsLoss ? (
                          <ArrowDown style={{ width: '14px', height: '14px', color: C.red }} />
                        ) : (
                          <ArrowRight style={{ width: '14px', height: '14px', color: 'var(--text-label)' }} />
                        )}
                      </div>
                    </div>

                    <div style={{ width: '120px', flexShrink: 0, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>{step.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{widthPct.toFixed(1)}% of entry</div>
                    </div>

                    <div style={{ flex: '1.1 1 0', minWidth: 0, maxWidth: '360px' }}>
                      <div style={{ height: '5px', borderRadius: '999px', background: 'var(--bg-input)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.max(2, widthPct)}%`,
                            height: '100%',
                            borderRadius: '999px',
                            background: barColor,
                            transition: 'width 0.4s ease'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ flex: '1.6 1 0', minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isEntry ? (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Entry stage</span>
                      ) : (
                        <>
                          <ArrowDown style={{ width: '14px', height: '14px', flexShrink: 0, color: lossColor }} />
                          <span style={{ fontSize: '12px', color: lossColor, fontWeight: pctIn > 20 ? 600 : 500, flexShrink: 0 }}>
                            {pctIn}% lost
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            · {lostIn.toLocaleString()} sessions exit before {step.label}
                          </span>
                          {pctIn > 50 && <AlertTriangle style={{ width: '14px', height: '14px', flexShrink: 0, color: C.red }} />}
                        </>
                      )}
                    </div>

                    <div style={{ width: '84px', flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{step.count.toLocaleString()}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>sessions</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-card)', display: 'grid', gridTemplateColumns: 'minmax(120px, 0.85fr) 1fr 1fr', gap: '16px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '100%', maxWidth: '148px' }}>
                  <Donut
                    height={132}
                    data={[
                      { name: 'Converted', value: lastStep, color: C.green },
                      { name: 'Did not convert', value: Math.max(0, firstStep - lastStep), color: 'rgba(148,163,184,0.22)' }
                    ]}
                    centerLabel={`${completion}%`}
                    centerSub="converted"
                  />
                </div>
              </div>
              <div style={{ borderRadius: '10px', border: `1px solid ${C.greenBorder}`, background: C.greenBg, padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <TrendingUp style={{ width: '15px', height: '15px', color: C.green }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Conversion Rate</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 600, color: C.green, lineHeight: 1 }}>{completion}%</div>
              </div>
              <div style={{ borderRadius: '10px', border: `1px solid ${C.redBorder}`, background: C.redBg, padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <ZapOff style={{ width: '15px', height: '15px', color: bounceAccent(si.bounce_rate ?? 0) }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Bounce Rate</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 600, color: bounceAccent(si.bounce_rate ?? 0), lineHeight: 1 }}>{(si.bounce_rate ?? 0).toFixed(1)}%</div>
              </div>
            </div>
          </div>
        )}

        {intelligence?.sessionIntelligence && (
          <div style={cardStyle}>
            <h3 style={sectionTitleStyle}>Session Intelligence</h3>
            <p style={{ ...sectionSubStyle, marginBottom: '16px' }}>
              Behavioral metrics derived from storefront sessions.
            </p>
            {(() => {
              const cartAb = intelligence.sessionIntelligence.cart_abandonment_rate ?? 0;
              const checkoutAb = intelligence.sessionIntelligence.checkout_abandonment_rate ?? 0;
              const newV = Number(intelligence.sessionIntelligence.new_visitors ?? 0);
              const retV = Number(intelligence.sessionIntelligence.returning_visitors ?? 0);
              const cards = [
                { label: 'Avg Pages / Session', value: (intelligence.sessionIntelligence.avg_pages_per_session ?? 0).toFixed(1), tone: 'var(--text-primary)' },
                { label: 'Sessions / Visitor', value: (intelligence.sessionIntelligence.sessions_per_visitor ?? 0).toFixed(1), tone: 'var(--text-primary)' },
                { label: 'Cart Abandonment', value: `${cartAb.toFixed(1)}%`, tone: cartAb > 50 ? C.red : cartAb > 0 ? C.amber : 'var(--text-primary)' },
                { label: 'Checkout Abandonment', value: `${checkoutAb.toFixed(1)}%`, tone: checkoutAb > 20 ? C.red : checkoutAb > 0 ? C.amber : 'var(--text-primary)' },
                { label: 'New Visitors', value: String(newV), tone: 'var(--text-primary)' },
                { label: 'Returning Visitors', value: String(retV), tone: 'var(--text-primary)' }
              ];
              const totalV = newV + retV;
              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '10px' }}>
                    {cards.map((kpi) => (
                      <div key={kpi.label} style={{ ...subCardStyle, padding: '10px 12px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={kpi.label}>
                          {kpi.label}
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 600, color: kpi.tone }}>
                          {kpi.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {totalV > 0 && (
                    <div style={{ marginTop: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: C.blue }} /> New ({newV})
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          Returning ({retV}) <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: C.teal }} />
                        </span>
                      </div>
                      <div style={{ display: 'flex', height: '8px', width: '100%', borderRadius: '999px', overflow: 'hidden', background: 'var(--bg-input)' }}>
                        <div style={{ width: `${(newV / totalV) * 100}%`, background: C.blue }} />
                        <div style={{ width: `${(retV / totalV) * 100}%`, background: C.teal }} />
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* {Array.isArray(intelligence.sessionIntelligence.platform_breakdown) &&
              intelligence.sessionIntelligence.platform_breakdown.length > 0 && (
                <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--border-card)' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                    Sessions by Platform
                  </h4>
                  {(() => {
                    const rows = intelligence.sessionIntelligence.platform_breakdown as Array<{ platform: string; sessions: number }>;
                    const max = Math.max(1, ...rows.map((r) => r.sessions));
                    return rows.map((r) => (
                      <div key={r.platform} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-primary)', textTransform: 'capitalize', width: '110px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.platform.replace('_', ' ')}
                        </span>
                        <div style={{ flex: 1, height: '10px', background: 'var(--bg-input)', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(r.sessions / max) * 100}%`, background: C.indigo, borderRadius: '999px' }} />
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', width: '48px', textAlign: 'right', flexShrink: 0 }}>{r.sessions.toLocaleString()}</span>
                      </div>
                    ));
                  })()}
                </div>
              )} */}
          </div>
        )}

        {/* Behavior Quality — three engagement signals plus the composite health
            score, consolidated into a single card (was three separate cards). */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Behavior Quality</h3>
          <p style={{ ...sectionSubStyle, marginBottom: '14px' }}>Engagement signals and the composite journey health score.</p>
          {[
            {
              label: 'Bounce Rate',
              value: `${(si.bounce_rate ?? 0).toFixed(1)}%`,
              benchmark: 'Industry avg ~45%',
              icon: ZapOff,
              accent: bounceAccent(si.bounce_rate ?? 0)
            },
            {
              label: 'Session Duration',
              value: fmtDuration(si.avg_session_duration_seconds ?? 0),
              benchmark: 'Healthy > 60s',
              icon: Clock,
              accent: durationAccent(si.avg_session_duration_seconds ?? 0)
            },
            {
              label: 'Repeat Visitors',
              value: `${(si.repeat_visitor_rate ?? 0).toFixed(1)}%`,
              benchmark: 'Good > 30%',
              icon: RotateCcw,
              accent: repeatAccent(si.repeat_visitor_rate ?? 0)
            }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '11px 0',
                  borderBottom: '1px solid var(--border-card)'
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <Icon style={{ width: '15px', height: '15px', color: item.accent, flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{item.label}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-label)' }}>{item.benchmark}</span>
                </span>
                <span style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>{item.value}</span>
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', paddingTop: '12px', marginTop: '2px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>Health Score</span>
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: healthTone }}>{healthScore == null ? '—' : healthScore}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-label)' }}>/ 100 · {healthLabel}</span>
            </span>
          </div>
        </div>

        {insightPanels.length > 0 && (() => {
          const contentPanels = insightPanels.filter((p) => p.title !== 'Checkout Steps' && p.title !== 'Devices');
          const checkoutPanel = insightPanels.find((p) => p.title === 'Checkout Steps');
          const devices = (si.device_breakdown || []) as Array<{ device: string; sessions: number }>;
          const renderRows = (panel: { rows: any[] }) => {
            const max = Math.max(1, ...panel.rows.map((r: any) => Number(r.value) || 0));
            return panel.rows.slice(0, 8).map((row: any, i: number) => (
              <div key={`${row.label}-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13px', color: 'var(--text-primary)' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }} title={String(row.label)}>
                    {truncate(String(row.label).replace(/_/g, ' '))}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', flexShrink: 0, fontWeight: 500 }}>{Number(row.value).toLocaleString()}</span>
                </div>
                <div style={{ height: '6px', width: '100%', background: 'var(--bg-input)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(Number(row.value) / max) * 100}%`, background: C.indigo, borderRadius: '999px' }} />
                </div>
              </div>
            ));
          };
          return (
            <>
              {contentPanels.length > 0 && (
                <div style={cardStyle}>
                  <h3 style={sectionTitleStyle}>Content &amp; Acquisition</h3>
                  <p style={{ ...sectionSubStyle, marginBottom: '18px' }}>Top products, entry &amp; exit points and traffic sources.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '20px 32px' }}>
                    {contentPanels.map((panel) => (
                      <div key={panel.title} style={{ minWidth: 0 }}>
                        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>{panel.title}</h4>
                        {renderRows(panel)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(devices.length > 0 || checkoutPanel) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
                  {devices.length > 0 && (
                    <div style={cardStyle}>
                      <h3 style={{ ...sectionTitleStyle, marginBottom: '4px' }}>Devices</h3>
                      <p style={{ ...sectionSubStyle, marginBottom: '12px' }}>Sessions by device type.</p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '28px', flexWrap: 'wrap' }}>
                        <div style={{ width: '150px', flexShrink: 0 }}>
                          <Donut
                            height={150}
                            data={devices.map((d, i) => ({ name: d.device, value: d.sessions, color: DONUT_PALETTE[i % DONUT_PALETTE.length] }))}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '120px' }}>
                          {devices.map((d, i) => (
                            <div key={d.device} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', fontSize: '13px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                <span style={{ width: '9px', height: '9px', borderRadius: '3px', background: DONUT_PALETTE[i % DONUT_PALETTE.length], flexShrink: 0 }} />
                                <span style={{ color: 'var(--text-primary)', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.device}</span>
                              </span>
                              <span style={{ color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0 }}>{d.sessions.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {checkoutPanel && (
                    <div style={cardStyle}>
                      <h3 style={{ ...sectionTitleStyle, marginBottom: '4px' }}>Checkout Steps</h3>
                      <p style={{ ...sectionSubStyle, marginBottom: '14px' }}>Sessions reaching each checkout step.</p>
                      {renderRows(checkoutPanel)}
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })()}

        {intelligence?.sessionIntelligence && (
          <div style={cardStyle}>
            <h3 style={sectionTitleStyle}>Product Engagement</h3>
            <p style={{ ...sectionSubStyle, marginBottom: '16px' }}>
              Views, add-to-carts and cart rate per product from storefront events.
            </p>
            {(si.product_engagement || []).length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '16px 0', textAlign: 'center' }}>
                <Package style={{ width: '18px', height: '18px', color: 'var(--text-label)', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No product interaction data yet.</span>
              </div>
            ) : (() => {
              const products = si.product_engagement as Array<{ product_id: string; product_name: string; views: number; add_to_carts: number; cart_rate: number }>;
              const maxViews = Math.max(1, ...products.map((p) => p.views));
              const thStyle: React.CSSProperties = { padding: '10px 16px', fontWeight: 500, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', background: 'color-mix(in srgb, var(--bg-input) 40%, transparent)' };
              return (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left' }}>
                      <th style={{ ...thStyle, borderRadius: '8px 0 0 8px' }}>Product</th>
                      <th style={{ ...thStyle, textAlign: 'right', borderRadius: '0 8px 8px 0' }}>Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.slice(0, 20).map((p) => {
                      return (
                        <tr
                          key={p.product_id || p.product_name}
                          style={{ borderBottom: '1px solid var(--border-card)', transition: 'background 0.15s ease' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-input) 35%, transparent)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '12px 16px', color: 'var(--text-primary)', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.product_name}>
                            {p.product_name}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                              <div style={{ width: '56px', height: '6px', background: 'var(--bg-input)', borderRadius: '999px', overflow: 'hidden', flexShrink: 0 }}>
                                <div style={{ height: '100%', width: `${(p.views / maxViews) * 100}%`, background: C.blue, borderRadius: '999px' }} />
                              </div>
                              <span style={{ color: 'var(--text-secondary)', minWidth: '28px' }}>{p.views.toLocaleString()}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              );
            })()}
          </div>
        )}

        {intelligence?.sessionIntelligence && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px', overflow: 'visible' }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <Clock style={{ width: '15px', height: '15px', color: C.blue, flexShrink: 0 }} />
                <h3 style={sectionTitleStyle}>Time to Purchase</h3>
              </div>
              <p style={{ ...sectionSubStyle, marginBottom: '16px' }}>
                From session start to purchase, across converting sessions.
              </p>
              {((si.time_to_purchase?.avg_seconds ?? 0) === 0 && (si.time_to_purchase?.median_seconds ?? 0) === 0) ? (
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>No completed purchases in this window yet.</p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ borderRadius: '10px', border: '1px solid var(--border-card)', background: 'color-mix(in srgb, var(--bg-input) 60%, transparent)', padding: '14px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Average</div>
                      <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>{fmtDuration(si.time_to_purchase?.avg_seconds ?? 0)}</div>
                    </div>
                    <div style={{ borderRadius: '10px', border: '1px solid var(--border-card)', background: 'color-mix(in srgb, var(--bg-input) 60%, transparent)', padding: '14px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Median</div>
                      <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>{fmtDuration(si.time_to_purchase?.median_seconds ?? 0)}</div>
                    </div>
                  </div>
                  <p style={{ margin: '12px 0 0', fontSize: '11px', color: 'var(--text-label)' }}>Across sessions that completed purchase</p>
                </>
              )}
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <AlertTriangle style={{ width: '15px', height: '15px', color: C.amber, flexShrink: 0 }} />
                <h3 style={sectionTitleStyle}>Friction Signals by Checkout Step</h3>
              </div>
              <p style={{ ...sectionSubStyle, marginBottom: '16px' }}>
                Where checkout abandonment is concentrated.
              </p>
              {(si.friction_signals || []).length === 0 ? (
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>No checkout abandonment recorded in this window.</p>
              ) : (
                [...(si.friction_signals as Array<{ step: string; abandon_count: number; pct: number }>)]
                  .sort((a, b) => {
                    const au = /unspecified/i.test(a.step) ? 1 : 0;
                    const bu = /unspecified/i.test(b.step) ? 1 : 0;
                    return au - bu;
                  })
                  .map((f) => {
                    const unspecified = /unspecified/i.test(f.step);
                    const tone = unspecified ? 'var(--text-label)' : f.pct > 50 ? C.red : C.amber;
                    return (
                      <div key={f.step} style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', opacity: unspecified ? 0.7 : 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13px' }}>
                          <span style={{ color: unspecified ? 'var(--text-muted)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }} title={String(f.step)}>
                            {String(f.step).replace(/_/g, ' ')}
                          </span>
                          <span style={{ flexShrink: 0 }}>
                            <span style={{ color: tone, fontWeight: 600 }}>{f.pct.toFixed(1)}%</span>
                            <span style={{ color: 'var(--text-muted)' }}> · {f.abandon_count.toLocaleString()}</span>
                          </span>
                        </div>
                        <div style={{ height: '8px', width: '100%', background: 'var(--bg-input)', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.max(2, f.pct)}%`, background: tone, borderRadius: '999px' }} />
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}

        {intelligence?.generatedAt && (
          <div style={{ fontSize: '11px', color: 'var(--text-label)' }}>
            Last intelligence refresh: {new Date(intelligence.generatedAt).toLocaleString()}
            {intelligence?.range ? ` · Range: ${intelligence.range}` : ''}
          </div>
        )}

        {/* Storefront Tracking Setup — install/verify the tracking script. The
            card opens on the tab for the platform of the store selected in the
            connector filter (Shopify / BigCommerce / Adobe Commerce) and embeds
            the connector-scoped snippet + admin steps for that platform. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <h3 style={sectionTitleStyle}>Storefront Tracking Setup</h3>
            <p style={sectionSubStyle}>
              Add the tracking script to your store to power these journey insights. Steps and
              snippet are tailored to your selected platform.
            </p>
          </div>
          <TrackingInstallCard
            connectorInstanceId={connectorInstanceId || undefined}
            platform={selectedPlatform}
          />
        </div>

        {/* Session Journey Timeline — individual visitor paths, event by event.
            Self-contained: loads its own session/event data scoped to the active
            connector. Rendered below all existing journey intelligence sections. */}
        <SessionJourneyTimeline
          projectId={String(projectId)}
          connectorInstanceId={connectorInstanceId || ''}
          tenantId={user?.tenantId || ''}
        />
      </div>


      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '24px',
          zIndex: 50,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-input)',
          borderRadius: '999px',
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)'
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
        Live feed · System nominal
      </div>
    </>
  );
}