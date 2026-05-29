'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Map,
  ZapOff,
  MousePointerClick,
  AlertCircle,
  ShoppingBag,
  TrendingUp,
  Filter,
  History,
  RefreshCw,
  ArrowDown,
  AlertTriangle,
  ChevronDown
} from 'lucide-react';
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
  padding: '24px',
  overflow: 'visible'
};

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

      const res = await apiFetch(`/api/v1/dashboard/customers/intelligence?siteId=${projectId}`);
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
  }, [apiFetch, projectId, token]);

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

    const loadKey = `${projectId}:${token}`;

    if (initialLoadKeyRef.current === loadKey) {
      return;
    }

    initialLoadKeyRef.current = loadKey;
    loadData();
  }, [loadData, projectId, token]);

  useEffect(() => {
    if (expandedGatewayId !== undefined) {
      return;
    }

    if (paymentGateways.length > 0) {
      setExpandedGatewayId(`${paymentGateways[0].configId}-${paymentGateways[0].gatewayName}`);
    }
  }, [expandedGatewayId, paymentGateways]);

  const isPageRestricted = allowedPageKeys !== null && !allowedPageKeys.includes('observability/journeys');

  const firstStep = funnelSteps[0]?.count || 1;
  const lastStep = funnelSteps[funnelSteps.length - 1]?.count || 0;
  const completion = firstStep > 0 ? ((lastStep / firstStep) * 100).toFixed(2) : '0.00';
  const frictionSignals = funnelSteps.filter((s) => s.dropRate > 50).length;
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

  const metricCards = useMemo(
    () => [
      {
        label: 'Completion Rate',
        value: `${completion}%`,
        badge: 'End-to-end conversion',
        icon: ShoppingBag
      },
      {
        label: 'Total Visitors',
        value: firstStep.toLocaleString(),
        badge: 'Entered first stage',
        icon: TrendingUp
      },
      {
        label: 'Journey Drop-offs',
        value: (firstStep - lastStep).toLocaleString(),
        badge: 'Exited before completion',
        icon: ZapOff
      },
      {
        label: 'Friction Signals',
        value: `${frictionSignals} stages`,
        badge: 'High-loss stage count',
        icon: MousePointerClick
      }
    ],
    [completion, firstStep, frictionSignals, lastStep]
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
        <div style={{ marginBottom: '8px', overflow: 'visible' }}>
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

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
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
            gap: '20px',
            overflow: 'visible'
          }}
        >
          {metricCards.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
                style={{
                  borderRadius: '12px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '140px',
                  overflow: 'visible'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-label)',
                      fontWeight: 500
                    }}
                  >
                    {metric.label}
                  </span>
                  <Icon style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
                </div>
                <div style={{ fontSize: '38px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1, padding: '8px 0' }}>{metric.value}</div>
                <div style={{ marginTop: '12px' }}>
                  <span style={{ fontSize: '12px', color: '#22c55e' }}>{metric.badge}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Payment Gateway Status
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
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
            <span style={{ fontSize: '11px', color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Sync summary
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: gatewayHealth.tone }}>{gatewayHealth.label}</span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.7fr) minmax(320px, 1fr)',
            gap: '20px',
            overflow: 'visible'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'visible', minWidth: 0 }}>
            {funnelSteps.length === 0 ? (
              <div style={{ ...cardStyle, minHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>No funnel data available. Ingest customer events to begin.</p>
              </div>
            ) : (
              <div style={cardStyle}>
                <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Purchase Journey Funnel
                </div>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    border: '1px solid var(--border-input)',
                    color: 'var(--text-muted)',
                    marginBottom: '20px',
                    display: 'inline-block',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Live Analysis (Project Scope)
                </span>

                <div style={{ overflow: 'visible' }}>
                  {funnelSteps.map((step, idx) => {
                    const widthPct = firstStep > 0 ? Math.min(100, Math.max(0, (step.count / firstStep) * 100)) : 0;
                    const technicalPct = step.count > 0 ? Math.min(100, Math.max(0, (step.technicalDropCount / step.count) * 100)) : 0;

                    return (
                      <div key={step.label} style={{ marginBottom: idx === funnelSteps.length - 1 ? '0' : '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{step.label}</span>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{step.count.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-label)', textTransform: 'uppercase' }}>Users</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-label)', textTransform: 'uppercase' }}>
                            {idx > 0 ? `${step.dropRate}% drop-off` : 'Entry stage'}
                          </span>
                        </div>
                        <div
                          style={{
                            height: '10px',
                            borderRadius: '999px',
                            background: 'var(--bg-input)',
                            overflow: 'hidden',
                            position: 'relative'
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.max(6, widthPct)}%`,
                              height: '100%',
                              borderRadius: '999px',
                              background: 'linear-gradient(90deg, #60a5fa 0%, #22c55e 100%)'
                            }}
                          />
                          {step.technicalDropCount > 0 && (
                            <div
                              style={{
                                position: 'absolute',
                                right: 0,
                                top: 0,
                                width: `${technicalPct}%`,
                                height: '100%',
                                borderRadius: '999px',
                                background: 'rgba(248,113,113,0.55)'
                              }}
                            />
                          )}
                        </div>
                        {idx > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', color: 'var(--text-label)' }}>
                            <ArrowDown style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                            <span style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                              {step.dropRate}% lost from previous stage
                            </span>
                            {step.dropRate > 50 && <AlertTriangle style={{ width: '16px', height: '16px', flexShrink: 0, color: '#f59e0b' }} />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-card)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div
                    style={{
                      borderRadius: '12px',
                      border: '1px solid rgba(34,197,94,0.15)',
                      background: 'rgba(34,197,94,0.06)',
                      padding: '16px',
                      overflow: 'visible'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <TrendingUp style={{ width: '16px', height: '16px', color: '#22c55e' }} />
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)' }}>
                        Conversion Rate
                      </span>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 500, color: '#22c55e' }}>{completion}%</div>
                  </div>
                  <div
                    style={{
                      borderRadius: '12px',
                      border: '1px solid rgba(248,113,113,0.15)',
                      background: 'rgba(248,113,113,0.06)',
                      padding: '16px',
                      overflow: 'visible'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <AlertTriangle style={{ width: '16px', height: '16px', color: '#f87171' }} />
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)' }}>
                        Technical Loss
                      </span>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 500, color: '#f87171' }}>0.8%</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'visible' }}>
            <div style={cardStyle}>
              <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', marginBottom: '20px' }}>
                Abandonment Attribution
              </div>
              {[
                { label: 'Network/API Failure', value: '35%', color: '#f43f5e' },
                { label: 'UX Friction (Rage Click)', value: '24%', color: '#a855f7' },
                { label: 'Performance (Slow Load)', value: '18%', color: '#f59e0b' },
                { label: 'Other / Intent-based', value: '23%', color: '#334155' }
              ].map((attr, idx, arr) => (
                <div
                  key={attr.label}
                  style={{
                    padding: '14px 0',
                    borderBottom: idx === arr.length - 1 ? 'none' : '1px solid var(--border-card)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{attr.label}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{attr.value}</span>
                  </div>
                  <div style={{ height: '8px', width: '100%', background: 'var(--bg-input)', borderRadius: '999px' }}>
                    <div style={{ height: '100%', width: attr.value, background: attr.color, borderRadius: '999px' }} />
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                ...cardStyle,
                background: 'rgba(79,70,229,0.08)',
                border: '1px solid rgba(129,140,248,0.3)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <AlertCircle style={{ width: '16px', height: '16px', color: '#818cf8', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 5px' }}>Intelligence Insight</p>
                  <p
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      lineHeight: 1.6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      margin: '0 0 8px'
                    }}
                  >
                    Checkout drop-offs increased by 12% in the last hour. Correlation signals suggest a link to Stripe Payment gateway latency spikes.
                  </p>
                  <button
                    style={{
                      fontSize: '11px',
                      color: '#60a5fa',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    Investigate Cause
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '20px',
            overflow: 'visible'
          }}
        >
          {[
            {
              label: 'Broken CTAs',
              value: '12',
              note: 'Buttons with no response detected',
              icon: ZapOff,
              iconColor: '#f87171',
              iconBg: 'rgba(244,63,94,0.12)'
            },
            {
              label: 'Rage Click Spots',
              value: '5',
              note: 'High friction zones identified',
              icon: MousePointerClick,
              iconColor: '#c084fc',
              iconBg: 'rgba(168,85,247,0.12)'
            },
            {
              label: 'Stalled Journeys',
              value: `${funnelSteps.filter((s) => s.dropRate > 50).length * 24 || 0}`,
              note: 'Users currently waiting > 30s',
              icon: TrendingUp,
              iconColor: '#fbbf24',
              iconBg: 'rgba(245,158,11,0.12)'
            }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ padding: '8px', borderRadius: '8px', background: item.iconBg }}>
                    <Icon style={{ width: '16px', height: '16px', color: item.iconColor }} />
                  </div>
                  <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                    {item.label}
                  </h4>
                </div>
                <div style={{ fontSize: '36px', lineHeight: 1, fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>{item.value}</div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>{item.note}</p>
              </div>
            );
          })}
        </div>

        {intelligence?.generatedAt && (
          <div style={{ fontSize: '11px', color: 'var(--text-label)' }}>
            Last intelligence refresh: {new Date(intelligence.generatedAt).toLocaleString()}
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
