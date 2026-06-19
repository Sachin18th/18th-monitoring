'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Map,
  ZapOff,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Filter,
  History,
  RefreshCw,
  ArrowDown,
  ArrowRight,
  AlertTriangle,
  ChevronDown,
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
import { PageRestricted } from '@/components/PageRestricted';

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
const cartRateBadge = (pct: number) => (pct > 20 ? C.green : pct >= 5 ? C.amber : 'var(--text-muted)');
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

type GatewayType = 'razorpay' | 'stripe' | 'payu';

type GatewayFieldDefinition = {
  id: string;
  label: string;
  type: 'text' | 'password';
  placeholder: string;
  helper?: string;
};

type GatewayDraft = {
  id: string;
  gatewayName: GatewayType;
  label: string;
  fields: Record<string, string>;
};

const GATEWAY_FORM_SCHEMAS: Record<GatewayType, { label: string; description: string; backendEnabled: boolean; fields: GatewayFieldDefinition[] }> = {
  razorpay: {
    label: 'Razorpay',
    description: 'Live status sync enabled',
    backendEnabled: true,
    fields: [
      { id: 'apiKey', label: 'API Key', type: 'text', placeholder: 'rzp_test_...' },
      { id: 'apiSecret', label: 'API Secret', type: 'password', placeholder: 'Enter API secret' }
    ]
  },
  stripe: {
    label: 'Stripe',
    description: 'Stripe',
    backendEnabled: true,
    fields: []
  },
  payu: {
    label: 'PayU',
    description: 'Live status sync enabled',
    backendEnabled: true,
    fields: [
      { id: 'merchantKey', label: 'Merchant Key', type: 'text', placeholder: 'Enter merchant key' },
      { id: 'salt', label: 'Salt', type: 'password', placeholder: 'Enter salt' },
      { id: 'paymentUrl', label: 'Payment URL', type: 'text', placeholder: 'https://secure.payu.in/_payment', helper: 'Stored with the project config for reference.' }
    ]
  }
};

const createGatewayDraft = (gatewayName: GatewayType = 'razorpay'): GatewayDraft => {
  const schema = GATEWAY_FORM_SCHEMAS[gatewayName];

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    gatewayName,
    label: schema.label,
    fields: schema.fields.reduce((accumulator, field) => {
      accumulator[field.id] = '';
      return accumulator;
    }, {} as Record<string, string>)
  };
};

