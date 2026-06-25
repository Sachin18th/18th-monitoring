'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AlertTriangle, ArrowRight, ChevronDown, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const cardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '20px',
  overflow: 'visible',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.03)',
};

const C = {
  amber: '#f59e0b',
  amberBg: 'rgba(245,158,11,0.10)',
  amberBorder: 'rgba(245,158,11,0.30)',
};

const sectionTitleStyle: React.CSSProperties = { fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 };
const sectionSubStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' };

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

interface PaymentGatewayPanelProps {
  projectId: string;
}

export function PaymentGatewayPanel({ projectId }: PaymentGatewayPanelProps) {
  const { apiFetch, token } = useAuth();
  const gatewayStorageKey = useMemo(() => (projectId ? `journeys-payment-gateways:${projectId}` : null), [projectId]);

  const [paymentGateways, setPaymentGateways] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGatewayConfigOpen, setIsGatewayConfigOpen] = useState(false);
  const [gatewayConfigSaving, setGatewayConfigSaving] = useState(false);
  const [gatewayConfigError, setGatewayConfigError] = useState<string | null>(null);
  const [gatewayConfigSuccess, setGatewayConfigSuccess] = useState<string | null>(null);
  const [gatewayDrafts, setGatewayDrafts] = useState<GatewayDraft[]>([createGatewayDraft('razorpay')]);
  const [expandedGatewayId, setExpandedGatewayId] = useState<string | null>(null);
  const expandedInitRef = useRef(false);

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

  const loadGateways = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/dashboard/customers/payment-gateways?siteId=${projectId}`);
      setPaymentGateways(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('[PaymentGateways] Load failed', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId, token]);

  useEffect(() => {
    loadGateways();
  }, [loadGateways]);

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
      await loadGateways();
      setIsGatewayConfigOpen(false);
    } catch (err: any) {
      setGatewayConfigError(err?.message || 'Failed to save payment gateway configuration.');
    } finally {
      setGatewayConfigSaving(false);
    }
  }, [apiFetch, gatewayDrafts, loadGateways, persistGatewayDrafts, projectId]);

  useEffect(() => {
    if (expandedInitRef.current) {
      return;
    }

    if (paymentGateways.length > 0) {
      expandedInitRef.current = true;
      setExpandedGatewayId(`${paymentGateways[0].configId}-${paymentGateways[0].gatewayName}`);
    }
  }, [paymentGateways]);

  const gatewayHealth = useMemo(() => {
    if (!paymentGateways.length) {
      return {
        label: 'No configured gateways',
        tone: 'var(--text-muted)',
        toneBg: 'rgba(148,163,184,0.15)',
        filled: 0
      };
    }

    const downCount = paymentGateways.filter((gateway) => gateway.status === 'DOWN').length;
    const degradedCount = paymentGateways.filter((gateway) => gateway.status === 'DEGRADED').length;

    if (downCount > 0) {
      return {
        label: `${downCount} gateway${downCount > 1 ? 's' : ''} down`,
        tone: 'var(--error-text, #b91c1c)',
        toneBg: 'var(--error-bg, rgba(239,68,68,0.14))',
        filled: downCount
      };
    }

    if (degradedCount > 0) {
      return {
        label: `${degradedCount} gateway${degradedCount > 1 ? 's' : ''} degraded`,
        tone: 'var(--warning-text, #92400e)',
        toneBg: 'var(--warning-bg, rgba(245,158,11,0.18))',
        filled: degradedCount
      };
    }

    return {
      label: 'All configured gateways up',
      tone: 'var(--success-text, #15803d)',
      toneBg: 'var(--success-bg, rgba(34,197,94,0.14))',
      filled: paymentGateways.length
    };
  }, [paymentGateways]);

  return (
    <>
      {loading && paymentGateways.length === 0 ? (
        <div
          style={{
            ...cardStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '40px 22px',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}
        >
          <span
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '999px',
              border: '2px solid var(--border-card)',
              borderTopColor: '#3b82f6',
              animation: 'spin 1s linear infinite',
              flexShrink: 0,
            }}
          />
          Checking payment gateways…
        </div>
      ) : paymentGateways.length === 0 ? (
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
                No payment gateway is configured for this project. Connect a gateway to monitor its API health and
                surface scheduled maintenance or outages.
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={loadGateways}
              disabled={loading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                border: '1px solid var(--border-card)',
                background: 'transparent',
                color: 'var(--text-primary)',
                borderRadius: '8px',
                padding: '7px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
                whiteSpace: 'nowrap'
              }}
            >
              <RefreshCw style={{ width: '13px', height: '13px', flexShrink: 0, animation: loading ? 'spin 1s linear infinite' : undefined }} />
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={openGatewayConfig}
              style={{
                border: '1px solid var(--border-card)',
                background: 'transparent',
                color: 'var(--text-primary)',
                borderRadius: '8px',
                padding: '7px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Manage Gateways
            </button>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                border: '1px solid transparent',
                color: gatewayHealth.tone,
                background: gatewayHealth.toneBg,
                whiteSpace: 'nowrap'
              }}
            >
              Refresh synced
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {paymentGateways.map((gateway) => {
            const gatewayId = `${gateway.configId}-${gateway.gatewayName}`;
            const isExpanded = expandedGatewayId === gatewayId;
            const statusStyle = gateway.status === 'DOWN'
              ? { text: 'var(--error-text, #b91c1c)', bg: 'var(--error-bg, rgba(239,68,68,0.14))' }
              : gateway.status === 'DEGRADED'
                ? { text: 'var(--warning-text, #92400e)', bg: 'var(--warning-bg, rgba(245,158,11,0.18))' }
                : gateway.status === 'UP'
                  ? { text: 'var(--success-text, #15803d)', bg: 'var(--success-bg, rgba(34,197,94,0.14))' }
                  : { text: 'var(--text-muted)', bg: 'rgba(148,163,184,0.15)' };
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
                        padding: '3px 9px',
                        borderRadius: '999px',
                        fontSize: '9px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        border: '1px solid transparent',
                        color: statusStyle.text,
                        background: statusStyle.bg
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

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  <span>Active downtimes</span>
                  <span style={{ fontWeight: 700, color: dedupedDowntimes.length > 0 ? 'var(--error-text, #b91c1c)' : 'var(--text-primary)' }}>{dedupedDowntimes.length}</span>
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
      </div>
      )}

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
    </>
  );
}

export default PaymentGatewayPanel;