const normalizeGatewayDraft = (draft: any): GatewayDraft => {
  const gatewayName = (draft?.gatewayName === 'stripe' || draft?.gatewayName === 'cavenue' || draft?.gatewayName === 'payu')
    ? (draft?.gatewayName === 'cavenue' ? 'stripe' : draft.gatewayName)
    : 'razorpay';
  const schema = GATEWAY_FORM_SCHEMAS[gatewayName];
  const fields = schema.fields.reduce((accumulator, field) => {
    accumulator[field.id] = String(draft?.fields?.[field.id] ?? draft?.[field.id] ?? '');
    return accumulator;
  }, {} as Record<string, string>);

  return {
    id: String(draft?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    gatewayName,
    label: String(draft?.label || schema.label),
    fields
  };
};

export default function JourneyIntelligencePage() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();
  const gatewayStorageKey = useMemo(() => (projectId ? `journeys-payment-gateways:${projectId}` : null), [projectId]);
  const initialLoadKeyRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [funnelSteps, setFunnelSteps] = useState<any[]>([]);
  const [intelligence, setIntelligence] = useState<any>(null);
  const [paymentGateways, setPaymentGateways] = useState<any[]>([]);
  const [isGatewayConfigOpen, setIsGatewayConfigOpen] = useState(false);
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);
  const [gatewayConfigSaving, setGatewayConfigSaving] = useState(false);
  const [gatewayConfigError, setGatewayConfigError] = useState<string | null>(null);
  const [gatewayConfigSuccess, setGatewayConfigSuccess] = useState<string | null>(null);
  const [gatewayDrafts, setGatewayDrafts] = useState<GatewayDraft[]>([createGatewayDraft('razorpay')]);
  const [expandedGatewayId, setExpandedGatewayId] = useState<string | null>(null);

  const readGatewayDrafts = useCallback(() => {
    if (typeof window === 'undefined' || !gatewayStorageKey) {
      return [createGatewayDraft('razorpay')];
    }

    try {
      const raw = window.localStorage.getItem(gatewayStorageKey);
      if (!raw) {
        return [createGatewayDraft('razorpay')];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return [createGatewayDraft('razorpay')];
      }

      return parsed.map(normalizeGatewayDraft);
    } catch {
      return [createGatewayDraft('razorpay')];
    }
  }, [gatewayStorageKey]);

  const persistGatewayDrafts = useCallback((drafts: GatewayDraft[]) => {
    if (typeof window === 'undefined' || !gatewayStorageKey) {
      return;
    }

    window.localStorage.setItem(gatewayStorageKey, JSON.stringify(drafts));
  }, [gatewayStorageKey]);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const permissions = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
      const nextAllowedPageKeys = Array.isArray(permissions?.allowedPageKeys) ? permissions.allowedPageKeys.map((value: any) => String(value)) : [];
      setAllowedPageKeys(nextAllowedPageKeys);

      if (!nextAllowedPageKeys.includes('observability/journeys')) return;

      const res = await apiFetch(`/api/v1/dashboard/customers/intelligence?siteId=${projectId}&range=${range}`);
      const funnel = Array.isArray(res?.funnel) ? res.funnel : [];
      const gateways = Array.isArray(res?.paymentGateways) ? res.paymentGateways : [];
      setFunnelSteps(
        funnel.map((s: any) => ({
          label: s.stage,
          count: s.count,
          dropRate: s.percent ? Math.round(100 - s.percent) : 0,
          technicalDropCount: 0
        }))
      );
      setPaymentGateways(gateways);
      setIntelligence(res);
    } catch (err: any) {
      console.error('[Journeys] Load failed', err);
      setError('Failed to reconstruct user journeys.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId, token, range]);

  const openGatewayConfig = useCallback(() => {
    setGatewayConfigError(null);
    setGatewayConfigSuccess(null);
    setGatewayDrafts(readGatewayDrafts());
    setIsGatewayConfigOpen(true);
  }, [readGatewayDrafts]);

  const closeGatewayConfig = useCallback(() => {
    if (gatewayConfigSaving) return;
    setIsGatewayConfigOpen(false);
    setGatewayConfigError(null);
    setGatewayConfigSuccess(null);
  }, [gatewayConfigSaving]);

  const addGatewayDraft = useCallback(() => {
    setGatewayDrafts((current) => [...current, createGatewayDraft('razorpay')]);
  }, []);

  const removeGatewayDraft = useCallback((draftId: string) => {
    setGatewayDrafts((current) => (current.length > 1 ? current.filter((draft) => draft.id !== draftId) : current));
  }, []);

  const updateGatewayDraft = useCallback((draftId: string, patch: Partial<GatewayDraft>) => {
    setGatewayDrafts((current) => current.map((draft) => (draft.id === draftId ? { ...draft, ...patch } : draft)));
  }, []);

  const updateGatewayDraftField = useCallback((draftId: string, fieldId: string, value: string) => {
    setGatewayDrafts((current) => current.map((draft) => {
      if (draft.id !== draftId) {
        return draft;
      }

      return {
        ...draft,
        fields: {
          ...draft.fields,
          [fieldId]: value
        }
      };
    }));
  }, []);

  const saveGatewayConfig = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!projectId) {
      setGatewayConfigError('Project context is missing.');
      return;
    }

    setGatewayConfigSaving(true);
    setGatewayConfigError(null);
    setGatewayConfigSuccess(null);

    try {
      for (const draft of gatewayDrafts) {
        const isStripe = draft.gatewayName === 'stripe';
        const isPayU = draft.gatewayName === 'payu';
        const apiKey = isStripe ? '' : (isPayU ? draft.fields.merchantKey : draft.fields.apiKey)?.trim();
        const apiSecret = isStripe ? '' : (isPayU ? draft.fields.salt : draft.fields.apiSecret)?.trim();

        if (!isStripe && (!apiKey || !apiSecret)) {
          throw new Error(`${GATEWAY_FORM_SCHEMAS[draft.gatewayName].label} key and secret are required for each gateway row.`);
        }

        const requestBody: Record<string, any> = {
          gatewayName: draft.gatewayName,
          label: draft.label.trim() || GATEWAY_FORM_SCHEMAS[draft.gatewayName].label
        };

        if (!isStripe) {
          requestBody.apiKey = apiKey;
          requestBody.apiSecret = apiSecret;
        }

        if (isPayU) {
          const paymentUrl = draft.fields.paymentUrl?.trim();

          if (paymentUrl) {
            requestBody.metadata = { paymentUrl };
          }
        }

        await apiFetch(`/api/v1/dashboard/customers/payment-gateways?siteId=${projectId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });
      }

      persistGatewayDrafts(gatewayDrafts);

      setGatewayConfigSuccess(`${gatewayDrafts.length} gateway${gatewayDrafts.length === 1 ? '' : 's'} saved successfully.`);
      await loadData();
      setIsGatewayConfigOpen(false);
    } catch (err: any) {
      setGatewayConfigError(err?.message || 'Failed to save payment gateway configuration.');
    } finally {
      setGatewayConfigSaving(false);
    }
  }, [apiFetch, gatewayDrafts, loadData, persistGatewayDrafts, projectId]);

  useEffect(() => {
    if (!token || !projectId) {
      return;
    }

    const loadKey = `${projectId}:${token}:${range}`;

    if (initialLoadKeyRef.current === loadKey) {
      return;
    }

    initialLoadKeyRef.current = loadKey;
    loadData();
  }, [loadData, projectId, token, range]);

  useEffect(() => {
    if (expandedGatewayId !== undefined) {
      return;
    }

    if (paymentGateways.length > 0) {
      setExpandedGatewayId(`${paymentGateways[0].configId}-${paymentGateways[0].gatewayName}`);
    }
  }, [expandedGatewayId, paymentGateways]);

  const isPageRestricted = allowedPageKeys !== null && !allowedPageKeys.includes('observability/journeys');

  const firstStep = funnelSteps[0]?.count || 0;
  const lastStep = funnelSteps[funnelSteps.length - 1]?.count || 0;
  const completion = firstStep > 0 ? ((lastStep / firstStep) * 100).toFixed(2) : '0.00';
  const frictionSignals = funnelSteps.filter((s) => s.dropRate > 50).length;

  // Session Intelligence (live, from storefront_sessions + storefront_events).
  const si = intelligence?.sessionIntelligence || {};
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
  const gatewayHealth = useMemo(() => {
    if (!paymentGateways.length) {
      return {
        label: 'No configured gateways',
        tone: '#64748b',
        filled: 0
      };
    }

    const downCount = paymentGateways.filter((gateway) => gateway.status === 'DOWN').length;
    const degradedCount = paymentGateways.filter((gateway) => gateway.status === 'DEGRADED').length;

    if (downCount > 0) {
      return {
        label: `${downCount} gateway${downCount > 1 ? 's' : ''} down`,
        tone: '#f87171',
        filled: downCount
      };
    }

    if (degradedCount > 0) {
      return {
        label: `${degradedCount} gateway${degradedCount > 1 ? 's' : ''} degraded`,
        tone: '#f59e0b',
        filled: degradedCount
      };
    }

    return {
      label: 'All configured gateways up',
      tone: '#22c55e',
      filled: paymentGateways.length
    };
  }, [paymentGateways]);

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
        value: firstStep.toLocaleString(),
        badge: 'Entered first stage',
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
    [completion, completionNum, dropCount, firstStep, frictionSignals]
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
              <button
                onClick={loadData}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
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
                <RefreshCw style={{ width: '16px', height: '16px', flexShrink: 0, animation: loading ? 'spin 1s linear infinite' : undefined }} />
                Refresh
              </button>
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
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
                <History style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                Compare
              </button>
              <button
                onClick={openGatewayConfig}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderRadius: '10px',
                  border: '1px solid rgba(96,165,250,0.2)',
                  background: '#2563EB',
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                <Filter style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                Configuration
              </button>
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

        {paymentGateways.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '20px',
              padding: '20px 22px',
              borderRadius: '12px',
              border: `1px solid ${C.amberBorder}`,
              background: C.amberBg,
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', minWidth: 0 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: `color-mix(in srgb, ${C.amber} 16%, transparent)`,
                  flexShrink: 0
                }}
              >
                <AlertTriangle style={{ width: '20px', height: '20px', color: C.amber }} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Payment Gateway Missing
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, maxWidth: '560px' }}>
                  Journey analytics is incomplete because payment events are not being received. Connect a gateway to
                  unlock checkout health, friction attribution and conversion accuracy.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openGatewayConfig}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                flexShrink: 0,
                background: C.amber,
                border: 'none',
                borderRadius: '10px',
                padding: '11px 18px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#1f1300',
                cursor: 'pointer'
              }}
            >
              Configure Gateway
              <ArrowRight style={{ width: '15px', height: '15px' }} />
            </button>
          </div>
        ) : (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div>
              <h3 style={sectionTitleStyle}>Payment Gateway Status</h3>
              <p style={{ ...sectionSubStyle, lineHeight: 1.6, maxWidth: '640px' }}>
                Gateway checks are synced on refresh. Right now the status is stored at project scope, so there is no user-level attribution for who configured the gateway yet.
              </p>
            </div>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                border: `1px solid ${gatewayHealth.tone}33`,
                color: gatewayHealth.tone,
                background: `${gatewayHealth.tone}12`,
                whiteSpace: 'nowrap'
              }}
            >
              Refresh synced
            </span>
          </div>

          {paymentGateways.length === 0 ? (
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              No active payment gateway configuration is available for this project yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {paymentGateways.map((gateway) => {
                const gatewayId = `${gateway.configId}-${gateway.gatewayName}`;
                const isExpanded = expandedGatewayId === gatewayId;
                const statusTone = gateway.status === 'DOWN'
                  ? '#f87171'
                  : gateway.status === 'DEGRADED'
                    ? '#f59e0b'
                    : gateway.status === 'UP'
                      ? '#22c55e'
                      : '#94a3b8';
                const dedupedDowntimes = Array.isArray(gateway.activeDowntimes)
                  ? gateway.activeDowntimes.filter((downtime: any, index: number, array: any[]) => {
                      const method = String(downtime?.method || downtime?.entity || 'unknown').trim().toLowerCase();
                      const instrument = String(downtime?.instrument?.bank || downtime?.instrument?.name || '').trim().toLowerCase();
                      const key = `${method}|${instrument}`;

                      return array.findIndex((item: any) => {
                        const itemMethod = String(item?.method || item?.entity || 'unknown').trim().toLowerCase();
                        const itemInstrument = String(item?.instrument?.bank || item?.instrument?.name || '').trim().toLowerCase();
                        return `${itemMethod}|${itemInstrument}` === key;
                      }) === index;
                    })
                  : [];

                return (
                  <div
                    key={gatewayId}
                    style={{
                      borderRadius: '10px',
                      border: '1px solid var(--border-card)',
                      background: 'rgba(15,23,42,0.02)',
                      padding: '10px'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedGatewayId((current) => (current === gatewayId ? null : gatewayId))}
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
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{gateway.label}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {gateway.gatewayName}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '9px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            border: `1px solid ${statusTone}33`,
                            color: statusTone,
                            background: `${statusTone}12`
                          }}
                        >
                          {gateway.status}
                        </span>
                        <ChevronDown
                          style={{
                            width: '14px',
                            height: '14px',
                            color: 'var(--text-label)',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.16s ease'
                          }}
                        />
                      </div>
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                      <span>Active downtimes</span>
                      <span>{dedupedDowntimes.length}</span>
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: '10px' }}>
                        {dedupedDowntimes.length > 0 && (
                          <div style={{ display: 'grid', gap: '6px', marginBottom: '6px' }}>
                            {dedupedDowntimes.map((downtime: any, index: number) => {
                              const method = String(downtime?.method || downtime?.entity || 'unknown').trim();
                              const bank = String(downtime?.instrument?.bank || downtime?.instrument?.name || '').trim();
                              const vpaHandle = String(downtime?.instrument?.vpa_handle || '').trim();
                              const scheduledFor = downtime?.scheduledFor || downtime?.instrument?.scheduledFor || downtime?.scheduled_for || null;
                              const scheduledUntil = downtime?.scheduledUntil || downtime?.instrument?.scheduledUntil || downtime?.scheduled_until || null;
                              const instrumentLabel = bank || 'Unknown instrument';
                              const label = method || 'Unknown method';
                              const showVpaHandle = method.toLowerCase() === 'upi' && vpaHandle.length > 0;
                              const showMaintenanceWindow = Boolean(scheduledFor || scheduledUntil || method.toLowerCase() === 'maintenance');

                              return (
                                <div
                                  key={downtime?.id || `${gateway.configId}-${index}`}
                                  style={{
                                    borderRadius: '8px',
                                    border: '1px solid rgba(248,113,113,0.12)',
                                    background: 'rgba(248,113,113,0.05)',
                                    padding: '8px 10px'
                                  }}
                                >
                                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '3px' }}>
                                    {label}
                                  </div>
                                  {showMaintenanceWindow && (
                                    <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600, marginBottom: '3px' }}>
                                      Planned maintenance window
                                    </div>
                                  )}
                                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                    Instrument: {instrumentLabel}
                                    {showVpaHandle ? ` · VPA handle: ${vpaHandle}` : ''}
                                    · Status: {String(downtime?.status || 'unknown').toUpperCase()} · Severity: {String(downtime?.severity || 'unknown')}
                                  </div>
                                  {showMaintenanceWindow && (
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4, marginTop: '4px' }}>
                                      Start: {scheduledFor ? new Date(scheduledFor).toLocaleString() : 'N/A'}
                                      {' '}
                                      · End: {scheduledUntil ? new Date(scheduledUntil).toLocaleString() : 'N/A'}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>Last checked</span>
                          <span>{gateway.checkedAt ? new Date(gateway.checkedAt).toLocaleString() : 'N/A'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Sync summary
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: gatewayHealth.tone }}>{gatewayHealth.label}</span>
          </div>
        </div>
        )}

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
                Traffic data has not started flowing yet. Connect storefront tracking and configure a payment gateway to
                begin reconstructing the purchase funnel.
              </p>
            </div>
            <button
              type="button"
              onClick={openGatewayConfig}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '10px',
                border: '1px solid rgba(96,165,250,0.2)',
                background: '#2563EB',
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#fff',
                cursor: 'pointer'
              }}
            >
              <Filter style={{ width: '15px', height: '15px' }} />
              Setup Tracking
            </button>
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
                      <th style={{ ...thStyle, textAlign: 'right' }}>Views</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Carts</th>
                      <th style={{ ...thStyle, textAlign: 'right', borderRadius: '0 8px 8px 0' }}>Cart Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.slice(0, 20).map((p) => {
                      const badge = cartRateBadge(p.cart_rate);
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
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', textAlign: 'right' }}>{p.add_to_carts.toLocaleString()}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: badge,
                                background: `color-mix(in srgb, ${badge} 14%, transparent)`
                              }}
                            >
                              {p.cart_rate.toFixed(1)}%
                            </span>
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
      </div>

      {isGatewayConfigOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 90
          }}
          role="dialog"
          aria-modal="true"
            aria-label="Payment gateway configuration"
          onClick={closeGatewayConfig}
        >
          <div
            style={{
                width: 'min(100%, 760px)',
                maxHeight: 'calc(100vh - 48px)',
              borderRadius: '16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-card)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-card)', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>Payment Gateway Configuration</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>
                  Manage multiple gateways for this project.
                </div>
              </div>
              <button
                type="button"
                onClick={closeGatewayConfig}
                style={{
                  border: '1px solid var(--border-card)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>

            <form onSubmit={saveGatewayConfig} style={{ padding: '24px', display: 'grid', gap: '16px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Gateway Rows</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Add more than one gateway for a single project.</div>
                </div>
                <button
                  type="button"
                  onClick={addGatewayDraft}
                  style={{
                    borderRadius: '10px',
                    border: '1px solid rgba(96,165,250,0.2)',
                    background: 'rgba(37,99,235,0.08)',
                    padding: '10px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#2563EB',
                    cursor: 'pointer'
                  }}
                >
                  Add Gateway
                </button>
              </div>

              <div style={{ display: 'grid', gap: '14px' }}>
                {gatewayDrafts.map((draft, index) => {
                  const schema = GATEWAY_FORM_SCHEMAS[draft.gatewayName];

                  return (
                    <div
                      key={draft.id}
                      style={{
                        borderRadius: '14px',
                        border: '1px solid var(--border-card)',
                        background: 'var(--bg-page)',
                        padding: '16px',
                        display: 'grid',
                        gap: '14px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Gateway #{index + 1}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{schema.description}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => removeGatewayDraft(draft.id)}
                            disabled={gatewayDrafts.length === 1}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: gatewayDrafts.length === 1 ? 'var(--text-muted)' : '#fb7185',
                              cursor: gatewayDrafts.length === 1 ? 'not-allowed' : 'pointer',
                              fontSize: '12px',
                              padding: 0
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      <label style={{ display: 'grid', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Gateway Type</span>
                        <select
                          value={draft.gatewayName}
                          onChange={(event) => {
                            const nextGateway = event.target.value as GatewayType;
                            updateGatewayDraft(draft.id, {
                              gatewayName: nextGateway,
                              label: GATEWAY_FORM_SCHEMAS[nextGateway].label,
                              fields: GATEWAY_FORM_SCHEMAS[nextGateway].fields.reduce((accumulator, field) => {
                                accumulator[field.id] = '';
                                return accumulator;
                              }, {} as Record<string, string>)
                            });
                            setGatewayConfigError(null);
                            setGatewayConfigSuccess(null);
                          }}
                          style={{
                            width: '100%',
                            borderRadius: '10px',
                            border: '1px solid var(--border-input)',
                            background: 'var(--bg-card)',
                            color: 'var(--text-primary)',
                            padding: '12px 14px',
                            fontSize: '13px'
                          }}
                        >
                          {Object.entries(GATEWAY_FORM_SCHEMAS).map(([value, option]) => (
                            <option key={value} value={value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label style={{ display: 'grid', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Gateway label</span>
                        <input
                          value={draft.label}
                          onChange={(event) => updateGatewayDraft(draft.id, { label: event.target.value })}
                          placeholder={schema.label}
                          style={{
                            width: '100%',
                            borderRadius: '10px',
                            border: '1px solid var(--border-input)',
                            background: 'var(--bg-card)',
                            color: 'var(--text-primary)',
                            padding: '12px 14px',
                            fontSize: '13px'
                          }}
                        />
                      </label>

                      {schema.fields.length === 0 && (
                        <div style={{ fontSize: '12px', color: '#22c55e', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: '10px', padding: '10px 12px', lineHeight: 1.5 }}>
                          Stripe status is fetched and shows current health plus scheduled maintenance.
                        </div>
                      )}

                      <div style={{ display: 'grid', gap: '12px' }}>
                        {schema.fields.map((field) => (
                          <label key={field.id} style={{ display: 'grid', gap: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{field.label}</span>
                            <input
                              value={draft.fields[field.id] || ''}
                              onChange={(event) => updateGatewayDraftField(draft.id, field.id, event.target.value)}
                              placeholder={field.placeholder}
                              type={field.type}
                              autoComplete="off"
                              style={{
                                width: '100%',
                                borderRadius: '10px',
                                border: '1px solid var(--border-input)',
                                background: 'var(--bg-card)',
                                color: 'var(--text-primary)',
                                padding: '12px 14px',
                                fontSize: '13px'
                              }}
                            />
                            {field.helper && (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{field.helper}</span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {gatewayConfigError && (
                <div style={{ fontSize: '12px', color: '#fb7185', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.18)', borderRadius: '10px', padding: '10px 12px' }}>
                  {gatewayConfigError}
                </div>
              )}

              {gatewayConfigSuccess && (
                <div style={{ fontSize: '12px', color: '#22c55e', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: '10px', padding: '10px 12px' }}>
                  {gatewayConfigSuccess}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '4px' }}>
                <button
                  type="button"
                  onClick={closeGatewayConfig}
                  style={{
                    borderRadius: '10px',
                    border: '1px solid var(--border-card)',
                    background: 'var(--bg-card)',
                    padding: '10px 14px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={gatewayConfigSaving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderRadius: '10px',
                    border: '1px solid rgba(96,165,250,0.2)',
                    background: gatewayConfigSaving ? '#1d4ed8' : '#2563EB',
                    padding: '10px 14px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#fff',
                    cursor: gatewayConfigSaving ? 'not-allowed' : 'pointer',
                    opacity: gatewayConfigSaving ? 0.85 : 1
                  }}
                >
                  {gatewayConfigSaving ? 'Saving...' : 'Save gateways'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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